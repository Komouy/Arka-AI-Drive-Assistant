import React, { useState } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Folder } from 'lucide-react';
import { useDriveStore } from '../store/useDriveStore';
import { api } from '../services/api';

export function UploadModal({ folders = [], onUploadSuccess }) {
  const { isUploadModalOpen, closeUploadModal, currentFolderFilter } = useDriveStore();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [targetFolder, setTargetFolder] = useState(currentFolderFilter || '');
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  if (!isUploadModalOpen) return null;

  const handleFileChange = (e) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || isUploading) return;

    setIsUploading(true);
    setStatusMessage({ type: 'info', text: 'Mengunggah dan menjalankan analisis AI...' });

    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });
      if (targetFolder) {
        formData.append('folder', targetFolder);
      }

      const res = await api.uploadFiles(formData);
      if (res.success) {
        setStatusMessage({ type: 'success', text: `✅ Berhasil mengunggah ${selectedFiles.length} berkas!` });
        setTimeout(() => {
          setSelectedFiles([]);
          setStatusMessage(null);
          closeUploadModal();
          if (onUploadSuccess) onUploadSuccess();
        }, 1200);
      } else {
        setStatusMessage({ type: 'error', text: `❌ ${res.error || 'Unggahan gagal.'}` });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: `❌ Kesalahan jaringan: ${err.message}` });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="glass-modal w-full max-w-lg rounded-3xl p-6 border border-zinc-800 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold font-display text-zinc-100">Unggah Berkas ke Drive</h3>
          </div>
          <button onClick={closeUploadModal} className="p-1 rounded-lg text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Destination Folder Selector */}
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
              Folder Tujuan (Opsional)
            </label>
            <div className="relative">
              <Folder className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={targetFolder}
                onChange={(e) => setTargetFolder(e.target.value)}
                placeholder="Biarkan kosong untuk analisis otomatis AI atau ketik nama folder..."
                className="input-field pl-9 text-xs"
              />
            </div>
          </div>

          {/* Drag & Drop Box */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-zinc-800 hover:border-blue-500/50 rounded-2xl p-6 text-center transition-all bg-zinc-900/40 cursor-pointer"
            onClick={() => document.getElementById('fileInputUpload').click()}
          >
            <input
              id="fileInputUpload"
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
            <div className="text-xs font-semibold text-zinc-200">
              Tarik berkas ke sini, atau klik untuk memilih
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Mendukung PDF, Word (.docx), Excel, gambar, teks, dan kode.
            </p>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-zinc-950/60 border border-zinc-850">
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs text-zinc-300 px-2 py-1 bg-zinc-900 rounded-lg">
                  <span className="truncate max-w-[280px]">{file.name}</span>
                  <span className="text-[10px] font-mono text-zinc-500">{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div className={`p-3 rounded-xl text-xs font-mono flex items-center gap-2 ${
              statusMessage.type === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
              statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}>
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-850">
            <button
              type="button"
              onClick={closeUploadModal}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={selectedFiles.length === 0 || isUploading}
              className="btn-primary text-xs py-2 px-5 rounded-xl shadow-lg shadow-blue-500/20"
            >
              {isUploading ? 'Mengunggah & Menganalisis...' : `Unggah ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
