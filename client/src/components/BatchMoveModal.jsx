import React, { useState } from 'react';
import { FolderInput, X, Folder } from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';
import { api } from '../services/api';

export function BatchMoveModal({ folders = [], onMoveSuccess }) {
  const { 
    isBatchMoveModalOpen, 
    closeBatchMoveModal, 
    selectedFileIds, 
    clearSelection 
  } = useDriveStore();
  const [targetFolderId, setTargetFolderId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isBatchMoveModalOpen) return null;

  const count = selectedFileIds.size;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading || count === 0) return;

    setIsLoading(true);
    try {
      const ids = Array.from(selectedFileIds);
      for (const id of ids) {
        await api.moveFileFolder(id, targetFolderId || null);
      }
      clearSelection();
      closeBatchMoveModal();
      if (onMoveSuccess) onMoveSuccess();
    } catch (err) {
      alert('Gagal memindahkan berkas: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-modal w-full max-w-sm rounded-3xl p-5 border border-zinc-800 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FolderInput className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold font-display text-zinc-100">Pindahkan {count} Berkas</h3>
          </div>
          <button onClick={closeBatchMoveModal} className="p-1 rounded-lg text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
              Pilih Folder Tujuan
            </label>
            <select
              value={targetFolderId}
              onChange={(e) => setTargetFolderId(e.target.value)}
              className="input-field text-xs bg-zinc-900"
            >
              <option value="">(Root / Tanpa Folder)</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-850">
            <button
              type="button"
              onClick={closeBatchMoveModal}
              className="px-3.5 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-white"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary text-xs py-1.5 px-4 rounded-xl"
            >
              {isLoading ? 'Memindahkan...' : 'Pindahkan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
