import React from 'react';
import { 
  Image as ImageIcon, 
  Eye, 
  Download, 
  Star, 
  Trash2, 
  Folder
} from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';
import { api, getAuthToken } from '../services/api';

export function GalleryView({ files = [], onRefresh }) {
  const { 
    currentFolderFilter, 
    searchQuery, 
    openPreview, 
    selectedFileIds, 
    toggleSelectFile,
    selectAllFiles 
  } = useDriveStore();

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

  // Filter ONLY image files
  let imageList = files.filter(f => !f.is_trash && isImageFile(f));

  if (currentFolderFilter) {
    imageList = imageList.filter(f => (f.folder_name || (f.is_inbox ? 'inbox' : 'root')) === currentFolderFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    imageList = imageList.filter(f => 
      (f.original_name || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q) ||
      (f.tags || '').toLowerCase().includes(q) ||
      (f.folder_name || '').toLowerCase().includes(q)
    );
  }

  const handleDownload = (file) => {
    const token = getAuthToken();
    const url = `/api/files/${file.id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.original_name || 'unduhan';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDelete = async (file) => {
    if (window.confirm(`Hapus gambar "${file.original_name}"?`)) {
      await api.deleteFile(file.id);
      if (onRefresh) onRefresh();
    }
  };

  const handleToggleFavorite = async (file) => {
    await api.toggleFavoriteFile(file.id, file.is_favorite);
    if (onRefresh) onRefresh();
  };

  if (imageList.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-center p-6 animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-3">
          <ImageIcon className="w-7 h-7" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-200">
          {searchQuery ? 'Tidak ada gambar yang cocok' : 'Belum ada gambar yang diunggah'}
        </h3>
        <p className="text-xs text-zinc-400 max-w-sm mt-1">
          {searchQuery 
            ? `Pencarian "${searchQuery}" tidak menemukan file gambar.` 
            : 'File gambar (.png, .jpg, .webp, .svg, dll.) akan otomatis tampil dengan pratinjau langsung di sini.'
          }
        </p>
      </div>
    );
  }

  const previewList = imageList.map(f => ({ type: 'FILE', id: f.id }));
  const allVisibleSelected = imageList.length > 0 && imageList.every(f => selectedFileIds.has(String(f.id)));

  const handleSelectAllToggle = () => {
    if (allVisibleSelected) {
      imageList.forEach(f => toggleSelectFile(f.id));
    } else {
      selectAllFiles(imageList.map(f => f.id));
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 animate-fade-in max-w-7xl mx-auto">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={handleSelectAllToggle}
          className="flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={() => {}}
            className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
          />
          <span>Pilih Semua ({imageList.length} gambar)</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {imageList.map(file => {
          const isSelected = selectedFileIds.has(String(file.id));
          const token = getAuthToken();
          const viewUrl = file.public_url || `/api/files/${file.id}/download${token ? `?token=${encodeURIComponent(token)}&inline=1` : '?inline=1'}`;

          return (
            <div
              key={file.id}
              className={`group rounded-2xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden backdrop-blur-md flex flex-col transition-all hover:border-zinc-700 hover:shadow-lg ${
                isSelected ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              {/* Thumbnail Container */}
              <div 
                onClick={() => openPreview('FILE', file.id, previewList)}
                className="relative aspect-square w-full bg-zinc-950/80 cursor-pointer overflow-hidden flex items-center justify-center"
              >
                <img
                  src={viewUrl}
                  alt={file.original_name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="hidden absolute inset-0 items-center justify-center text-zinc-600 bg-zinc-950">
                  <ImageIcon className="w-8 h-8" />
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <div className="p-2 rounded-full bg-white/20 text-white backdrop-blur-md hover:scale-110 transition-transform">
                    <Eye className="w-4 h-4" />
                  </div>
                </div>

                {/* Checkbox badge on top-left */}
                <div 
                  onClick={(e) => { e.stopPropagation(); toggleSelectFile(file.id); }}
                  className={`absolute top-2 left-2 transition-opacity ${
                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="w-4 h-4 rounded bg-zinc-900/80 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>

              {/* Card Footer Info */}
              <div className="p-3 flex flex-col justify-between flex-1 gap-2">
                <div>
                  <div 
                    onClick={() => openPreview('FILE', file.id, previewList)}
                    className="text-xs font-medium text-zinc-200 truncate cursor-pointer hover:text-emerald-400 transition-colors"
                    title={file.original_name}
                  >
                    {file.original_name}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mt-1">
                    <span>{formatBytes(file.size)}</span>
                    <span className="truncate max-w-[80px] bg-zinc-800/60 px-1.5 py-0.2 rounded">
                      {file.folder_name || 'Root'}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-1 border-t border-zinc-850">
                  <button
                    onClick={() => handleToggleFavorite(file)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      file.is_favorite 
                        ? 'text-amber-400 bg-amber-500/10' 
                        : 'text-zinc-500 hover:text-amber-400'
                    }`}
                    title="Favorit"
                  >
                    <Star className={`w-3.5 h-3.5 ${file.is_favorite ? 'fill-amber-400' : ''}`} />
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownload(file)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                      title="Unduh"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(file)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
