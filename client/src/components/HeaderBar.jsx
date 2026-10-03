import React from 'react';
import { Search, Plus, Sparkles, Folder, RefreshCw } from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';

export function HeaderBar({ systemStatus, onRefresh, isRefreshing }) {
  const { 
    currentFilter, 
    currentFolderFilter, 
    setFolderFilter, 
    searchQuery, 
    setSearchQuery, 
    openUploadModal 
  } = useDriveStore();

  const titles = {
    overview: { title: 'Beranda', subtitle: 'Ringkasan aktivitas dan berkas ruang kerja Anda' },
    files: { title: 'Dokumen', subtitle: 'Kelola berkas dokumen PDF, spreadsheet, teks, dan kode' },
    images: { title: 'Galeri Gambar', subtitle: 'Koleksi foto dan gambar dengan pratinjau visual' },
    favorites: { title: 'Favorit & Pin', subtitle: 'Berkas dan catatan penting yang Anda beri tanda bintang' },
    prompts: { title: 'Catatan & Prompt', subtitle: 'Koleksi prompt AI dan catatan kerja' },
    links: { title: 'Tautan Tersimpan', subtitle: 'Daftar bookmark tautan web dan referensi' },
    ai: { title: 'Arka AI Assistant', subtitle: 'Asisten cerdas bertenaga Groq & Gemini' },
    trash: { title: 'Tong Sampah', subtitle: 'Berkas terhapus yang dapat dipulihkan atau dibersihkan' }
  };

  const current = titles[currentFilter] || titles.overview;

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  const totalBytes = systemStatus?.stats?.totalBytes || 0;

  return (
    <header className="h-16 px-6 border-b border-zinc-800/60 bg-zinc-950/70 backdrop-blur-xl flex items-center justify-between gap-4 flex-shrink-0">
      {/* Title & Path */}
      <div className="flex items-center gap-3 min-w-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-zinc-100 font-display truncate">
              {current.title}
            </h1>
            {currentFolderFilter && (
              <div className="flex items-center gap-1 text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                <Folder className="w-3 h-3" />
                <span>{currentFolderFilter}</span>
                <button 
                  onClick={() => setFolderFilter(null)}
                  className="ml-1 hover:text-white"
                  title="Hapus filter folder"
                >
                  ×
                </button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 truncate hidden sm:block">
            {current.subtitle}
          </p>
        </div>
      </div>

      {/* Center Search Bar */}
      <div className="flex-1 max-w-md mx-4">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari dokumen, gambar, catatan..."
            className="w-full pl-9 pr-8 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-zinc-700 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Core Online Status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
          <span className="hidden md:inline">core online</span>
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          className={`p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 transition-colors ${
            isRefreshing ? 'animate-spin text-blue-400' : ''
          }`}
          title="Segarkan Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Create / Upload Button */}
        <button
          onClick={openUploadModal}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 rounded-xl shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          <span className="font-semibold">Unggah / Baru</span>
        </button>
      </div>
    </header>
  );
}
