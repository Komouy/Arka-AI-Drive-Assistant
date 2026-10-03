import React from 'react';
import { FolderInput, Archive, Trash2, X } from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';
import { api, getAuthToken } from '../services/api';

export function FloatingBatchBar({ onRefresh }) {
  const { 
    selectedFileIds, 
    clearSelection, 
    openBatchMoveModal 
  } = useDriveStore();

  const count = selectedFileIds.size;
  if (count === 0) return null;

  const handleBatchDelete = async () => {
    if (window.confirm(`Pindahkan ${count} berkas terpilih ke tong sampah?`)) {
      const ids = Array.from(selectedFileIds);
      for (const id of ids) {
        await api.deleteFile(id);
      }
      clearSelection();
      if (onRefresh) onRefresh();
    }
  };

  const handleBatchDownloadZip = () => {
    const token = getAuthToken();
    const ids = Array.from(selectedFileIds).join(',');
    const url = `/api/files/download-zip?ids=${encodeURIComponent(ids)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `arka_batch_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl glass-modal border border-blue-500/30 shadow-2xl bg-zinc-950/90 text-xs">
        <div className="flex items-center gap-2 pr-2 border-r border-zinc-800">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          <span className="font-semibold text-zinc-100 font-mono">{count} dipilih</span>
        </div>

        <button
          onClick={openBatchMoveModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          <FolderInput className="w-3.5 h-3.5 text-blue-400" />
          <span>Pindah Folder</span>
        </button>

        <button
          onClick={handleBatchDownloadZip}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          <Archive className="w-3.5 h-3.5 text-purple-400" />
          <span>Unduh ZIP</span>
        </button>

        <button
          onClick={handleBatchDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus</span>
        </button>

        <button
          onClick={clearSelection}
          className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors ml-1"
          title="Batalkan Pilihan"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
