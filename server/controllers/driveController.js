/**
 * ARKA Phase 2 — Google Drive Controller (BYOD Storage)
 *
 * Uploads files to the authenticated user's Google Drive using their
 * OAuth access token (provider_token obtained via Supabase Google login).
 *
 * Files are stored in a dedicated "ARKA Files" folder in the user's Drive.
 * ARKA only stores metadata (name, size, MIME, tags, AI description) in Supabase DB.
 */

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const DRIVE_API_BASE   = 'https://www.googleapis.com/drive/v3';
const ARKA_FOLDER_NAME = 'ARKA Files';

/**
 * Ensure the "ARKA Files" folder exists in the user's Google Drive.
 * Returns the folder ID (creates it if not found).
 */
export async function ensureArkaFolder(accessToken) {
  const searchRes = await fetch(
    `${DRIVE_API_BASE}/files?q=name%3D'${encodeURIComponent(ARKA_FOLDER_NAME)}'%20and%20mimeType%3D'application%2Fvnd.google-apps.folder'%20and%20trashed%3Dfalse&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(`Drive folder search failed: ${err.error?.message || searchRes.status}`);
  }

  const { files } = await searchRes.json();
  if (files && files.length > 0) return files[0].id;

  const createRes = await fetch(`${DRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ARKA_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(`Drive folder create failed: ${err.error?.message || createRes.status}`);
  }

  const folder = await createRes.json();
  return folder.id;
}

/**
 * Upload a file buffer to the user's Google Drive in the "ARKA Files" folder.
 * Returns { id, name, webViewLink, webContentLink, size }.
 */
export async function uploadToGoogleDrive(accessToken, fileBuffer, fileName, mimeType) {
  const folderId = await ensureArkaFolder(accessToken);
  const boundary = `arka_boundary_${Date.now()}`;
  const metadata  = JSON.stringify({ name: fileName, parents: [folderId] });

  const metaPart = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`, 'utf8');
  const filePart = Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8');
  const closing  = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  const body     = Buffer.concat([metaPart, filePart, fileBuffer, closing]);

  const uploadRes = await fetch(
    `${DRIVE_UPLOAD_URL}&fields=id,name,webViewLink,webContentLink,size`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length)
      },
      body
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(`Google Drive upload failed: ${err.error?.message || uploadRes.status}`);
  }

  return await uploadRes.json();
}

/**
 * Delete a file from Google Drive by its Drive file ID.
 */
export async function deleteFromGoogleDrive(accessToken, driveFileId) {
  const res = await fetch(`${DRIVE_API_BASE}/files/${driveFileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google Drive delete failed: ${err.error?.message || res.status}`);
  }

  return true;
}

/**
 * Get file info from Drive.
 */
export async function getDriveFileInfo(accessToken, driveFileId) {
  const res = await fetch(
    `${DRIVE_API_BASE}/files/${driveFileId}?fields=id,name,webViewLink,webContentLink,size,mimeType`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Drive file info failed: ${err.error?.message || res.status}`);
  }

  return await res.json();
}

/**
 * Express route handler: GET /api/drive/status
 */
export const driveController = {
  status: async (req, res) => {
    const providerToken = req.headers['x-provider-token'] || '';
    if (!providerToken) {
      return res.status(400).json({ success: false, error: 'Google Drive access token (X-Provider-Token) is required' });
    }
    try {
      const folderId = await ensureArkaFolder(providerToken);
      return res.json({ success: true, message: 'Google Drive connected', arkaFolderId: folderId, folderName: ARKA_FOLDER_NAME });
    } catch (err) {
      return res.status(502).json({ success: false, error: err.message });
    }
  }
};
