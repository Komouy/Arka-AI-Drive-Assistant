import React from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  Terminal, 
  Globe, 
  HardDrive, 
  Upload, 
  Eye, 
  Download, 
  MessageSquare, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';

export function OverviewView({ files = [], prompts = [], links = [], systemStatus }) {
  const { setFilter, openPreview, openUploadModal } = useDriveStore();

  function isImageFile(f) {
    if (!f) return false;
    const mime = (f.mime_type || f.type || '').toLowerCase();
    const name = (f.original_name || f.name || '').toLowerCase();
    return mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif)$/i.test(name);
  }

  const docFiles = files.filter(f => !f.is_trash && !isImageFile(f));
  const imageFiles = files.filter(f => !f.is_trash && isImageFile(f));
  const recentFiles = [...files.filter(f => !f.is_trash)]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 5);
  const recentPrompts = [...prompts]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 3);

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(isoStr) {
    if (!isoStr) return '-';
    try {
      return new Date(isoStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    } catch {
      return isoStr;
    }
  }

  const statsCards = [
    { label: 'Dokumen', count: docFiles.length, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10', filter: 'files' },
    { label: 'Gambar', count: imageFiles.length, icon: ImageIcon, color: 'text-emerald-500', bg: 'bg-emerald-500/10', filter: 'images' },
    { label: 'Catatan & Prompt', count: prompts.length, icon: Terminal, color: 'text-purple-500', bg: 'bg-purple-500/10', filter: 'prompts' },
    { label: 'Tautan', count: links.length, icon: Globe, color: 'text-amber-500', bg: 'bg-amber-500/10', filter: 'links' },
    { label: 'Penyimpanan', count: formatBytes(systemStatus?.stats?.totalBytes || 0), icon: HardDrive, color: 'text-cyan-500', bg: 'bg-cyan-500/10', filter: null }
  ];

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* 5 Stats Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {statsCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={() => card.filter && setFilter(card.filter)}
              className={`p-4 rounded-2xl border border-zinc-850 bg-zinc-900/60 backdrop-blur-md flex flex-col justify-between transition-all ${
                card.filter ? 'cursor-pointer hover:border-zinc-700 hover:-translate-y-0.5' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">{card.label}</span>
                <div className={`w-7 h-7 rounded-xl ${card.bg} ${card.color} flex items-center justify-center`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-2xl font-bold font-display text-zinc-100 mt-2 truncate">
                {card.count}
              </div>
            </div>
          );
        })}
      </div>

      {/* Banner Shortcut AI */}
      <div className="p-4 rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/20 backdrop-blur-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 font-display">Tanya AI Dokumen & Otomatisasi Drive</h2>
            <p className="text-xs text-zinc-400">Arka siap mengekstrak dan menganalisis berkas PDF, Word, atau Kode secara real-time.</p>
          </div>
        </div>
        <button
          onClick={() => setFilter('ai')}
          className="btn-primary text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 flex-shrink-0 shadow-lg shadow-blue-500/20"
        >
          <span>Mulai Chat AI</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Recent Files & Prompts Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Files */}
        <div className="p-4 rounded-2xl border border-zinc-850 bg-zinc-900/60 backdrop-blur-md flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800/60">
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-400" /> Berkas Terkini
            </h3>
            <button 
              onClick={() => setFilter('files')}
              className="text-[11px] font-mono text-blue-400 hover:underline"
            >
              Lihat Semua →
            </button>
          </div>

          <div className="space-y-1.5 flex-1">
            {recentFiles.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                Belum ada berkas tersimpan.
              </div>
            ) : (
              recentFiles.map(file => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-800/50 transition-colors group"
                >
                  <div 
                    onClick={() => openPreview('FILE', file.id, recentFiles.map(f => ({ type: 'FILE', id: f.id })))}
                    className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0">
                      {isImageFile(file) ? <ImageIcon className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-zinc-200 truncate group-hover:text-blue-400 transition-colors">
                        {file.original_name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-2">
                        <span>{file.folder_name || 'Root'}</span>
                        <span>•</span>
                        <span>{formatBytes(file.size)}</span>
                        <span>•</span>
                        <span>{formatDate(file.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openPreview('FILE', file.id, recentFiles.map(f => ({ type: 'FILE', id: f.id })))}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                      title="Pratinjau"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Prompts */}
        <div className="p-4 rounded-2xl border border-zinc-850 bg-zinc-900/60 backdrop-blur-md flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800/60">
            <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-purple-400" /> Catatan & Prompt Terkini
            </h3>
            <button 
              onClick={() => setFilter('prompts')}
              className="text-[11px] font-mono text-purple-400 hover:underline"
            >
              Lihat Semua →
            </button>
          </div>

          <div className="space-y-2 flex-1">
            {recentPrompts.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                Belum ada prompt atau catatan.
              </div>
            ) : (
              recentPrompts.map(prompt => (
                <div
                  key={prompt.id}
                  onClick={() => openPreview('PROMPT', prompt.id, recentPrompts.map(p => ({ type: 'PROMPT', id: p.id })))}
                  className="p-3 rounded-xl hover:bg-zinc-800/50 transition-colors cursor-pointer border border-transparent hover:border-zinc-800 group"
                >
                  <div className="text-xs font-semibold text-zinc-200 truncate group-hover:text-purple-400 transition-colors">
                    {prompt.title || 'Tanpa Judul'}
                  </div>
                  <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 font-sans">
                    {prompt.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
