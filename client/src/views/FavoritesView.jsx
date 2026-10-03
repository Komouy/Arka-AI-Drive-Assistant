import React, { useState } from 'react';
import { 
  Star, 
  FileText, 
  Image as ImageIcon, 
  Terminal, 
  Globe, 
  Download, 
  Eye, 
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';
import { api, getAuthToken } from '../services/api';

export function FavoritesView({ files = [], prompts = [], links = [], onRefresh }) {
  const { openPreview, searchQuery } = useDriveStore();
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'documents' | 'images' | 'prompts' | 'links'
  const [copiedId, setCopiedId] = useState(null);

  function isImageFile(f) {
    if (!f) return false;
    const mime = (f.mime_type || f.type || '').toLowerCase();
    const name = (f.original_name || f.name || '').toLowerCase();
    return mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif)$/i.test(name);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  const q = (searchQuery || '').toLowerCase();

  const favDocs = files.filter(f => 
    f.is_favorite && !f.is_trash && !isImageFile(f) &&
    (!q || (f.original_name || '').toLowerCase().includes(q))
  );

  const favImages = files.filter(f => 
    f.is_favorite && !f.is_trash && isImageFile(f) &&
    (!q || (f.original_name || '').toLowerCase().includes(q))
  );

  const favPrompts = prompts.filter(p => 
    p.is_favorite &&
    (!q || (p.title || '').toLowerCase().includes(q) || (p.content || '').toLowerCase().includes(q))
  );

  const favLinks = links.filter(l => 
    l.is_favorite &&
    (!q || (l.title || '').toLowerCase().includes(q) || (l.url || '').toLowerCase().includes(q))
  );

  const totalCount = favDocs.length + favImages.length + favPrompts.length + favLinks.length;

  const handleToggleDocFav = async (file) => {
    await api.toggleFavoriteFile(file.id, true);
    if (onRefresh) onRefresh();
  };

  const handleTogglePromptFav = async (prompt) => {
    await api.toggleFavoritePrompt(prompt.id, true);
    if (onRefresh) onRefresh();
  };

  const handleToggleLinkFav = async (link) => {
    await api.toggleFavoriteLink(link.id, true);
    if (onRefresh) onRefresh();
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const tabs = [
    { id: 'all', label: 'Semua', count: totalCount },
    { id: 'documents', label: 'Dokumen', count: favDocs.length, icon: FileText },
    { id: 'images', label: 'Gambar', count: favImages.length, icon: ImageIcon },
    { id: 'prompts', label: 'Catatan & Prompt', count: favPrompts.length, icon: Terminal },
    { id: 'links', label: 'Tautan', count: favLinks.length, icon: Globe },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold shadow-sm'
                  : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isActive ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {totalCount === 0 ? (
        <div className="py-24 text-center text-xs text-zinc-500 font-mono space-y-2">
          <Star className="w-10 h-10 mx-auto text-zinc-700" />
          <div className="font-sans text-sm font-semibold text-zinc-300">Belum ada item favorit</div>
          <p className="max-w-xs mx-auto text-zinc-500">
            Klik ikon bintang (⭐) pada dokumen, galeri gambar, catatan, atau bookmark untuk menyematkannya di sini.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Documents Section */}
          {(activeTab === 'all' || activeTab === 'documents') && favDocs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                <h3 className="text-xs font-semibold font-mono text-blue-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5" /> Dokumen Favorit ({favDocs.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {favDocs.map(doc => (
                  <div
                    key={doc.id}
                    className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-850 flex items-center justify-between gap-3 group hover:border-zinc-700 transition-all"
                  >
                    <div 
                      onClick={() => openPreview('FILE', doc.id, favDocs.map(f => ({ type: 'FILE', id: f.id })))}
                      className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-zinc-200 truncate group-hover:text-blue-400 transition-colors">
                          {doc.original_name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                          {formatBytes(doc.size)} • {doc.folder_name || 'Root'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleDocFav(doc)}
                        className="p-1.5 rounded-lg text-amber-400 hover:text-zinc-500 transition-colors"
                        title="Hapus dari Favorit"
                      >
                        <Star className="w-4 h-4 fill-amber-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Images Section */}
          {(activeTab === 'all' || activeTab === 'images') && favImages.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                <h3 className="text-xs font-semibold font-mono text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <ImageIcon className="w-3.5 h-3.5" /> Gambar Favorit ({favImages.length})
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                {favImages.map(img => {
                  const token = getAuthToken();
                  const viewUrl = img.public_url || `/api/files/${img.id}/download${token ? `?token=${encodeURIComponent(token)}&inline=1` : '?inline=1'}`;
                  return (
                    <div
                      key={img.id}
                      className="group rounded-2xl border border-zinc-850 bg-zinc-900/60 overflow-hidden flex flex-col hover:border-zinc-700 transition-all shadow-sm"
                    >
                      <div 
                        onClick={() => openPreview('FILE', img.id, favImages.map(f => ({ type: 'FILE', id: f.id })))}
                        className="relative aspect-square w-full bg-zinc-950 cursor-pointer overflow-hidden flex items-center justify-center"
                      >
                        <img
                          src={viewUrl}
                          alt={img.original_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleDocFav(img); }}
                          className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-amber-400 backdrop-blur-md"
                          title="Hapus dari Favorit"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                        </button>
                      </div>
                      <div className="p-2.5">
                        <div className="text-xs font-medium text-zinc-200 truncate">{img.original_name}</div>
                        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">{formatBytes(img.size)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prompts Section */}
          {(activeTab === 'all' || activeTab === 'prompts') && favPrompts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                <h3 className="text-xs font-semibold font-mono text-purple-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <Terminal className="w-3.5 h-3.5" /> Catatan & Prompt Favorit ({favPrompts.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {favPrompts.map(p => (
                  <div
                    key={p.id}
                    className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-850 flex flex-col justify-between gap-2.5 hover:border-zinc-700 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                          {p.category || 'General'}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleCopy(p.id, p.content)}
                            className="p-1 rounded text-zinc-400 hover:text-white"
                            title="Salin"
                          >
                            {copiedId === p.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleTogglePromptFav(p)}
                            className="p-1 rounded text-amber-400 hover:text-zinc-500"
                            title="Hapus dari Favorit"
                          >
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                          </button>
                        </div>
                      </div>
                      <h4 className="text-xs font-semibold text-zinc-100">{p.title || 'Tanpa Judul'}</h4>
                      <p className="text-xs text-zinc-400 font-mono mt-1 whitespace-pre-wrap line-clamp-3 bg-zinc-950/50 p-2 rounded-xl border border-zinc-850">
                        {p.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Links Section */}
          {(activeTab === 'all' || activeTab === 'links') && favLinks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                <h3 className="text-xs font-semibold font-mono text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <Globe className="w-3.5 h-3.5" /> Tautan Favorit ({favLinks.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {favLinks.map(l => (
                  <div
                    key={l.id}
                    className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-850 flex flex-col justify-between gap-2 hover:border-zinc-700 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-amber-400 truncate max-w-[150px]">
                          {l.domain || l.url}
                        </span>
                        <div className="flex items-center gap-1">
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-zinc-400 hover:text-white"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => handleToggleLinkFav(l)}
                            className="p-1 text-amber-400 hover:text-zinc-500"
                            title="Hapus dari Favorit"
                          >
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                          </button>
                        </div>
                      </div>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-zinc-200 hover:text-amber-400 truncate block"
                      >
                        {l.title || l.url}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
