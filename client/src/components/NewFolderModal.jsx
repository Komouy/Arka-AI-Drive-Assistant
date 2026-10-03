import React, { useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';
import { api } from '../services/api';

export function NewFolderModal({ onFolderCreated }) {
  const { isNewFolderModalOpen, closeNewFolderModal } = useDriveStore();
  const [folderName, setFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isNewFolderModalOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!folderName.trim() || isLoading) return;

    setIsLoading(true);
    try {
      await api.createFolder(folderName.trim());
      setFolderName('');
      closeNewFolderModal();
      if (onFolderCreated) onFolderCreated();
    } catch (err) {
      alert('Gagal membuat folder: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-modal w-full max-w-sm rounded-3xl p-5 border border-zinc-800 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold font-display text-zinc-100">Buat Folder Baru</h3>
          </div>
          <button onClick={closeNewFolderModal} className="p-1 rounded-lg text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
              Nama Folder
            </label>
            <input
              type="text"
              required
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="contoh: Laporan/2026..."
              className="input-field text-xs"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Bisa menggunakan garis miring untuk membuat subfolder bertingkat.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-850">
            <button
              type="button"
              onClick={closeNewFolderModal}
              className="px-3.5 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-white"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading || !folderName.trim()}
              className="btn-primary text-xs py-1.5 px-4 rounded-xl"
            >
              {isLoading ? 'Membuat...' : 'Buat Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
