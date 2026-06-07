/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface AudioSpeechInputProps {
  onTranscript: (text: string) => void;
  lang?: string;
}

export default function AudioSpeechInput({ onTranscript, lang = 'zh-TW' }: AudioSpeechInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    // Check for web speech api support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = lang;

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onerror = (e: any) => {
      console.error('Speech recognition error', e);
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript && typeof transcript === 'string') {
        onTranscript(transcript);
      }
    };

    setRecognition(rec);
  }, [lang, onTranscript]);

  const toggleListening = () => {
    if (!supported || !recognition) return;

    if (isListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed"
        title="語音輸入不支援此瀏覽器"
      >
        <MicOff className="w-5 h-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      id="speech-input-btn"
      onClick={toggleListening}
      className={`p-2.5 rounded-xl border transition-all duration-200 cursor-pointer flex items-center justify-center ${
        isListening
          ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.2)] animate-pulse'
          : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 hover:text-white'
      }`}
      title={isListening ? '正在聽取您的聲音... (再按一次停止)' : '開始語音輸入'}
    >
      {isListening ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Mic className="w-5 h-5" />
      )}
    </button>
  );
}
