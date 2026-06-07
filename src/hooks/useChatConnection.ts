import { useState, useEffect, useRef, useCallback } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { Room, ChatMessage } from '../types';

interface SignalingMessage {
  fromId: string;
  type: 'offer' | 'answer' | 'ice';
  data: any;
}

interface DataChannelMessage {
  type: 'room_update' | 'chat_message';
  room?: Room;
  message?: ChatMessage;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

export function useChatConnection(roomId: string, userName: string, isHost: boolean, password?: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const mqttClientRef = useRef<MqttClient | null>(null);
  const myId = useRef(Math.random().toString(36).substring(2, 11)).current;
  
  // Refs to maintain state for callbacks without stale closures
  const roomRef = useRef<Room | null>(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  // Host: Map of userId -> connection
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());

  // User: Single connection to host
  const userPeerConnection = useRef<RTCPeerConnection | null>(null);
  const userDataChannel = useRef<RTCDataChannel | null>(null);

  // MQTT Close Timer
  const mqttCloseTimer = useRef<NodeJS.Timeout | null>(null);

  const broadcastRoom = useCallback((updatedRoom: Room) => {
    const payload = JSON.stringify({ type: 'room_update', room: updatedRoom });
    dataChannels.current.forEach((dc) => {
      if (dc.readyState === 'open') {
        dc.send(payload);
      }
    });
  }, []);

  const setupDataChannel = useCallback((dc: RTCDataChannel, remoteId: string) => {
    dc.onopen = () => {
      console.log(`DataChannel open with ${remoteId}`);
      setStatus('connected');

      // If host, send initial room state
      if (isHost && roomRef.current) {
        dc.send(JSON.stringify({ type: 'room_update', room: roomRef.current }));
      }

      // Automatically close MQTT connection 10 seconds after WebRTC is established
      if (!mqttCloseTimer.current) {
        mqttCloseTimer.current = setTimeout(() => {
          if (mqttClientRef.current) {
            mqttClientRef.current.end();
            mqttClientRef.current = null;
            console.log('MQTT connection closed (10s after WebRTC establishment)');
          }
        }, 10000);
      }
    };

    dc.onmessage = (event) => {
      try {
        const msg: DataChannelMessage = JSON.parse(event.data);
        if (msg.type === 'room_update' && msg.room) {
          setRoom(msg.room);
        } else if (msg.type === 'chat_message' && msg.message && isHost) {
          // Host acts as authority: add message, update room, broadcast
          setRoom((prev) => {
            if (!prev) return null;
            const updated: Room = {
              ...prev,
              chats: [...prev.chats, msg.message!],
              updatedAt: Date.now(),
            };
            broadcastRoom(updated);
            return updated;
          });
        }
      } catch (err) {
        console.error('Failed to process DataChannel message:', err);
      }
    };

    dc.onclose = () => {
      console.log(`DataChannel closed with ${remoteId}`);
      if (isHost) {
        dataChannels.current.delete(remoteId);
        peerConnections.current.delete(remoteId);
      } else {
        setStatus('error');
        setError('與房主的連線已中斷');
      }
    };
  }, [isHost, broadcastRoom]);

  // Host: Initialize room
  useEffect(() => {
    if (isHost && !room && roomId && userName) {
      setRoom({
        code: roomId,
        hostToken: Math.random().toString(36).substring(2, 15),
        hostName: userName,
        password: password, // Store password if provided
        chats: [],
        pinnedIds: [],
        announcement: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }, [isHost, roomId, userName, room, password]);

  // Signaling logic
  useEffect(() => {
    if (!roomId || !userName) return;

    setStatus('connecting');
    const client = mqtt.connect('wss://broker.emqx.io:8084/mqtt');
    mqttClientRef.current = client;

    const joinTopic = `luna/chat/${roomId}/join`;
    const mySignalTopic = `luna/chat/${roomId}/signal/${myId}`;

    client.on('connect', () => {
      client.subscribe(mySignalTopic);
      if (isHost) {
        client.subscribe(joinTopic);
      } else {
        client.publish(joinTopic, JSON.stringify({ userId: myId, userName, password }));
      }
    });

    client.on('message', async (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());

        if (topic === joinTopic && isHost) {
          const { userId, password: userProvidedPassword } = payload;
          
          // Verify password
          if (roomRef.current?.password && roomRef.current.password !== userProvidedPassword) {
            mqttClientRef.current?.publish(
              `luna/chat/${roomId}/signal/${userId}`,
              JSON.stringify({ fromId: myId, type: 'error', data: '密碼錯誤' })
            );
            return;
          }

          if (!peerConnections.current.has(userId)) {
            // Host: Initiate WebRTC connection
            const pc = new RTCPeerConnection(RTC_CONFIG);
            peerConnections.current.set(userId, pc);

            const dc = pc.createDataChannel('chat');
            dataChannels.current.set(userId, dc);
            setupDataChannel(dc, userId);

            pc.onicecandidate = (event) => {
              if (event.candidate) {
                mqttClientRef.current?.publish(
                  `luna/chat/${roomId}/signal/${userId}`,
                  JSON.stringify({ fromId: myId, type: 'ice', data: event.candidate })
                );
              }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            mqttClientRef.current?.publish(
              `luna/chat/${roomId}/signal/${userId}`,
              JSON.stringify({ fromId: myId, type: 'offer', data: offer })
            );
          }
        } else if (topic === mySignalTopic) {
          const { fromId, type, data } = payload as SignalingMessage | { fromId: string, type: 'error', data: string };
          
          if (type === 'error') {
            setError(data);
            setStatus('error');
            return;
          }

          if (type === 'offer' && !isHost) {
            // User: Handle Offer
            const pc = new RTCPeerConnection(RTC_CONFIG);
            userPeerConnection.current = pc;

            pc.onicecandidate = (event) => {
              if (event.candidate) {
                mqttClientRef.current?.publish(
                  `luna/chat/${roomId}/signal/${fromId}`,
                  JSON.stringify({ fromId: myId, type: 'ice', data: event.candidate })
                );
              }
            };

            pc.ondatachannel = (event) => {
              userDataChannel.current = event.channel;
              setupDataChannel(event.channel, fromId);
            };

            await pc.setRemoteDescription(new RTCSessionDescription(data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            mqttClientRef.current?.publish(
              `luna/chat/${roomId}/signal/${fromId}`,
              JSON.stringify({ fromId: myId, type: 'answer', data: answer })
            );
          } else if (type === 'answer') {
            const pc = isHost ? peerConnections.current.get(fromId) : userPeerConnection.current;
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(data));
            }
          } else if (type === 'ice') {
            const pc = isHost ? peerConnections.current.get(fromId) : userPeerConnection.current;
            if (pc) {
              await pc.addIceCandidate(new RTCIceCandidate(data));
            }
          }
        }
      } catch (err) {
        console.error('MQTT Message handling error:', err);
      }
    });

    client.on('error', (err) => {
      setError(`MQTT 連線錯誤: ${err.message}`);
      setStatus('error');
    });

    return () => {
      if (mqttClientRef.current) mqttClientRef.current.end();
      if (mqttCloseTimer.current) clearTimeout(mqttCloseTimer.current);
      peerConnections.current.forEach(pc => pc.close());
      if (userPeerConnection.current) userPeerConnection.current.close();
    };
  }, [roomId, isHost, userName, myId, setupDataChannel, password]);

  const sendChatMessage = useCallback((text: string, imageUrl?: string, isSpeech?: boolean) => {
    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substring(2, 11),
      user: userName,
      role: isHost ? 'host' : 'user',
      text,
      imageUrl,
      timestamp: Date.now(),
      isSpeech,
    };

    if (isHost) {
      setRoom((prev) => {
        if (!prev) return null;
        const updated = {
          ...prev,
          chats: [...prev.chats, newMessage],
          updatedAt: Date.now(),
        };
        broadcastRoom(updated);
        return updated;
      });
    } else {
      if (userDataChannel.current?.readyState === 'open') {
        userDataChannel.current.send(JSON.stringify({ type: 'chat_message', message: newMessage }));
      }
    }
  }, [isHost, userName, broadcastRoom]);

  const updateAnnouncement = useCallback((announcement: string) => {
    if (!isHost) return;
    setRoom((prev) => {
      if (!prev) return null;
      const updated = { ...prev, announcement, updatedAt: Date.now() };
      broadcastRoom(updated);
      return updated;
    });
  }, [isHost, broadcastRoom]);

  const togglePin = useCallback((messageId: string) => {
    if (!isHost) return;
    setRoom((prev) => {
      if (!prev) return null;
      const isPinned = prev.pinnedIds.includes(messageId);
      const pinnedIds = isPinned
        ? prev.pinnedIds.filter((id) => id !== messageId)
        : [...prev.pinnedIds, messageId];
      const updated = { ...prev, pinnedIds, updatedAt: Date.now() };
      broadcastRoom(updated);
      return updated;
    });
  }, [isHost, broadcastRoom]);

  const restoreRoomState = useCallback((restoreData: Partial<Room>) => {
    if (!isHost) return;
    setRoom((prev) => {
      if (!prev) return null;
      const updated = {
        ...prev,
        ...restoreData,
        updatedAt: Date.now(),
      };
      broadcastRoom(updated);
      return updated;
    });
  }, [isHost, broadcastRoom]);

  return {
    room,
    sendChatMessage,
    updateAnnouncement,
    togglePin,
    restoreRoomState,
    status,
    error,
  };
}
