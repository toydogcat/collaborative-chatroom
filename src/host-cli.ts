import fs from 'fs';
import path from 'path';
import mqtt from 'mqtt';
import * as datachannel from 'node-datachannel';
import readline from 'readline';
import { Room, ChatMessage } from './types.js';

// Configuration
const RTC_CONFIG = {
  iceServers: ['stun:stun.l.google.com:19302']
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function broadcastRoom() {
  const payload = JSON.stringify({ type: 'room_update', room });
  dataChannels.forEach((dc) => {
    if (dc.isOpen()) {
      dc.sendMessage(payload);
    }
  });
}

function logMessage(user: string, text: string) {
  console.log(`\n[${new Date().toLocaleTimeString()}] ${user}: ${text}`);
  rl.prompt(true);
}

let room: Room;
const peerConnections = new Map<string, datachannel.PeerConnection>();
const dataChannels = new Map<string, datachannel.DataChannel>();
const myId = 'node_host_' + Math.random().toString(36).substring(2, 7);

// Parse options & arguments
let roomId = '';
let mqttServerUrl = 'wss://broker.emqx.io:8084/mqtt';
let roomPassword = '';
let announcementPath = '';

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--room' || arg === '-r') {
    roomId = args[++i];
  } else if (arg === '--mqtt' || arg === '-m') {
    mqttServerUrl = args[++i];
  } else if (arg === '--pass' || arg === '-p') {
    roomPassword = args[++i];
  } else if (arg === '--announce' || arg === '-a') {
    announcementPath = args[++i];
  } else if (arg.startsWith('--room=')) {
    roomId = arg.split('=')[1];
  } else if (arg.startsWith('--mqtt=')) {
    mqttServerUrl = arg.split('=')[1];
  } else if (arg.startsWith('--pass=')) {
    roomPassword = arg.split('=')[1];
  } else if (arg.startsWith('--announce=')) {
    announcementPath = arg.split('=')[1];
  } else {
    // Legacy fallback positional logic
    if (arg.endsWith('.md')) {
      announcementPath = arg;
    } else {
      roomPassword = arg;
    }
  }
}

if (!roomId) {
  roomId = generateRoomId();
} else {
  // Validate custom room code (4-20 alphanumeric characters)
  roomId = roomId.toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(roomId)) {
    console.error(`\n❌ Error: Custom Room ID "${roomId}" must be 4 to 20 alphanumeric characters.`);
    process.exit(1);
  }
}

const mqttClient = mqtt.connect(mqttServerUrl);

let announcementText = 'Welcome to the Node.js CLI Host!';
if (announcementPath) {
  try {
    const resolvedPath = path.resolve(announcementPath);
    if (fs.existsSync(resolvedPath)) {
      announcementText = fs.readFileSync(resolvedPath, 'utf-8');
      console.log(`📖 Loaded announcement from: ${announcementPath}`);
    } else {
      console.error(`⚠️ Announcement file not found at: ${resolvedPath}`);
    }
  } catch (e: any) {
    console.error(`⚠️ Failed to read announcement file: ${e.message}`);
  }
}

room = {
  code: roomId,
  hostToken: 'node_secret_' + Math.random().toString(36).substring(2, 10),
  hostName: 'Terminal Host',
  password: roomPassword,
  chats: [],
  pinnedIds: [],
  announcement: announcementText,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

console.log(`\n🚀 Collaborative Chatroom Node.js Host Started`);
console.log(`-----------------------------------------------`);
console.log(`🏠 Room ID: ${roomId}`);
console.log(`📡 Signal Server: ${mqttServerUrl}`);
console.log(`👤 Host Name: ${room.hostName}`);
if (room.password) {
  console.log(`🔒 Room Password: ${room.password}`);
} else {
  console.log(`🔓 Room Password: (None)`);
}
console.log(`-----------------------------------------------`);
console.log(`🔗 Quick Join Link:`);
console.log(`  http://localhost:5173/?joinCode=${roomId}&mqttServer=${encodeURIComponent(mqttServerUrl)}`);
console.log(`-----------------------------------------------`);
console.log(`Type any message to send, or use commands:`);
console.log(`  /announce <text>  - Update room announcement`);
console.log(`  /quit             - Close the room and exit`);
console.log(`-----------------------------------------------\n`);

rl.prompt();

mqttClient.on('connect', () => {
  const joinTopic = `luna/chat/${roomId}/join`;
  const mySignalTopic = `luna/chat/${roomId}/signal/${myId}`;
  
  mqttClient.subscribe(joinTopic);
  mqttClient.subscribe(mySignalTopic);
  
  console.log(`📡 Connected to MQTT Signaling Broker`);
  rl.prompt(true);
});

mqttClient.on('message', async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const joinTopic = `luna/chat/${roomId}/join`;

    if (topic === joinTopic) {
      const { userId, userName, password: userProvidedPassword } = payload;
      
      // Verify password
      if (room.password && room.password !== userProvidedPassword) {
        console.log(`\n❌ Join denied (wrong password): ${userName} (${userId})`);
        mqttClient.publish(
          `luna/chat/${roomId}/signal/${userId}`,
          JSON.stringify({ fromId: myId, type: 'error', data: '密碼錯誤' })
        );
        return;
      }

      if (!peerConnections.has(userId)) {
        console.log(`\n🔔 New join request from: ${userName} (${userId})`);
        
        const pc = new datachannel.PeerConnection(userId, { iceServers: RTC_CONFIG.iceServers });
        peerConnections.set(userId, pc);

        // Set signaling callbacks before creating data channel
        pc.onLocalCandidate((candidate, mid) => {
          mqttClient.publish(
            `luna/chat/${roomId}/signal/${userId}`,
            JSON.stringify({ 
              fromId: myId, 
              type: 'ice', 
              data: { 
                candidate, 
                sdpMid: mid,
                sdpMLineIndex: 0 // Most browser clients expect this
              } 
            })
          );
        });

        pc.onLocalDescription((sdp, type) => {
          mqttClient.publish(
            `luna/chat/${roomId}/signal/${userId}`,
            JSON.stringify({ fromId: myId, type: type, data: { sdp, type } })
          );
        });

        pc.onStateChange((state) => {
          console.log(`\nℹ️ Connection state with ${userName}: ${state}`);
          if (state === 'closed' || state === 'failed') {
            peerConnections.delete(userId);
            dataChannels.delete(userId);
          }
          rl.prompt(true);
        });

        // Create the data channel
        const dc = pc.createDataChannel('chat');
        dataChannels.set(userId, dc);

        dc.onOpen(() => {
          console.log(`\n✅ P2P DataChannel established with ${userName}`);
          dc.sendMessage(JSON.stringify({ type: 'room_update', room }));
          rl.prompt(true);
        });

        dc.onMessage((msg) => {
          try {
            const data = JSON.parse(msg.toString());
            if (data.type === 'chat_message' && data.message) {
              const chatMsg: ChatMessage = data.message;
              room.chats.push(chatMsg);
              room.updatedAt = Date.now();
              broadcastRoom();
              logMessage(chatMsg.user, chatMsg.text);
            }
          } catch (e) {
            console.error('DataChannel parse error:', e);
          }
        });

        // Explicitly trigger the Offer
        pc.setLocalDescription('offer');
      }
    } else if (topic.includes('signal')) {
      const { fromId, type, data } = payload;
      const pc = peerConnections.get(fromId);
      if (pc) {
        if (type === 'answer') {
          pc.setRemoteDescription(data.sdp, type);
        } else if (type === 'ice') {
          // data can be { candidate, sdpMid, sdpMLineIndex }
          pc.addRemoteCandidate(data.candidate, data.sdpMid);
        }
      }
    }
  } catch (err) {
    console.error('MQTT handling error:', err);
  }
});

rl.on('line', (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  if (input === '/quit') {
    console.log('Stopping host...');
    mqttClient.end();
    peerConnections.forEach(pc => pc.close());
    datachannel.cleanup();
    process.exit(0);
  }

  if (input.startsWith('/announce ')) {
    const announce = input.slice(10);
    room.announcement = announce;
    room.updatedAt = Date.now();
    broadcastRoom();
    console.log(`\n📢 Announcement updated: ${announce}`);
    rl.prompt();
    return;
  }

  // Send as host message
  const newMessage: ChatMessage = {
    id: Math.random().toString(36).substring(2, 11),
    user: room.hostName,
    role: 'host',
    text: input,
    timestamp: Date.now(),
  };

  room.chats.push(newMessage);
  room.updatedAt = Date.now();
  broadcastRoom();
  logMessage(room.hostName, input);
});
