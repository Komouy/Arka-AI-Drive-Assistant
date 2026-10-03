import React, { useState } from 'react';
import { Terminal, Copy, Check, Trash2, Plus, Star } from 'lucide-react';
import { api } from '../services/api';

export function PromptsView({ prompts = [], onRefresh }) {
  const [copiedId, setCopiedId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Hapus catatan/prompt ini?')) {
      await api.deletePrompt(id);
      if (onRefresh) onRefresh();
    }
  };

  const handleToggleFavorite = async (prompt) => {
    await api.toggleFavoritePrompt(prompt.id, prompt.is_favorite);
    if (onRefresh) onRefresh();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    await api.createPrompt({ title, content, category });
    setTitle('');
    setContent('');
    setIsCreating(false);
    if (onRefresh) onRefresh();
  };

  return (
    <div className="p-6 space-y-5 animate-fade-in max-w-5xl mx-auto">
      {/* Header with New Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold font-display text-zinc-100">Koleksi Prompt & Catatan</h2>
          <p className="text-xs text-zinc-400">Simpan instruksi AI, draft ide, dan catatan kerja penting.</p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="btn-primary text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Prompt</span>
        </button>
      </div>

      {/* Create Box */}
      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul catatan / prompt..."
              className="input-field text-xs"
            />
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Kategori (misal: Coding, Marketing)..."
              className="input-field text-xs"
            />
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            required
            placeholder="Tuliskan isi instruksi atau catatan lengkap di sini..."
            className="input-field text-xs resize-none"
          />
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

      {/* Grid of Prompts */}
      {prompts.length === 0 ? (
        <div className="py-20 text-center text-xs text-zinc-500 font-mono">
          Belum ada prompt atau catatan tersimpan. Klik "+ Buat Prompt" untuk memulai.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {prompts.map(prompt => (
            <div
              key={prompt.id}
              className="p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 flex flex-col justify-between gap-3 group hover:border-zinc-700 transition-all shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                    {prompt.category || 'General'}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleToggleFavorite(prompt)}
                      className={`p-1 rounded-lg transition-colors ${
                        prompt.is_favorite ? 'text-amber-400' : 'text-zinc-500 hover:text-amber-400'
                      }`}
                      title={prompt.is_favorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}
                    >
                      <Star className={`w-3.5 h-3.5 ${prompt.is_favorite ? 'fill-amber-400' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleCopy(prompt.id, prompt.content)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors"
                      title="Salin Prompt"
                    >
                      {copiedId === prompt.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleDelete(prompt.id)}
                      className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 transition-colors"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h3 className="text-xs font-semibold text-zinc-100 line-clamp-1">{prompt.title || 'Tanpa Judul'}</h3>
                <p className="text-xs text-zinc-400 mt-2 font-mono whitespace-pre-wrap line-clamp-4 leading-relaxed bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-850">
                  {prompt.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
