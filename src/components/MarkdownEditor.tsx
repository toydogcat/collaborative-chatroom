/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import Markdown from 'react-markdown';
import { Heading1, Heading2, Bold, List, Link, FileEdit, Eye, RefreshCw } from 'lucide-react';

interface MarkdownEditorProps {
  initialValue: string;
  onSave: (value: string) => Promise<void>;
}

export default function MarkdownEditor({ initialValue, onSave }: MarkdownEditorProps) {
  const [markdown, setMarkdown] = useState(initialValue);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);

  const insertText = (before: string, after: string = '') => {
    const textarea = document.getElementById('md-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    const replacement = before + (selected || '文字') + after;
    const newValue = text.substring(0, start) + replacement + text.substring(end);
    
    setMarkdown(newValue);
    
    // Focus back and restore cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + (selected || '文字').length);
    }, 0);
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      await onSave(markdown);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="announcement-editor-card" className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
      {/* Tab select header */}
      <div className="flex items-center justify-between bg-slate-900 px-4 py-2 border-b border-slate-800">
        <div className="flex border-b border-transparent">
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${
              activeTab === 'edit'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileEdit className="w-3.5 h-3.5" />
            <span>編輯公告</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${
              activeTab === 'preview'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>發布預覽</span>
          </button>
        </div>

        {/* Action button */}
        <button
          type="button"
          onClick={handlePublish}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
        >
          {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
          <span>發布最新公告</span>
        </button>
      </div>

      {activeTab === 'edit' ? (
        <div className="flex flex-col h-72">
          {/* Markdown Toolbar */}
          <div className="flex items-center gap-1 bg-slate-900/50 px-3 py-1.5 border-b border-slate-850 text-slate-400">
            <button
              type="button"
              onClick={() => insertText('# ', '')}
              className="p-1.5 hover:text-slate-200 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              title="大標題"
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertText('## ', '')}
              className="p-1.5 hover:text-slate-200 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              title="次標題"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertText('**', '**')}
              className="p-1.5 hover:text-slate-200 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              title="粗體文字"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertText('- ', '')}
              className="p-1.5 hover:text-slate-200 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              title="無序清單"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertText('[', '](https://)')}
              className="p-1.5 hover:text-slate-200 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
              title="插入超連結"
            >
              <Link className="w-4 h-4" />
            </button>
          </div>

          <textarea
            id="md-textarea"
            className="flex-1 w-full p-4 text-sm font-sans text-slate-200 bg-slate-950 placeholder-slate-600 focus:outline-hidden resize-none leading-relaxed"
            placeholder="請輸入公告內容，支援 Markdown 語法..."
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
          />
        </div>
      ) : (
        <div className="p-4 bg-slate-950 h-72 overflow-y-auto">
          <div className="markdown-body text-sm leading-relaxed text-slate-350">
            {markdown.trim() ? (
              <Markdown>{markdown}</Markdown>
            ) : (
              <p className="text-slate-600 italic text-center py-10">尚無任何公告內容</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
