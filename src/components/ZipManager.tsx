/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
import JSZip from 'jszip';
import { Download, Upload, CheckCircle2, AlertCircle, FileArchive, Loader2 } from 'lucide-react';
import { ChatMessage } from '../types.js';

interface ZipManagerProps {
  roomCode: string;
  chats: ChatMessage[];
  pinnedIds: string[];
  announcement: string;
  onRestoreState: (restoreData: {
    chats?: ChatMessage[];
    pinnedIds?: string[];
    announcement?: string;
  }) => Promise<void>;
}

export default function ZipManager({
  roomCode,
  chats,
  pinnedIds,
  announcement,
  onRestoreState,
}: ZipManagerProps) {
  // Checkboxes state
  const [saveChats, setSaveChats] = useState(true);
  const [savePinned, setSavePinned] = useState(true);
  const [saveAnnouncement, setSaveAnnouncement] = useState(true);

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download ZIP handler
  const handleDownloadZip = async () => {
    setLoading(true);
    setStatusMessage(null);

    try {
      const zip = new JSZip();
      
      // Meta description so it's a valid chatroom export
      const meta = {
        exportedAt: Date.now(),
        roomCode,
        contents: {
          chats: saveChats,
          pinnedIds: savePinned,
          announcement: saveAnnouncement,
        }
      };
      zip.file('meta.json', JSON.stringify(meta, null, 2));

      if (saveChats) {
        zip.file('chats.json', JSON.stringify(chats, null, 2));
      }

      if (savePinned) {
        // filter chats that are actually pinned to assist independent restores
        const pinnedMessages = chats.filter(m => pinnedIds.includes(m.id));
        zip.file('pinned.json', JSON.stringify({
          pinnedIds,
          pinnedMessages,
        }, null, 2));
      }

      if (saveAnnouncement) {
        zip.file('announcement.md', announcement);
      }

      // Generate the zip archive
      const blob = await zip.generateAsync({ type: 'blob' });

      // Trigger automatic downline download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chatroom-${roomCode}-backup.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatusMessage({ text: '🎉 檔案打包成功，已開始下載 ZIP 備份！', isError: false });
    } catch (err: any) {
      console.error('ZIP generation failed:', err);
      setStatusMessage({ text: `儲存失敗: ${err.message || err}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  // Upload/Restore ZIP handler
  const handleUploadZip = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatusMessage(null);

    try {
      const zip = await JSZip.loadAsync(file);
      
      let restoredChats: ChatMessage[] | undefined;
      let restoredPinnedIds: string[] | undefined;
      let restoredAnnouncement: string | undefined;

      // Read meta first if present
      const metaFile = zip.file('meta.json');
      if (!metaFile) {
        // Simple fallback validation if meta.json does not exist
        console.warn('meta.json missing in backup, extracting files directly...');
      }

      // Check for chats
      const chatsFile = zip.file('chats.json');
      if (chatsFile) {
        const chatsText = await chatsFile.async('text');
        restoredChats = JSON.parse(chatsText);
      }

      // Check for pinned
      const pinnedFile = zip.file('pinned.json');
      if (pinnedFile) {
        const pinnedText = await pinnedFile.async('text');
        const parsedPinned = JSON.parse(pinnedText);
        // Supports legacy array or object structure
        restoredPinnedIds = Array.isArray(parsedPinned) ? parsedPinned : parsedPinned.pinnedIds;
      }

      // Check for announcement
      const announcementFile = zip.file('announcement.md');
      if (announcementFile) {
        restoredAnnouncement = await announcementFile.async('text');
      }

      if (!restoredChats && !restoredPinnedIds && !restoredAnnouncement) {
        throw new Error('此 ZIP 檔案中找不到有效的備份資料。確保存檔包含 chats.json、pinned.json 或 announcement.md。');
      }

      // Compile action
      const restoreData: any = {};
      let restoredItemsMsg = [];

      if (restoredChats) {
        restoreData.chats = restoredChats;
        restoredItemsMsg.push('聊天文字圖片');
      }
      if (restoredPinnedIds) {
        restoreData.pinnedIds = restoredPinnedIds;
        restoredItemsMsg.push('關注內容');
      }
      if (restoredAnnouncement !== undefined) {
        restoreData.announcement = restoredAnnouncement;
        restoredItemsMsg.push('公告內容');
      }

      await onRestoreState(restoreData);

      setStatusMessage({
        text: `✅ 聊天室還原成功！已匯入：${restoredItemsMsg.join('、')}`,
        isError: false,
      });

      // Clear the input value so user can upload the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('ZIP extraction failed:', err);
      setStatusMessage({
        text: `還原失敗：${err.message || '無法解析該 ZIP 壓縮檔'}`,
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="zip-manager-card" className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2.5">
        <FileArchive className="w-5 h-5 text-indigo-400" />
        <h3 className="font-bold text-slate-200 text-sm">存檔與還原控制監控 (ZIP)</h3>
      </div>

      {/* Checklist section */}
      <div className="space-y-3 mb-5">
        <p className="text-xs text-slate-400 font-semibold">請選擇你要打包與匯出的聊天室組件：</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900/80 cursor-pointer select-none transition-all">
            <input
              type="checkbox"
              id="save-chats-checkbox"
              checked={saveChats}
              onChange={(e) => setSaveChats(e.target.checked)}
              className="rounded-sm accent-indigo-500 text-indigo-500 focus:ring-indigo-500 w-4 h-4 border-slate-700 pointer-events-auto"
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-200">聊天內容</span>
              <span className="text-[10px] text-slate-500">({chats.length} 筆訊息)</span>
            </div>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900/80 cursor-pointer select-none transition-all">
            <input
              type="checkbox"
              id="save-pinned-checkbox"
              checked={savePinned}
              onChange={(e) => setSavePinned(e.target.checked)}
              className="rounded-sm accent-indigo-500 text-indigo-500 focus:ring-indigo-500 w-4 h-4 border-slate-700 pointer-events-auto"
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-200">關注聊天內容</span>
              <span className="text-[10px] text-slate-500">({pinnedIds.length} 筆關注)</span>
            </div>
          </label>

          <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900/80 cursor-pointer select-none transition-all">
            <input
              type="checkbox"
              id="save-announcement-checkbox"
              checked={saveAnnouncement}
              onChange={(e) => setSaveAnnouncement(e.target.checked)}
              className="rounded-sm accent-indigo-500 text-indigo-500 focus:ring-indigo-500 w-4 h-4 border-slate-700 pointer-events-auto"
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-200">公告 (Markdown)</span>
              <span className="text-[10px] text-slate-500">({announcement ? '已設定' : '空白'})</span>
            </div>
          </label>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap gap-3">
        {/* Save/Download Button */}
        <button
          type="button"
          onClick={handleDownloadZip}
          disabled={loading || (!saveChats && !savePinned && !saveAnnouncement)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-950 disabled:text-slate-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span>下載 ZIP 存檔備份</span>
        </button>

        {/* Restore/Upload Button Container */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="file"
            id="restore-zip-file"
            ref={fileInputRef}
            accept=".zip"
            onChange={handleUploadZip}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-200 hover:text-white text-xs font-semibold rounded-xl transition-all cursor-pointer border border-slate-700"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>上傳 ZIP 還原聊天室</span>
          </button>
        </div>
      </div>

      {/* Operation messages */}
      {statusMessage && (
        <div id="zip-status-alert" className={`mt-4 p-3 rounded-xl border flex items-start gap-2.5 transition-all text-xs ${
          statusMessage.isError
            ? 'bg-red-500/10 text-red-400 border-red-500/20'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        }`}>
          {statusMessage.isError ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
}
