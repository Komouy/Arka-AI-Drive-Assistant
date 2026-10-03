import React, { useState, useEffect } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Sparkles, 
  FileText, 
  Code as CodeIcon,
  Image as ImageIcon,
  Copy,
  Check
} from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';
import { api, getAuthToken } from '../services/api';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

export function PreviewModal({ files = [], prompts = [] }) {
  const { previewItem, closePreview, navigatePreview, setFilter } = useDriveStore();
  const [fileContent, setFileContent] = useState(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'content'
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closePreview();
      if (e.key === 'ArrowLeft') navigatePreview(-1);
      if (e.key === 'ArrowRight') navigatePreview(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closePreview, navigatePreview]);

  // Load document extracted text when opening a file
  useEffect(() => {
    if (!previewItem || previewItem.type !== 'FILE') return;
    setIsLoadingContent(true);
    setFileContent(null);
    setActiveTab('preview');

    api.getFileContent(previewItem.id)
      .then(res => {
        if (res.success && res.data) {
          setFileContent(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingContent(false));
  }, [previewItem]);

  if (!previewItem) return null;

  const file = previewItem.type === 'FILE' 
    ? files.find(f => String(f.id) === String(previewItem.id))
    : null;
  const prompt = previewItem.type === 'PROMPT'
    ? prompts.find(p => String(p.id) === String(previewItem.id))
    : null;

  const token = getAuthToken();
  const fileUrl = file 
    ? (file.public_url || `/api/files/${file.id}/download${token ? `?token=${encodeURIComponent(token)}&inline=1` : '?inline=1'}`)
    : '';

  function isImage(f) {
    if (!f) return false;
    const mime = (f.mime_type || '').toLowerCase();
    const name = (f.original_name || '').toLowerCase();
    return mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif)$/i.test(name);
  }

  function isPdf(f) {
    if (!f) return false;
    return f.mime_type === 'application/pdf' || (f.original_name || '').toLowerCase().endsWith('.pdf');
  }

  function isCode(f) {
    if (!f) return false;
    const ext = (f.original_name || '').split('.').pop().toLowerCase();
    return ['js', 'jsx', 'ts', 'tsx', 'py', 'html', 'css', 'json', 'sql', 'sh', 'java', 'cpp', 'c', 'md', 'txt'].includes(ext);
  }

  const handleCopyContent = () => {
    if (fileContent?.content) {
      navigator.clipboard.writeText(fileContent.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAskAiThisFile = () => {
    closePreview();
    setFilter('ai');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="glass-modal w-full max-w-5xl h-[88vh] rounded-3xl flex flex-col overflow-hidden shadow-2xl border border-zinc-800">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-zinc-800 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100 truncate">
              {file?.original_name || prompt?.title || 'Pratinjau'}
            </h3>
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5 flex items-center gap-2">
              <span>{file?.folder_name || prompt?.category || 'General'}</span>
              {fileContent && (
                <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  Teks Dokumen Tersedia ({fileContent.charCount} karakter)
                </span>
              )}
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Ask AI button */}
            <button
              onClick={handleAskAiThisFile}
              className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tanya AI Dokumen</span>
            </button>

            {file && (
              <a
                href={`/api/files/${file.id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`}
                download={file.original_name}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Unduh Berkas"
              >
                <Download className="w-4 h-4" />
              </a>
            )}

            <button
              onClick={closePreview}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Tutup (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher if Text Content Exists */}
        {fileContent && fileContent.content && (
          <div className="px-6 py-2 bg-zinc-950/60 border-b border-zinc-800/60 flex items-center gap-2 text-xs font-mono">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                activeTab === 'preview' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Pratinjau Asli
            </button>
            <button
              onClick={() => setActiveTab('content')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                activeTab === 'content' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Teks Ekstraksi AI
            </button>
          </div>
        )}

        {/* Body Viewer */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center bg-zinc-950/50">
          {activeTab === 'content' && fileContent?.content ? (
            <div className="w-full h-full max-w-3xl overflow-auto bg-zinc-900/90 rounded-2xl p-5 border border-zinc-800 text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
              <div className="flex justify-end mb-3">
                <button
                  onClick={handleCopyContent}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Tersalin' : 'Salin Teks'}</span>
                </button>
              </div>
              {fileContent.content}
            </div>
          ) : isImage(file) ? (
            <img 
              src={fileUrl} 
              alt={file.original_name} 
              className="max-w-full max-h-full object-contain rounded-2xl shadow-xl"
            />
          ) : isPdf(file) ? (
            <iframe
              src={fileUrl}
              title={file.original_name}
              className="w-full h-full rounded-2xl border border-zinc-800 shadow-inner bg-white"
            />
          ) : isCode(file) && fileContent?.content ? (
            <div className="w-full h-full max-w-4xl overflow-auto bg-zinc-900 rounded-2xl p-5 border border-zinc-800 text-xs font-mono">
              <pre className="overflow-x-auto text-zinc-300">
                <code>{fileContent.content}</code>
              </pre>
            </div>
          ) : prompt ? (
            <div className="w-full h-full max-w-2xl bg-zinc-900/80 rounded-2xl p-6 border border-zinc-800 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
              {prompt.content}
            </div>
          ) : (
            <div className="text-center text-zinc-500 text-xs font-mono space-y-2">
              <FileText className="w-12 h-12 mx-auto text-zinc-600" />
              <div>Pratinjau grafis tidak tersedia untuk tipe berkas ini.</div>
              {fileContent?.content ? (
                <button
                  onClick={() => setActiveTab('content')}
                  className="btn-primary text-xs py-1.5 px-3 rounded-xl mt-2"
                >
                  Buka Teks Dokumen
                </button>
              ) : (
                <a
                  href={`/api/files/${file.id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`}
                  download={file.original_name}
                  className="btn-primary text-xs py-1.5 px-3 rounded-xl mt-2 inline-flex"
                >
                  Unduh Berkas
                </a>
              )}
            </div>
          )}
        </div>

        {/* Carousel Footer Navigation */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-xs font-mono text-zinc-400">
          <button
            onClick={() => navigatePreview(-1)}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Sebelumnya (←)</span>
          </button>

          <span>Gunakan panah keyboard ← / →</span>

          <button
            onClick={() => navigatePreview(1)}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <span>Selanjutnya (→)</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
