// Load environment variables FIRST — before any module-level code in app.js
// or its imports (e.g. upload.js) can evaluate `process.env.*`.
import { loadEnv } from '../server/config/env.js';
loadEnv();

let app;
let initError = null;

try {
  const mod = await import('../server/app.js');
  app = mod.default || mod.app;
} catch (err) {
  console.error('[ARKA Startup Failed]', err);
  initError = err;
}

export default function handler(req, res) {
  if (initError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: false,
      message: 'ARKA Serverless cold start failed to initialize',
      error: initError.message,
      stack: initError.stack
    }, null, 2));
  }

  return app(req, res);
}

