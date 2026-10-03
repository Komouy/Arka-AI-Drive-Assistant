import React, { useState } from 'react';
import { Globe, Plus, Trash2, ExternalLink, Star } from 'lucide-react';
import { api } from '../services/api';

export function LinksView({ links = [], onRefresh }) {
  const [isCreating, setIsCreating] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleDelete = async (id) => {
    if (window.confirm('Hapus tautan ini?')) {
      await api.deleteLink(id);
      if (onRefresh) onRefresh();
    }
  };

  const handleToggleFavorite = async (link) => {
    await api.toggleFavoriteLink(link.id, link.is_favorite);
    if (onRefresh) onRefresh();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    await api.createLink({ url, title: title || url, description });
    setUrl('');
    setTitle('');
    setDescription('');
    setIsCreating(false);
    if (onRefresh) onRefresh();
  };

  return (
    <div className="p-6 space-y-5 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold font-display text-zinc-100">Tautan & Bookmark Tersimpan</h2>
          <p className="text-xs text-zinc-400">Simpan referensi web, dokumentasi, dan tautan penting.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="btn-primary text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Tautan</span>
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 space-y-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://contoh.com..."
            className="input-field text-xs"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul tautan (opsional)..."
              className="input-field text-xs"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Catatan / keterangan singkat..."
              className="input-field text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-zinc-200"
            >
              Batal
            </button>
            <button type="submit" className="btn-primary text-xs py-1.5 px-4 rounded-xl">
              Simpan
            </button>
          </div>
        </form>
      )}

      {links.length === 0 ? (
        <div className="py-20 text-center text-xs text-zinc-500 font-mono">
          Belum ada tautan tersimpan. Klik "+ Tambah Tautan" untuk menyimpan bookmark.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {links.map(link => (
            <div
              key={link.id}
              className="p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 flex flex-col justify-between gap-3 group hover:border-zinc-700 transition-all shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-400 truncate max-w-[180px]">
                    <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{link.domain || link.url}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleToggleFavorite(link)}
                      className={`p-1 rounded-lg transition-colors ${
                        link.is_favorite ? 'text-amber-400' : 'text-zinc-500 hover:text-amber-400'
                      }`}
                      title={link.is_favorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}
                    >
                      <Star className={`w-3.5 h-3.5 ${link.is_favorite ? 'fill-amber-400' : ''}`} />
                    </button>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded-lg text-zinc-400 hover:text-white"
                      title="Buka Tautan"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => handleDelete(link.id)}
                      className="p-1 rounded-lg text-zinc-500 hover:text-rose-400"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-zinc-100 hover:text-amber-400 transition-colors line-clamp-1"
                >
                  {link.title || link.url}
                </a>
                {link.description && (
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                    {link.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
