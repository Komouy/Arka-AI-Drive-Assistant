import React from 'react';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

export function TrashView({ files = [], onRefresh }) {
  const trashFiles = files.filter(f => f.is_trash);

  const handleRestore = async (id) => {
    await api.restoreFile(id);
    if (onRefresh) onRefresh();
  };

  const handlePermanentDelete = async (id, name) => {
    if (window.confirm(`Hapus permanen "${name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      await api.deleteFile(id);
      if (onRefresh) onRefresh();
    }
  };

  const handleEmptyTrash = async () => {
    if (window.confirm('Kosongkan semua berkas di tempat sampah secara permanen?')) {
      await api.emptyTrash();
      if (onRefresh) onRefresh();
    }
  };

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold font-display text-zinc-100 flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-500" /> Tong Sampah
          </h2>
          <p className="text-xs text-zinc-400">Berkas yang dihapus dapat dipulihkan kembali atau dibersihkan selamanya.</p>
        </div>
        {trashFiles.length > 0 && (
          <button
            onClick={handleEmptyTrash}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition-all flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Kosongkan Sampah</span>
          </button>
        )}
      </div>

      {trashFiles.length === 0 ? (
        <div className="py-24 text-center text-xs text-zinc-500 font-mono">
          Tong sampah kosong. Tidak ada berkas yang menunggu dibersihkan.
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-2xl bg-zinc-900/60 overflow-hidden divide-y divide-zinc-850">
          {trashFiles.map(file => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3.5 hover:bg-zinc-800/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-zinc-300 truncate">{file.original_name}</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                  {formatBytes(file.size)} • Folder asal: {file.folder_name || 'Root'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRestore(file.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Pulihkan</span>
                </button>
                <button
                  onClick={() => handlePermanentDelete(file.id, file.original_name)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Hapus Permanen</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
