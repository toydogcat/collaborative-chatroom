/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { QrCode, Copy, Check, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';

interface QRCodeViewProps {
  roomCode: string;
  mqttServer?: string;
}

export default function QRCodeView({ roomCode, mqttServer }: QRCodeViewProps) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate the full link matching current origin
  const joinUrl = `${window.location.origin}${window.location.pathname}?joinCode=${roomCode}${
    mqttServer ? `&mqttServer=${encodeURIComponent(mqttServer)}` : ''
  }`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, joinUrl, {
        width: 250,
        margin: 4, // Increased margin to prevent clipping
        color: {
          dark: '#4f46e5',
          light: '#ffffff',
        },
      }, (error) => {
        if (error) console.error('QR Code generation error:', error);
      });
    }
  }, [joinUrl]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="room-qr-card" className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center max-w-sm mx-auto shadow-xl">
      <div className="flex items-center gap-1.5 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wider">
        <QrCode className="w-3.5 h-3.5" />
        <span>房號掃碼登入</span>
      </div>

      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none">
        房號 (ROOM CODE)
      </h3>
      <div className="flex items-center gap-2.5 mt-2 mb-4">
        <span className="text-3xl font-black text-indigo-400 tracking-wider font-mono">
          {roomCode}
        </span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="p-1 px-1.5 text-slate-400 hover:text-indigo-400 rounded-md hover:bg-slate-800 transition-colors"
          title="複製房號"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* QR Code Canvas */}
      <div className="relative p-3 bg-white border border-slate-200 rounded-2xl w-52 h-52 flex items-center justify-center mb-4 shadow-inner">
        <canvas ref={canvasRef} className="w-full h-full rounded-lg" />
      </div>

      <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-4">
        此二維碼包含登入連結，其他用戶直接使用手機掃描即可自動填入房號進入聊天室。
      </p>

      <button
        type="button"
        onClick={handleCopyLink}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-indigo-600/10 hover:bg-indigo-600/25 text-indigo-400 border border-indigo-500/20 text-xs font-bold rounded-xl transition-all cursor-pointer"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-emerald-400" />
            <span>連結已複製！</span>
          </>
        ) : (
          <>
            <ExternalLink className="w-4 h-4" />
            <span>複製快速登入連結</span>
          </>
        )}
      </button>
    </div>
  );
}
