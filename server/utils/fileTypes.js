/**
 * ARKA — File type helpers
 *
 * Shared by the API (file/inbox/system controllers), the AI analyzer and the
 * search layer. Previously this logic was duplicated in fileController and
 * inboxController, which also created a circular import between the two.
 */

import path from 'node:path';

export const FILE_CATEGORIES = ['Image', 'Video', 'Audio', 'Document', 'Code', 'Archive', 'Other'];

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.tiff', '.avif', '.heic'];
const VECTOR_EXTS = ['.svg']; // XML text — must NOT go to the vision model
const VIDEO_EXTS = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.wmv', '.flv'];
const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus'];
const CODE_EXTS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.html', '.css', '.json', '.py', '.sql', '.sh', '.rs', '.go', '.vue', '.php', '.rb', '.java', '.c', '.cpp', '.h', '.yml', '.yaml', '.toml', '.xml'];
const DOC_EXTS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.rtf', '.log'];
const ARCHIVE_EXTS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'];

/** Lower-cased extension (including dot) for a filename. */
export function extOf(filename = '') {
  return path.extname(String(filename)).toLowerCase();
}

function extIn(ext, list) {
  return list.includes(ext);
}

/**
 * Categorise a file into one of FILE_CATEGORIES.
 * MIME type is preferred when trustworthy, extension used as fallback
 * (CLI uploads historically sent `application/octet-stream`).
 */
export function getFileTypeCategory(mimeType = '', filename = '') {
  const mime = String(mimeType || '').toLowerCase();
  const ext = extOf(filename);

  if (mime.startsWith('image/') || extIn(ext, IMAGE_EXTS) || extIn(ext, VECTOR_EXTS)) return 'Image';
  if (mime.startsWith('video/') || extIn(ext, VIDEO_EXTS)) return 'Video';
  if (mime.startsWith('audio/') || extIn(ext, AUDIO_EXTS)) return 'Audio';
  if (mime.includes('pdf') || extIn(ext, DOC_EXTS)) return 'Document';
  if (extIn(ext, CODE_EXTS) || mime.includes('json') || mime.includes('javascript') || mime.includes('xml')) return 'Code';
  if (extIn(ext, ARCHIVE_EXTS) || mime.includes('zip') || mime.includes('compressed')) return 'Archive';
  return 'Other';
}

/** True when the file is human-readable text (safe to print / send as text). */
export function isTextLike(mimeType = '', filename = '') {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('text/')) return true;
  if (mime === 'application/json' || mime === 'application/xml' || mime === 'application/sql') return true;
  return extIn(extOf(filename), [...CODE_EXTS, ...DOC_EXTS, '.svg', '.ini', '.env', '.gitignore']);
}

/** True when the file is a raster image (vision model capable). */
export function isRasterImage(mimeType = '', filename = '') {
  const mime = String(mimeType || '').toLowerCase();
  return (mime.startsWith('image/') && !mime.includes('svg')) || extIn(extOf(filename), IMAGE_EXTS);
}

/** True when the file needs a multimodal model (image / video / audio). */
export function isMultimodal(mimeType = '', filename = '') {
  const category = getFileTypeCategory(mimeType, filename);
  if (category === 'Image') return isRasterImage(mimeType, filename);
  return category === 'Video' || category === 'Audio';
}

/** Minimal extension → MIME map for clients that send application/octet-stream. */
const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.svg': 'image/svg+xml', '.tiff': 'image/tiff',
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
  '.json': 'application/json', '.xml': 'application/xml', '.html': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python',
  '.sql': 'application/sql', '.sh': 'text/x-shellscript', '.zip': 'application/zip'
};

/**
 * Best-effort MIME type from a file extension.
 * Used only as a fallback when the client sends `application/octet-stream`.
 */
export function guessMimeType(filename = '') {
  return MIME_BY_EXT[extOf(filename)] || 'application/octet-stream';
}

/** Prefer the client-provided MIME type unless it is the generic fallback. */
export function resolveMimeType(mimeType, filename) {
  const mime = String(mimeType || '').toLowerCase();
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    return guessMimeType(filename);
  }
  return mime;
}

export default {
  getFileTypeCategory, isTextLike, isRasterImage, isMultimodal,
  extOf, guessMimeType, resolveMimeType, FILE_CATEGORIES
};
