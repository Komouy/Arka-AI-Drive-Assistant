import React from 'react';
import { 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  Archive, 
  Music, 
  Film, 
  File, 
  Eye, 
  Download, 
  Star, 
  Trash2, 
  Bot, 
  Sparkles,
  Inbox
} from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';
import { api, getAuthToken } from '../services/api';

export function DocumentView({ files = [], onRefresh }) {
  const { 
    currentFolderFilter, 
    searchQuery, 
    selectedFileIds, 
    toggleSelectFile, 
    selectAllFiles,
    openPreview,
    setFilter
  } = useDriveStore();

  function isImageFile(f) {
    if (!f) return false;
    const mime = (f.mime_type || f.type || '').toLowerCase();
    const name = (f.original_name || f.name || '').toLowerCase();
    return mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif)$/i.test(name);
  }

  function getFileIcon(name = '', mime = '') {
    const ext = name.split('.').pop().toLowerCase();
    const m = mime.toLowerCase();
    if (['xlsx', 'xls', 'csv', 'tsv', 'ods'].includes(ext)) return { icon: FileSpreadsheet, color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
    if (['docx', 'doc', 'odt', 'rtf'].includes(ext)) return { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10' };
    if (ext === 'pdf' || m === 'application/pdf') return { icon: FileText, color: 'text-rose-500', bg: 'bg-rose-500/10' };
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { icon: Archive, color: 'text-purple-500', bg: 'bg-purple-500/10' };
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext) || m.startsWith('audio/')) return { icon: Music, color: 'text-pink-500', bg: 'bg-pink-500/10' };
    if (['mp4', 'webm', 'mov', 'mkv'].includes(ext) || m.startsWith('video/')) return { icon: Film, color: 'text-orange-500', bg: 'bg-orange-500/10' };
    if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'py', 'sql', 'sh', 'java'].includes(ext)) return { icon: FileCode, color: 'text-cyan-500', bg: 'bg-cyan-500/10' };
    return { icon: File, color: 'text-zinc-400', bg: 'bg-zinc-800' };
  }

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
      return new Date(isoStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return isoStr;
    }
  }

  // Filter ONLY documents (non-images)
  let docList = files.filter(f => !f.is_trash && !isImageFile(f));

  if (currentFolderFilter) {
    docList = docList.filter(f => (f.folder_name || (f.is_inbox ? 'inbox' : 'root')) === currentFolderFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    docList = docList.filter(f => 
      (f.original_name || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q) ||
      (f.tags || '').toLowerCase().includes(q) ||
      (f.folder_name || '').toLowerCase().includes(q)
    );
  }

  const allVisibleSelected = docList.length > 0 && docList.every(f => selectedFileIds.has(String(f.id)));

  const handleSelectAllToggle = () => {
    if (allVisibleSelected) {
      docList.forEach(f => toggleSelectFile(f.id));
    } else {
      selectAllFiles(docList.map(f => f.id));
    }
  };

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
    if (window.confirm(`Pindahkan "${file.original_name}" ke tempat sampah?`)) {
      await api.deleteFile(file.id);
      if (onRefresh) onRefresh();
    }
  };

  const handleToggleFavorite = async (file) => {
    await api.toggleFavoriteFile(file.id, file.is_favorite);
    if (onRefresh) onRefresh();
  };

  const handleAskAiAboutFile = (file) => {
    // Open preview and focus document
    openPreview('FILE', file.id, docList.map(f => ({ type: 'FILE', id: f.id })));
  };

  if (docList.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-center p-6 animate-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-3">
          <FileText className="w-7 h-7" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-200">
          {searchQuery ? 'Tidak ada dokumen yang cocok' : 'Belum ada dokumen yang diunggah'}
        </h3>
        <p className="text-xs text-zinc-400 max-w-sm mt-1">
          {searchQuery 
            ? `Pencarian "${searchQuery}" tidak menemukan berkas dokumen.` 
            : 'Dokumen PDF, Word (.docx), Excel/CSV, teks, atau kode akan tampil terorganisir di sini.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-3 animate-fade-in">
      <div className="border border-zinc-800/80 rounded-2xl bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-zinc-900/90 border-b border-zinc-800/80 text-[11px] font-mono uppercase tracking-wider text-zinc-400 items-center">
          <div className="col-span-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={handleSelectAllToggle}
              className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
            />
          </div>
          <div className="col-span-5 md:col-span-4">Nama Dokumen</div>
          <div className="col-span-2 hidden md:block">Folder</div>
          <div className="col-span-2 hidden md:block">Ukuran</div>
          <div className="col-span-2 hidden md:block">Tanggal</div>
          <div className="col-span-6 md:col-span-1 text-right">Aksi</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-zinc-850">
          {docList.map(file => {
            const isSelected = selectedFileIds.has(String(file.id));
            const iconObj = getFileIcon(file.original_name, file.mime_type);
            const Icon = iconObj.icon;

            return (
              <div
                key={file.id}
                className={`grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-zinc-800/40 transition-colors group ${
                  isSelected ? 'bg-blue-500/5' : ''
                }`}
              >
                {/* Checkbox */}
                <div className="col-span-1 flex items-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectFile(file.id)}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {/* Name & Tags */}
                <div className="col-span-5 md:col-span-4 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg ${iconObj.bg} ${iconObj.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div 
                        onClick={() => openPreview('FILE', file.id, docList.map(f => ({ type: 'FILE', id: f.id })))}
                        className="text-xs font-medium text-zinc-200 truncate cursor-pointer hover:text-blue-400 transition-colors"
                        title={file.original_name}
                      >
                        {file.original_name}
                      </div>
                      {file.tags && (
                        <div className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">
                          {file.tags}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Folder */}
                <div className="col-span-2 hidden md:block">
                  <span className="text-xs font-mono text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded-md truncate max-w-[120px] inline-block">
                    {file.folder_name || 'Root'}
                  </span>
                </div>

                {/* Size */}
                <div className="col-span-2 hidden md:block text-xs font-mono text-zinc-400">
                  {formatBytes(file.size)}
                </div>

                {/* Date */}
                <div className="col-span-2 hidden md:block text-xs font-mono text-zinc-400">
                  {formatDate(file.created_at)}
                </div>

                {/* Actions */}
                <div className="col-span-6 md:col-span-1 flex items-center justify-end gap-1">
                  {/* Tanya AI button */}
                  <button
                    onClick={() => handleAskAiAboutFile(file)}
                    className="p-1.5 rounded-lg text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                    title="Tanya AI Dokumen"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => openPreview('FILE', file.id, docList.map(f => ({ type: 'FILE', id: f.id })))}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    title="Pratinjau"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDownload(file)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    title="Unduh"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleToggleFavorite(file)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      file.is_favorite 
                        ? 'text-amber-400 bg-amber-500/10' 
                        : 'text-zinc-500 hover:text-amber-400 hover:bg-zinc-800'
                    }`}
                    title="Favorit"
                  >
                    <Star className={`w-3.5 h-3.5 ${file.is_favorite ? 'fill-amber-400' : ''}`} />
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
