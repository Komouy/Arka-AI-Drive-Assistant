import React, { useState } from 'react';
import { Sparkles, Lock, Mail, HardDrive, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export function LoginScreen() {
  const { login, supabase } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setError('');
    setIsLoading(true);
    const res = await login(email.trim(), password);
    if (!res.success) {
      setError(res.error || 'Login gagal. Periksa kembali email dan kata sandi.');
    }
    setIsLoading(false);
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setError('Autentikasi Supabase belum dikonfigurasi di server.');
      return;
    }
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/drive.file',
          redirectTo: window.location.origin
        }
      });
    } catch (err) {
      setError('Login Google gagal: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-zinc-950 relative overflow-hidden">
      {/* Decorative Background Glows */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="glass-modal w-full max-w-md rounded-3xl p-8 border border-zinc-800 shadow-2xl relative z-10 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-500/25">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold font-display text-zinc-100 tracking-wide">
            Masuk ke ARKA
          </h1>
          <p className="text-xs text-zinc-400">
            Personal AI Workspace & Drive Assistant
          </p>
        </div>

        {/* Google OAuth Button */}
        <button
          onClick={handleGoogleLogin}
          type="button"
          className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-2.5 transition-all shadow-sm group hover:border-zinc-700"
        >
          <HardDrive className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span>Masuk dengan Google Drive</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-zinc-850"></div>
          <span className="text-[10px] font-mono text-zinc-400 uppercase">atau akun owner</span>
          <div className="flex-1 h-px bg-zinc-850"></div>
        </div>

        {/* Form Login */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
              Email atau Username
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Dhaifan atau kamu@email.com..."
                className="input-field pl-9 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1.5">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-3 pointer-events-none" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="input-field pl-9 text-xs"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 font-mono">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 font-semibold"
          >
            <span>{isLoading ? 'Memeriksa sesi...' : 'Masuk ke Dashboard'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center text-[10px] font-mono text-zinc-400">
          Terkoneksi ke Supabase Cloud Database & Storage
        </div>
      </div>
    </div>
  );
}
