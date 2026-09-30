/**
 * ARKA — Environment & Path Configuration
 *
 * Single source of truth for:
 *   • loading root `.env`  (previously duplicated in index.js + ai/providers.js)
 *   • resolving project paths (storage / uploads / inbox / database)
 *   • reading API keys (placeholder-aware)
 *   • app metadata (name + version, taken from root package.json)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Paths ─────────────────────────────────────────────────────────────────────
export const ROOT_DIR = path.resolve(__dirname, '../..');
export const SERVER_DIR = path.resolve(__dirname, '..');
export const ENV_FILE = path.join(ROOT_DIR, '.env');
export const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
export const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
export const INBOX_DIR = path.join(STORAGE_DIR, 'inbox');
export const DATABASE_DIR = path.join(ROOT_DIR, 'database');
export const DATABASE_FILE = path.join(DATABASE_DIR, 'arka.db');

// ── App metadata ──────────────────────────────────────────────────────────────
function readRootPackage() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

const rootPkg = readRootPackage();

export const APP = {
  name: 'ARKA — Personal AI Workspace',
  version: rootPkg.version || '0.0.0'
};

// ── .env loading ──────────────────────────────────────────────────────────────
const PLACEHOLDER_VALUES = new Set([
  'your_groq_api_key_here',
  'your_gemini_api_key_here',
  '',
  'undefined',
  'null'
]);

let envLoaded = false;

/**
 * Parse a .env file into key/value pairs.
 * Supports `KEY=value`, `# comments`, blank lines and quoted values.
 */
export function parseEnvFile(filePath = ENV_FILE) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip matching surrounding quotes
    if (value.length > 1 && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }
  return result;
}

/**
 * Load `.env` into process.env without overriding real environment variables.
 * Safe to call multiple times (idempotent).
 */
export function loadEnv() {
  if (envLoaded) return process.env;
  envLoaded = true;

  for (const [key, value] of Object.entries(parseEnvFile())) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return process.env;
}

/** Read an env var (loading .env on first use), falling back when empty/placeholder. */
export function getEnv(key, fallback = undefined) {
  loadEnv();
  const value = process.env[key];
  if (value === undefined || PLACEHOLDER_VALUES.has(String(value).trim())) return fallback;
  return value;
}

/** Returns the API key for 'groq' | 'gemini', or null when not configured. */
export function getApiKey(provider) {
  const key = provider === 'gemini' ? getEnv('GEMINI_API_KEY') : getEnv('GROQ_API_KEY');
  return key ? key.trim() : null;
}

export function getPort() {
  const port = Number(getEnv('PORT', 5000));
  return Number.isInteger(port) && port > 0 ? port : 5000;
}

// ── Filesystem helpers ────────────────────────────────────────────────────────
export function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Silently ignore filesystem write errors in read-only/serverless environments (Vercel)
  }
  return dir;
}

export function ensureStorageDirs() {
  ensureDir(STORAGE_DIR);
  ensureDir(UPLOADS_DIR);
  ensureDir(INBOX_DIR);
  ensureDir(DATABASE_DIR);
}

export default { loadEnv, getEnv, getApiKey, getPort, APP, ensureDir, ensureStorageDirs };
