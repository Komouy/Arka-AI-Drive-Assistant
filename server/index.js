import { app } from './app.js';
import { APP, STORAGE_DIR, getApiKey, getPort } from './config/env.js';
import { MODELS } from './ai/providers.js';
import { isSupabaseConfigured } from './config/supabase.js';

const PORT = getPort();

// ── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const hasGroq = Boolean(getApiKey('groq'));
  const hasGemini = Boolean(getApiKey('gemini'));
  const hasSupabase = isSupabaseConfigured();

  console.log(`\n==============================================`);
  console.log(`🤖 ${APP.name} v${APP.version} — CORE active on http://localhost:${PORT}`);
  console.log(`📦 Storage mounted at: ${STORAGE_DIR}`);
  console.log(`💾 Database: ${hasSupabase ? '⚡ Supabase (Cloud PostgreSQL)' : '📁 SQLite (Local file)'}`);

  console.log(`\n🧠 AI Providers:`);
  console.log(`   Groq   : ${hasGroq   ? `✅ Key loaded (${MODELS.groq.fast})`    : '⚠️  Not configured (add GROQ_API_KEY to .env)'}`);
  console.log(`   Gemini : ${hasGemini ? `✅ Key loaded (${MODELS.gemini.flash})` : '⚠️  Not configured (add GEMINI_API_KEY to .env)'}`);
  console.log(`   Live check: arka ai-status`);
  console.log(`==============================================\n`);
});
