// Load environment variables FIRST — before any module-level code in app.js
// or its imports (e.g. upload.js) can evaluate `process.env.*`.
// ESM evaluates dependencies before the importing module, so loadEnv() inside
// app.js runs AFTER upload.js has already read process.env.VERCEL.
import { loadEnv } from '../server/config/env.js';
loadEnv();

import app from '../server/app.js';

export default app;
