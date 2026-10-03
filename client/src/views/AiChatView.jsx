import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  User, 
  Send, 
  Sparkles, 
  FolderPlus, 
  Trash2, 
  RefreshCw, 
  ArrowRight,
  FileText
} from 'lucide-react';
import { api } from '../services/api';

export function AiChatView({ onRefreshData }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Halo! Saya Arka Assistant. Saya dapat membantu mencari berkas, menjawab pertanyaan berdasarkan isi dokumen (PDF/Word/Kode), atau merapikan folder secara otomatis.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (textToSend) => {
    const query = textToSend || input.trim();
    if (!query || isLoading) return;

    setInput('');
    const newMessages = [...messages, { role: 'user', content: query }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const history = newMessages.slice(-6);
      const res = await api.askAi(query, history);

      if (res.success && res.data) {
        setMessages(prev => [
          ...prev, 
          { 
            role: 'assistant', 
            content: res.data.answer || 'Tidak ada jawaban.',
            proposedActions: res.data.proposedActions,
            permissionMessage: res.data.permissionMessage
          }
        ]);
        if (res.data.proposedActions && onRefreshData) {
          onRefreshData();
        }
      } else {
        setMessages(prev => [
          ...prev, 
          { role: 'assistant', content: `⚠️ ${res.error || 'Terjadi kesalahan saat memproses jawaban.'}` }
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev, 
        { role: 'assistant', content: `⚠️ Gagal terhubung ke AI server: ${err.message}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    await api.resetAi();
    setMessages([
      {
        role: 'assistant',
        content: 'Memori percakapan di-reset. Apa yang ingin Anda tanyakan atau kelola sekarang?'
      }
    ]);
  };

  const suggestions = [
    'Apa saja berkas yang tersimpan di Drive?',
    'Tolong rangkumkan isi dokumen POS Retail Flow Bisnis',
    'Cari dokumen atau catatan terkait keuangan',
    'Bagaimana cara merapikan folder otomatis?'
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-6 max-w-4xl mx-auto animate-fade-in">
      {/* Chat Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div 
              key={idx} 
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white flex-shrink-0 shadow-md">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                isUser 
                  ? 'bg-blue-600 text-white rounded-tr-xs shadow-md' 
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-xs shadow-sm'
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Proposed Action Card if any */}
                {msg.proposedActions && msg.proposedActions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-800 text-[11px] font-mono text-zinc-400">
                    <div className="text-amber-400 font-semibold mb-1 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Tindakan Otomatis Disarankan:
                    </div>
                    {msg.proposedActions.map((act, aIdx) => (
                      <div key={aIdx} className="bg-zinc-950 p-2 rounded-lg mt-1 border border-zinc-800">
                        {act.description || `${act.action} pada ${act.file_id || 'berkas'}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 items-center text-xs text-zinc-400 font-mono">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center animate-pulse">
              <Sparkles className="w-4 h-4" />
            </div>
            <span>Arka sedang berpikir & mengekstrak data...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts Pills */}
      {messages.length <= 2 && (
        <div className="py-3 flex flex-wrap gap-2">
          {suggestions.map((sugg, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(sugg)}
              className="text-xs px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all text-left flex items-center gap-1.5"
            >
              <span>{sugg}</span>
              <ArrowRight className="w-3 h-3 text-zinc-500" />
            </button>
          ))}
        </div>
      )}

      {/* Input Box Footer */}
      <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center gap-2">
        <button
          onClick={handleReset}
          className="p-2.5 rounded-xl border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
          title="Reset Memori Percakapan"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2 focus-within:border-zinc-700 transition-all shadow-sm">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Tanyakan isi dokumen atau kelola drive..."
            className="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="p-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-all shadow-md shadow-blue-600/30"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
