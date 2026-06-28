/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  MessageSquare, 
  Settings, 
  Image as ImageIcon, 
  Send, 
  Pin, 
  Plus, 
  LogOut, 
  AlertCircle,
  Copy,
  Check,
  Megaphone,
  User,
  Crown,
  FileArchive,
  Volume2,
  Trash2,
  Lock,
  ArrowRight,
  Camera,
  RefreshCw
} from 'lucide-react';
import Markdown from 'react-markdown';

import { ChatMessage, Room } from './types.js';
import AudioSpeechInput from './components/AudioSpeechInput.tsx';
import QRCodeView from './components/QRCodeView.tsx';
import MarkdownEditor from './components/MarkdownEditor.tsx';
import ZipManager from './components/ZipManager.tsx';
import LinkPreview from './components/LinkPreview.tsx';
import CameraQRScanner from './components/CameraQRScanner.tsx';
import { useChatConnection } from './hooks/useChatConnection.ts';

const MQTT_SERVERS = [
  { name: 'EMQX (默認)', url: 'wss://broker.emqx.io:8084/mqtt' },
  { name: 'HiveMQ', url: 'wss://broker.hivemq.com:8884/mqtt' },
  { name: 'Mosquitto', url: 'wss://test.mosquitto.org:8081/mqtt' },
  { name: 'Eclipse', url: 'wss://mqtt.eclipseprojects.io:443/mqtt' },
  { name: '自訂伺服器', url: 'custom' }
];

export default function App() {
  // Authentication & session state
  const [userName, setUserName] = useState('guest');
  const [hostNameInput, setHostNameInput] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomPasswordInput, setRoomPasswordInput] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [shouldConnect, setShouldConnect] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [selectedMqttServer, setSelectedMqttServer] = useState('wss://broker.emqx.io:8084/mqtt');
  const [customMqttServer, setCustomMqttServer] = useState('');
  const [roomCodeType, setRoomCodeType] = useState<'random' | 'custom'>('random');
  const [customRoomCode, setCustomRoomCode] = useState('');

  // ... (rest of the state and hooks) ...
  const connectionRoomId = useRef<string>('');
  const connectionUserName = useRef<string>('');
  const connectionPassword = useRef<string>('');

  const activeMqttServer = selectedMqttServer === 'custom' ? customMqttServer.trim() : selectedMqttServer;

  // Use the new serverless P2P hook
  const {
    room,
    sendChatMessage,
    updateAnnouncement,
    togglePin,
    restoreRoomState,
    status,
    error: connectionError,
    reconnect
  } = useChatConnection(
    shouldConnect ? connectionRoomId.current : '',
    shouldConnect ? connectionUserName.current : '',
    isHost,
    shouldConnect ? connectionPassword.current : '',
    shouldConnect ? activeMqttServer : undefined
  );

  // Derived states from room
  const currentUser = connectionUserName.current;
  const currentUserRole = isHost ? 'host' : 'user';

  // Interface state
  const [loginMode, setLoginMode] = useState<'join' | 'create'>('join');
  const [activeTab, setActiveTab] = useState<'chat' | 'control'>('chat');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Message inputs
  const [msgText, setMsgText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSpeechFlag, setIsSpeechFlag] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Status & copying indicators
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // File and message refs for UI quality
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync error messages from connection
  useEffect(() => {
    if (connectionError) setErrorMsg(connectionError);
  }, [connectionError]);

  // 1. Detect scan URL parameter on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('joinCode');
    const mqttServer = params.get('mqttServer');
    const password = params.get('password') || params.get('roomPassword');
    const nickname = params.get('nickname') || params.get('userName');

    if (nickname) {
      setUserName(nickname);
    } else {
      setUserName('guest');
    }

    if (password) {
      setRoomPasswordInput(password);
    }

    if (joinCode) {
      setRoomCodeInput(joinCode);
      setLoginMode('join');
      let successMessage = `已從掃描連結自動帶入房號: ${joinCode}`;
      if (mqttServer) {
        const isPredefined = MQTT_SERVERS.some(s => s.url === mqttServer);
        if (isPredefined) {
          setSelectedMqttServer(mqttServer);
        } else {
          setSelectedMqttServer('custom');
          setCustomMqttServer(mqttServer);
        }
        successMessage += `，伺服器: ${mqttServer}`;
      }
      if (password) {
        successMessage += `，已自動填入密碼`;
      }
      if (nickname) {
        successMessage += `，已自動填入暱稱: ${nickname}`;
      }
      setSuccessMsg(successMessage);
    }

    // Handshake with parent frame for scroll sync (Luna AI Hub requirement)
    const handleScroll = () => {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop;
      window.parent.postMessage({
        type: 'iframe_scroll',
        scrollY: currentScrollY,
        direction: 'up' // Direction detection can be added if needed
      }, '*');
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 1.5 Refresh Vercount on room change or login
  useEffect(() => {
    // When SPA route or state switches, manually notify Vercount to refresh counts
    if ((window as any).vercount && typeof (window as any).vercount.fetch === 'function') {
      (window as any).vercount.fetch();
    }
  }, [room?.code]);

  // 3. Auto-scroll to lowest message on updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.chats?.length]);

  // Handle Copy Message Content
  const handleCopyMessageText = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch((err) => {
      console.error('Failed to copy text:', err);
    });
  };

  // Handle Create Room
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostNameInput.trim()) {
      setErrorMsg('請輸入房主姓名');
      return;
    }
    if (selectedMqttServer === 'custom' && !customMqttServer.trim()) {
      setErrorMsg('請輸入自訂 MQTT 伺服器網址');
      return;
    }
    setErrorMsg(null);

    let newCode = '';
    if (roomCodeType === 'custom') {
      const code = customRoomCode.trim().toUpperCase();
      if (!code) {
        setErrorMsg('請輸入自訂房號');
        return;
      }
      if (!/^[A-Z0-9]{4,20}$/.test(code)) {
        setErrorMsg('自訂房號格式錯誤，僅能包含 4-20 位英文字母與數字');
        return;
      }
      newCode = code;
    } else {
      // Generate a random 8-character alphanumeric code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing characters
      for (let i = 0; i < 8; i++) {
        newCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    
    connectionRoomId.current = newCode;
    connectionUserName.current = hostNameInput.trim();
    connectionPassword.current = roomPasswordInput.trim();
    setIsHost(true);
    setShouldConnect(true);
    setActiveTab('chat');
  };

  // Handle Join Room
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const code = roomCodeInput.trim().toUpperCase();
    const user = userName.trim();
    const pass = roomPasswordInput.trim();

    if (!code) {
      setErrorMsg('請輸入房號');
      return;
    }
    if (!user) {
      setErrorMsg('請輸入您的聊天暱稱');
      return;
    }
    if (selectedMqttServer === 'custom' && !customMqttServer.trim()) {
      setErrorMsg('請輸入自訂 MQTT 伺服器網址');
      return;
    }

    connectionRoomId.current = code;
    connectionUserName.current = user;
    connectionPassword.current = pass;
    setIsHost(false);
    setShouldConnect(true);
    setActiveTab('chat');
  };

  // Convert image file to base64 string
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('僅支援上傳圖片格式');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('圖片大小不可超過 2MB');
      return;
    }

    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle drag-and-drop files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // Handle voice transcript arrival
  const handleSpeechTranscript = (transcript: string) => {
    setMsgText((prev) => (prev ? prev + ' ' + transcript : transcript));
    setIsSpeechFlag(true);
  };

  // Send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!room?.code || !currentUser) return;
    if (!msgText.trim() && !imagePreview) return;

    setIsSending(true);
    try {
      sendChatMessage(msgText.trim(), imagePreview || undefined, isSpeechFlag);
      
      // Success cleanup
      setMsgText('');
      setImagePreview(null);
      setIsSpeechFlag(false);
    } catch (err: any) {
      setErrorMsg(err.message || '發送失敗');
    } finally {
      setIsSending(false);
    }
  };

  // Host Announcement Saving
  const handleSaveAnnouncement = (markdown: string) => {
    if (!room?.code || !isHost) return;
    updateAnnouncement(markdown);
  };

  // Host Message Pinning toggle
  const handleTogglePin = (messageId: string, currentlyPinned: boolean) => {
    if (!room?.code || !isHost) return;
    togglePin(messageId);
  };

  // Host State Restore from ZIP files
  const handleRestoreState = async (restoreData: {
    chats?: ChatMessage[];
    pinnedIds?: string[];
    announcement?: string;
  }) => {
    if (!room?.code || !isHost) return;
    
    restoreRoomState(restoreData);
    setSuccessMsg("備份還原成功！已同步至所有連線用戶。");
  };

  const handleCopyCodeButton = () => {
    if (!room?.code) return;
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const getJoinUrl = () => {
    const password = room?.password || roomPasswordInput;
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const params = new URLSearchParams();
    if (room?.code) {
      params.set('joinCode', room.code);
    }
    if (activeMqttServer) {
      params.set('mqttServer', activeMqttServer);
    }
    if (password) {
      params.set('password', password);
    }
    params.set('nickname', 'guest');
    return `${baseUrl}?${params.toString()}`;
  };

  const handleCopyJoinLink = () => {
    const link = getJoinUrl();
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch((err) => {
      console.error('Failed to copy link:', err);
    });
  };

  const handleLeaveRoom = () => {
    setShouldConnect(false);
    setIsHost(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleScanSuccess = (decodedText: string) => {
    try {
      const url = new URL(decodedText);
      const code = url.searchParams.get('joinCode');
      const mqttServer = url.searchParams.get('mqttServer');
      const password = url.searchParams.get('password') || url.searchParams.get('roomPassword');
      const nickname = url.searchParams.get('nickname') || url.searchParams.get('userName');

      if (code) {
        setRoomCodeInput(code.toUpperCase());
        let msg = `掃描成功！已帶入房號: ${code.toUpperCase()}`;
        if (mqttServer) {
          const isPredefined = MQTT_SERVERS.some(s => s.url === mqttServer);
          if (isPredefined) {
            setSelectedMqttServer(mqttServer);
          } else {
            setSelectedMqttServer('custom');
            setCustomMqttServer(mqttServer);
          }
          msg += `，伺服器: ${mqttServer}`;
        }
        if (password) {
          setRoomPasswordInput(password);
          msg += `，已帶入密碼`;
        }
        if (nickname) {
          setUserName(nickname);
          msg += `，已帶入暱稱: ${nickname}`;
        }
        setSuccessMsg(msg);
      } else {
        // Try to see if the whole text is the code
        if (/^[A-Z0-9]{4,20}$/i.test(decodedText)) {
          setRoomCodeInput(decodedText.toUpperCase());
          setSuccessMsg(`掃描成功！已帶入房號: ${decodedText.toUpperCase()}`);
        } else {
          setErrorMsg('無法從掃描內容解析出有效的房號');
        }
      }
    } catch (e) {
      // Not a URL, check if it's an alphanumeric code
      if (/^[A-Z0-9]{4,20}$/i.test(decodedText)) {
        setRoomCodeInput(decodedText.toUpperCase());
        setSuccessMsg(`掃描成功！已帶入房號: ${decodedText.toUpperCase()}`);
      } else {
        setErrorMsg('無效的掃描內容');
      }
    }
    setIsScannerOpen(false);
  };

  // Helper to render MQTT server selection
  const renderMqttServerSelection = () => {
    return (
      <div className="space-y-1.5">
        <label htmlFor="mqtt-server-select" className="block text-xs font-semibold text-slate-400">
          訊號伺服器 (MQTT Server)
        </label>
        <select
          id="mqtt-server-select"
          value={selectedMqttServer}
          onChange={(e) => setSelectedMqttServer(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-150 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
        >
          {MQTT_SERVERS.map((server) => (
            <option key={server.url} value={server.url}>
              {server.name}
            </option>
          ))}
        </select>
        {selectedMqttServer === 'custom' && (
          <input
            type="text"
            placeholder="例如: wss://broker.hivemq.com:8884/mqtt"
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm font-mono text-slate-150 placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            value={customMqttServer}
            onChange={(e) => setCustomMqttServer(e.target.value)}
          />
        )}
      </div>
    );
  };

  // Filter pinned messages for quick rendering
  const pinnedMessages = room?.chats ? room.chats.filter((m) => room.pinnedIds.includes(m.id)) : [];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-100 antialiased select-none selection:bg-indigo-505 selection:text-white">
      {isScannerOpen && (
        <CameraQRScanner 
          onScanSuccess={handleScanSuccess} 
          onClose={() => setIsScannerOpen(false)} 
        />
      )}
      {/* 1. Header Banner */}
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-900 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-[0_0_15px_rgba(79,70,229,0.3)]">
              <MessageSquare id="app-logo-icon" className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight">
                聯手聊天室 <span className="text-[10px] bg-indigo-500/15 text-indigo-300 px-2 py-0.5 rounded-md ml-1 border border-indigo-500/25 font-bold font-mono">V2</span>
              </h1>
              <p className="text-[11px] text-slate-400">專屬房、掃碼登入、語音與備份還原</p>
            </div>
          </div>

          {room ? (
            <div className="flex items-center gap-4">
              {/* Room Code Display Badge */}
              <div className="hidden sm:flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-500 font-semibold font-mono">房號:</span>
                <span className="text-sm font-black text-indigo-400 font-mono tracking-wider">{room.code}</span>
                <button
                  type="button"
                  onClick={handleCopyCodeButton}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
                  title="複製房號"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Copy Full Join Link Badge */}
              <button
                type="button"
                onClick={handleCopyJoinLink}
                className="hidden sm:flex items-center gap-1.5 py-1.5 px-3 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                title="複製快速登入連結 (含房號、MQTT 伺服器、密碼與預設暱稱)"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>連結已複製</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>複製登入連結</span>
                  </>
                )}
              </button>

              {/* Leave Button */}
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="flex items-center gap-1 py-1.5 px-3 border border-red-500/30 hover:bg-red-500/10 text-red-400 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                title="離開當前房間"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">離開</span>
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* 2. Main Container */}
      <main className="flex-1 flex flex-col max-w-6xl w-full mx-auto p-4 justify-center">
        
        {/* Alerts & Messages notification box */}
        <AnimatePresence mode="popLayout">
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              id="error-block-alert"
              className="mb-4 bg-red-500/10 border border-red-500/20 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-red-450"
            >
              <AlertCircle className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">錯誤提示：</span>
                {errorMsg}
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="font-bold text-red-400 hover:text-red-300 text-sm px-1 leading-none cursor-pointer"
              >
                ×
              </button>
            </motion.div>
          )}

          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              id="success-block-alert"
              className="mb-4 bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-emerald-400"
            >
              <Check className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">{successMsg}</div>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                className="font-bold text-emerald-400 hover:text-emerald-300 text-sm px-1 leading-none cursor-pointer"
              >
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ================= STAGE 1: NOT LOGGED IN / ACCESS CONTROLS ================= */}
        {!room ? (
          <div className="max-w-md w-full mx-auto my-6 sm:my-10">
            <div className="bg-slate-900 rounded-2xl border border-slate-850 overflow-hidden shadow-2xl">
              <div className="flex bg-slate-950 border-b border-slate-850">
                <button
                  type="button"
                  id="tab-join-btn"
                  onClick={() => { setLoginMode('join'); setErrorMsg(null); }}
                  className={`flex-1 py-4 text-sm font-bold border-b-2 transition-all leading-none cursor-pointer ${
                    loginMode === 'join'
                      ? 'border-indigo-500 text-indigo-400 bg-slate-900/40'
                      : 'border-transparent text-slate-400 hover:text-slate-200 bg-slate-950'
                  }`}
                >
                  輸入房號加入
                </button>
                <button
                  type="button"
                  id="tab-create-btn"
                  onClick={() => { setLoginMode('create'); setErrorMsg(null); }}
                  className={`flex-1 py-4 text-sm font-bold border-b-2 transition-all leading-none cursor-pointer ${
                    loginMode === 'create'
                      ? 'border-indigo-500 text-indigo-400 bg-slate-900/40'
                      : 'border-transparent text-slate-400 hover:text-slate-200 bg-slate-950'
                  }`}
                >
                  快速開新房間
                </button>
              </div>

              <div className="p-6">
                {loginMode === 'join' ? (
                  /* JOIN ROOM FORM */
                  <form onSubmit={handleJoinRoom} className="space-y-4">
                    <div className="text-center mb-5">
                      <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-2.5">
                        <Users className="w-6 h-6" />
                      </div>
                      <h2 className="text-lg font-bold text-slate-100">加入現有聊天室</h2>
                      <p className="text-xs text-slate-400 mt-1">
                        輸入房號密碼，或是直接掃描好友提供的 QR 碼加入
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="room-code-input" className="block text-xs font-semibold text-slate-400">
                          聊天房號
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsScannerOpen(true)}
                          className="flex items-center gap-1 text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 hover:bg-indigo-500/20 transition-all cursor-pointer"
                        >
                          <Camera className="w-3 h-3" />
                          <span>掃碼加入</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        id="room-code-input"
                        placeholder="例如: 8A2B3C4D"
                        maxLength={20}
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm font-mono tracking-wider text-slate-150 placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        value={roomCodeInput}
                        onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                      />
                    </div>

                    <div>
                      <label htmlFor="user-name-input" className="block text-xs font-semibold text-slate-400 mb-1.5">
                        您的聊天暱稱
                      </label>
                      <input
                        type="text"
                        id="user-name-input"
                        placeholder="輸入暱稱 (例如: 小明)"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-150 placeholder-slate-605 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                      />
                    </div>

                    <div>
                      <label htmlFor="room-password-input" className="block text-xs font-semibold text-slate-400 mb-1.5">
                        房間密碼 (若無則留空)
                      </label>
                      <input
                        type="password"
                        id="room-password-input"
                        placeholder="請輸入密碼"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-150 placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        value={roomPasswordInput}
                        onChange={(e) => setRoomPasswordInput(e.target.value)}
                      />
                    </div>

                    {renderMqttServerSelection()}

                    <button
                      type="submit"
                      id="submit-join-room-btn"
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 mt-2 shadow-[0_0_15px_rgba(79,70,229,0.2)]"
                    >
                      <span>進入聊天室</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  /* CREATE ROOM FORM */
                  <form onSubmit={handleCreateRoom} className="space-y-4">
                    <div className="text-center mb-5">
                      <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-2.5">
                        <Crown className="w-6 h-6 text-amber-400" />
                      </div>
                      <h2 className="text-lg font-bold text-slate-100">建立聊天室 (成為房主)</h2>
                      <p className="text-xs text-slate-400 mt-1">
                        建立後您將獲得唯一房鑰，可以設定公告、關注訊息，並隨時打包 ZIP 還原
                      </p>
                    </div>

                    <div>
                      <label htmlFor="host-name-input" className="block text-xs font-semibold text-slate-400 mb-1.5">
                        房主姓名
                      </label>
                      <input
                        type="text"
                        id="host-name-input"
                        placeholder="請輸入您的姓名 (例如: 站長)"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-150 placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        value={hostNameInput}
                        onChange={(e) => setHostNameInput(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        房號設定
                      </label>
                      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 mb-2">
                        <button
                          type="button"
                          id="btn-room-code-random"
                          onClick={() => setRoomCodeType('random')}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            roomCodeType === 'random'
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          隨機房號
                        </button>
                        <button
                          type="button"
                          id="btn-room-code-custom"
                          onClick={() => setRoomCodeType('custom')}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            roomCodeType === 'custom'
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          自訂房號
                        </button>
                      </div>
                      {roomCodeType === 'custom' && (
                        <input
                          type="text"
                          id="custom-room-code-input"
                          placeholder="輸入自訂房號 (4-20位英數字，例如: MYROOM123)"
                          required
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm font-mono tracking-wider text-slate-150 placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                          value={customRoomCode}
                          onChange={(e) => setCustomRoomCode(e.target.value.toUpperCase())}
                        />
                      )}
                    </div>

                    <div>
                      <label htmlFor="host-password-input" className="block text-xs font-semibold text-slate-400 mb-1.5">
                        設定房間密碼 (選填)
                      </label>
                      <input
                        type="password"
                        id="host-password-input"
                        placeholder="輸入密碼以保護聊天室"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-150 placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        value={roomPasswordInput}
                        onChange={(e) => setRoomPasswordInput(e.target.value)}
                      />
                    </div>

                    {renderMqttServerSelection()}

                    <div className="p-3 bg-indigo-950/30 rounded-xl border border-indigo-550/20 flex gap-2.5">
                      <Lock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-indigo-300 leading-relaxed">
                        <strong className="text-indigo-200">房主權限：</strong> 建立後可下載儲存檔。下載的 ZIP 檔案保存有聊天記錄與公告設定，方便隨時再次上傳恢復，免去雲端數據遺失疑慮。
                      </p>
                    </div>

                    <button
                      type="submit"
                      id="submit-create-room-btn"
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 mt-2 shadow-[0_0_15px_rgba(79,70,229,0.2)]"
                    >
                      <span>一鍵開房</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        ) : (
          // ================= STAGE 2: IN THE CHATROOM =================
          <div className="flex-1 flex flex-col gap-4">
            
            {/* 2A. HOST EXCLUSIVE TAB CONTROLLER */}
            {isHost && (
              <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-fit">
                <button
                  type="button"
                  id="tab-chat-mode"
                  onClick={() => setActiveTab('chat')}
                  className={`flex items-center gap-2 py-2 px-4 font-bold text-xs rounded-xl transition-all cursor-pointer ${
                    activeTab === 'chat'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>第一頁：聊天互動室</span>
                </button>
                <button
                  type="button"
                  id="tab-control-mode"
                  onClick={() => setActiveTab('control')}
                  className={`flex items-center gap-2 py-2 px-4 font-bold text-xs rounded-xl transition-all cursor-pointer ${
                    activeTab === 'control'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>第二頁：房主控制面板</span>
                  <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.2 rounded-full font-extrabold border border-red-500/20">PRO</span>
                </button>
              </div>
            )}

            {/* ================= PAGE 1 ================= */}
            {activeTab === 'chat' && (
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
                
                {/* Side info banners */}
                <div className="lg:col-span-1 flex flex-col gap-4">
                  {/* Join Information details */}
                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-850 pb-2.5">
                      <span className="text-xs font-bold text-slate-200">當前聊天身分</span>
                      {isHost ? (
                        <span className="text-[10px] bg-amber-500/10 text-amber-450 border border-amber-500/20 px-2Py-0.5 rounded-full font-bold flex items-center gap-0.5">
                          <Crown className="w-2.5 h-2.5 text-amber-450" /> 房主
                        </span>
                      ) : (
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold">
                          訪客
                        </span>
                      )}
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">登入暱稱：</span>
                        <span className="font-semibold text-slate-200">{currentUser}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">目前房號：</span>
                        <span className="font-mono font-bold text-indigo-400">{room.code}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">歷史訊息：</span>
                        <span className="font-semibold text-slate-200">{room.chats.length} 則</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-slate-800/40 pt-2 mt-2">
                        <span className="text-slate-500">信令狀態：</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                            status === 'connecting' ? 'bg-amber-500 animate-pulse' :
                            status === 'error' ? 'bg-rose-500' : 'bg-slate-500'
                          }`} />
                          <span className={`font-semibold ${
                            status === 'connected' ? 'text-emerald-450' :
                            status === 'connecting' ? 'text-amber-450' :
                            status === 'error' ? 'text-rose-400' : 'text-slate-400'
                          }`}>
                            {status === 'connected' ? '已連線' :
                             status === 'connecting' ? '連線中' :
                             status === 'error' ? '連線錯誤' : '未連線'}
                          </span>
                        </div>
                      </div>
                      {isHost && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/40">
                          <button
                            type="button"
                            onClick={reconnect}
                            disabled={status === 'connecting'}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-250 border border-slate-700 text-[11px] font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            title="重新建立與 MQTT 信令伺服器的連線"
                          >
                            <RefreshCw className={`w-3 h-3 ${status === 'connecting' ? 'animate-spin text-amber-400' : ''}`} />
                            <span>信令伺服器重新連線</span>
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-slate-800/60 mt-3 pt-3">
                      <button
                        type="button"
                        onClick={handleCopyJoinLink}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        {copiedLink ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-450" />
                            <span>連結已複製！</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>複製快速登入連結</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* QR SCAN CODE MODAL FOR OTHER USERS */}
                  <QRCodeView roomCode={room.code} joinUrl={getJoinUrl()} />
                </div>

                {/* Main chats panel */}
                <div className="lg:col-span-3 flex flex-col bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl h-[650px] relative">
                  
                  {/* Top Announcement Bar */}
                  {room.announcement && (
                    <div id="room-running-announcement" className="bg-amber-500/10 border-b border-amber-500/10 px-4 py-3 flex items-start gap-2.5 shadow-sm">
                      <Megaphone className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1 minimal-announce-body text-xs text-amber-350 max-h-16 overflow-y-auto leading-relaxed">
                        <Markdown
                          components={{
                            a: ({ href, children, node, ...props }) => (
                              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {room.announcement}
                        </Markdown>
                      </div>
                    </div>
                  )}

                  {/* Main scrolling list of messages */}
                  <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950/40">
                    {room.chats.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-slate-950/20">
                        <p className="text-sm text-slate-500 italic">目前沒有任何訊息，快來搶第一個發言！</p>
                      </div>
                    ) : (
                      room.chats.map((chat) => {
                        const isStarred = room.pinnedIds.includes(chat.id);
                        const isSelf = chat.user === currentUser;

                        return (
                          <div
                            key={chat.id}
                            className={`flex flex-col max-w-[85%] ${
                              isSelf ? 'ml-auto items-end' : 'mr-auto items-start'
                            }`}
                          >
                            {/* User details and timestamp */}
                            <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-slate-450 font-medium">
                              {chat.role === 'host' ? (
                                <Crown className="w-3 h-3 text-amber-400 fill-amber-400/20 shrink-0" />
                              ) : null}
                              <span className={chat.role === 'host' ? 'font-bold text-amber-400' : 'text-slate-350'}>
                                {chat.user}
                              </span>
                              <span>·</span>
                              <span className="font-mono">
                                {new Date(chat.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {chat.isSpeech && (
                                <span className="flex items-center gap-0.5 text-indigo-300 bg-indigo-500/15 px-1 py-0.2 rounded border border-indigo-500/10" title="透過語音直接輸入">
                                  <Volume2 className="w-2.5 h-2.5" /> 語音
                                </span>
                              )}
                            </div>

                            {/* Message Bubble */}
                            <div
                              className={`group relative p-3 rounded-2xl ${
                                isSelf
                                  ? 'bg-indigo-600 text-white rounded-tr-none shadow-[0_3px_12px_rgba(79,70,229,0.25)]'
                                  : 'bg-slate-950 text-slate-100 border border-slate-850 rounded-tl-none shadow-sm'
                              }`}
                            >
                              {/* Pin indicator visible to anyone */}
                              {isStarred && (
                                <div className="absolute -top-1.5 -left-1.5 bg-amber-500 text-slate-950 p-0.5 rounded-full shadow-md border border-slate-900" title="這是一則房主關注的重點訊息">
                                  <Pin className="w-3 h-3 fill-slate-950" />
                                </div>
                              )}

                              {/* Text message */}
                              {chat.text && (
                                <>
                                  <p className="text-sm leading-relaxed break-all whitespace-pre-wrap font-sans">
                                    {chat.text}
                                  </p>
                                  {(() => {
                                    const match = chat.text.match(/(https?:\/\/[^\s]+)/i);
                                    if (match && match[0]) {
                                      return <LinkPreview url={match[0]} />;
                                    }
                                    return null;
                                  })()}
                                </>
                              )}

                              {/* Image attachment */}
                              {chat.imageUrl && (
                                <div className="mt-2 max-w-xs overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                                  <img
                                    src={chat.imageUrl}
                                    alt="Uploaded preview"
                                    className="w-full object-contain max-h-48 cursor-zoom-in hover:opacity-90 transition-opacity"
                                    referrerPolicy="no-referrer"
                                    onClick={() => {
                                      // simple full screen view
                                      const w = window.open();
                                      if (w) {
                                        w.document.write(`<img src="${chat.imageUrl}" style="max-width:100%; max-height:100vh; display:block; margin:auto;"/>`);
                                      }
                                    }}
                                  />
                                </div>
                              )}

                              {/* Action buttons list (Visible on hover of chat item group) */}
                              <div
                                className={`absolute ${
                                  isSelf ? 'right-full mr-2.5' : 'left-full ml-2.5'
                                } top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10`}
                              >
                                {chat.text && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyMessageText(chat.text, chat.id)}
                                    className="p-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-750 rounded-lg text-slate-400 hover:text-indigo-400 transition-all cursor-pointer shadow-md"
                                    title="複製這則訊息"
                                  >
                                    {copiedId === chat.id ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-400 font-extrabold" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}

                                {isHost && (
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePin(chat.id, isStarred)}
                                    className="p-1.5 bg-slate-800 hover:bg-amber-500/20 border border-slate-750 rounded-lg text-slate-400 hover:text-amber-400 transition-all cursor-pointer shadow-md"
                                    title={isStarred ? '取消關注訊息' : '關注此訊息'}
                                  >
                                    <Pin className={`w-3.5 h-3.5 ${isStarred ? 'text-amber-400 fill-amber-400' : ''}`} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Attachment input bar preview */}
                  <AnimatePresence>
                    {imagePreview && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 15 }}
                        className="bg-slate-950 p-3 border-t border-slate-800 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <div className="relative w-12 h-12 rounded-xl border border-slate-800 overflow-hidden bg-slate-900">
                            <img src={imagePreview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-200">準備上傳圖片</p>
                            <p className="text-[10px] text-slate-550">大小在合理範疇內 (上限 2MB)</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setImagePreview(null)}
                          className="p-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-350 text-xs font-bold rounded-xl transition-all border border-slate-705 cursor-pointer"
                        >
                          刪除
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Drag and Drop Hover Layer */}
                  {dragOver && (
                    <div className="absolute inset-0 bg-slate-950/95 border-2 border-dashed border-indigo-500 rounded-2xl flex flex-col items-center justify-center text-center p-6 z-30 transition-all shadow-[inset_0_0_50px_rgba(79,70,229,0.15)]">
                      <ImageIcon className="w-12 h-12 text-indigo-400 animate-bounce mb-2" />
                      <p className="text-base font-bold text-slate-100">放開以載入該圖片！</p>
                      <p className="text-xs text-indigo-300 mt-1">圖片將自動壓縮並作為訊息附件傳送</p>
                    </div>
                  )}

                  {/* Send Input Panel */}
                  <form
                    onSubmit={handleSendMessage}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2.5 shadow-md"
                  >
                    {/* Attachment trigger button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2.5 bg-slate-950 hover:bg-slate-805 text-slate-400 hover:text-indigo-400 rounded-xl transition-all cursor-pointer border border-slate-800 shrink-0"
                      title="發送/上傳圖片"
                    >
                      <ImageIcon className="w-5 h-5" />
                    </button>
                    <input
                      type="file"
                      id="image-file-input"
                      ref={fileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          processImageFile(file);
                        }
                      }}
                    />

                    {/* Speech Speech To Text Input element */}
                    <AudioSpeechInput onTranscript={handleSpeechTranscript} />

                    {/* Message textarea/input */}
                    <input
                      type="text"
                      id="text-message-input"
                      placeholder="說點什麼... (支援拖移圖片到此處)"
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      className="flex-1 px-4.5 py-2.5 text-sm bg-slate-950 hover:bg-slate-900/80 text-slate-100 placeholder-slate-600 border border-slate-850 hover:border-slate-800 rounded-xl focus:outline-hidden focus:bg-slate-950 focus:border-indigo-500 transition-all font-sans"
                    />

                    {/* Send submit button */}
                    <button
                      type="submit"
                      id="submit-message-btn"
                      disabled={isSending || (!msgText.trim() && !imagePreview)}
                      className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-950 text-white disabled:text-slate-500 rounded-xl transition-all cursor-pointer shrink-0 shadow-xs"
                      title="傳送訊息"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ================= PAGE 2 (HOST EXCLUSIVE WORKSPACE) ================= */}
            {activeTab === 'control' && isHost && (
              <div id="host-exclusive-panel" className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                
                {/* PART 1: PINNED / FOCUS CHATS (左邊 12/5 欄) */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                  <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
                    <div className="flex items-center justify-between mb-3.5 border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-1.5 text-amber-400">
                        <Pin className="w-4 h-4 fill-amber-400/20" />
                        <h4 className="font-bold text-sm text-slate-250">1. 被房主 關注起來的聊天內容</h4>
                      </div>
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2.5 py-0.5 rounded-full font-bold border border-indigo-500/10">
                        {pinnedMessages.length} 則
                      </span>
                    </div>

                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {pinnedMessages.length === 0 ? (
                        <div className="py-12 text-center text-slate-505 italic bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                          <Pin className="w-8 h-8 mx-auto text-slate-700 mb-1.5" />
                          <p className="text-xs text-slate-400">目前尚未關注訊息</p>
                          <p className="text-[10px] text-slate-500 mt-1">您可在第一頁聊天氣泡旁點擊 Pin 針關注重點</p>
                        </div>
                      ) : (
                        pinnedMessages.map((m) => (
                          <div key={m.id} className="p-3 bg-slate-950 rounded-xl relative border border-slate-850 group transition-all">
                            
                            {/* Unpin action button */}
                            <button
                              type="button"
                              onClick={() => handleTogglePin(m.id, true)}
                              className="absolute top-2.5 right-2.5 p-1 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                              title="取消關注"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs font-bold text-slate-200">{m.user}</span>
                              <span className="text-[9px] text-slate-500 font-mono">
                                {new Date(m.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            {m.text && <p className="text-xs text-slate-350 leading-relaxed break-all font-sans">{m.text}</p>}

                            {m.imageUrl && (
                              <div className="mt-2 max-w-[120px] rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                                <img src={m.imageUrl} alt="Attached img" className="w-full h-auto object-contain" referrerPolicy="no-referrer" />
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* PART 2: ANNOUNCEMENTS EDITOR + ZIP RESTORE STORES (右邊 12/7 欄) */}
                <div className="lg:col-span-7 flex flex-col gap-4">
                  {/* ANNOUNCEMENT WRITER SECTION */}
                  <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
                    <div className="flex items-center gap-1.5 text-indigo-400 mb-4 border-b border-slate-800 pb-2.5">
                      <Megaphone className="w-5 h-5 text-indigo-400" />
                      <h4 className="font-bold text-sm text-slate-205">2. 房主 設定公告 (支援 Markdown 語法)</h4>
                    </div>

                    <MarkdownEditor
                      initialValue={room.announcement}
                      onSave={handleSaveAnnouncement}
                    />
                  </div>

                  {/* ZIP CONTROLS FILE RECONSTRUCTIONS */}
                  <ZipManager
                    roomCode={room.code}
                    chats={room.chats}
                    pinnedIds={room.pinnedIds}
                    announcement={room.announcement}
                    onRestoreState={handleRestoreState}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 3. Global Footer copyright lines */}
      <footer className="bg-slate-950/80 backdrop-blur-md border-t border-slate-900 mt-12 py-8 text-center text-[11px] text-slate-500 font-mono">
        <div className="flex items-center justify-center gap-4 mb-3 text-[10px] text-slate-600">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            訪客: <span id="vercount_value_site_uv" className="font-bold text-slate-400">--</span>
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            瀏覽: <span id="vercount_value_site_pv" className="font-bold text-slate-400">--</span>
          </span>
        </div>
        <div>
          <span>聯手聊天室 · Collaborative Multi-session Environment</span>
        </div>
        <div className="mt-1 text-slate-600">
          Made in compliant safe sandboxed frame spaces with fully client-controlled backups.
        </div>
      </footer>
    </div>
  );
}
