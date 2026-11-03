// Login Google (Google Identity Services) + backup/sincronização no Google Drive.
// Escopo drive.appdata: o arquivo fica na pasta privada do app, invisível para outros apps.

const GIS_URL = 'https://accounts.google.com/gsi/client';
export const DRIVE_FILE_NAME = 'bispo-telecom-backup.json';
const DRIVE_SCOPE = [
  'https://www.googleapis.com/auth/drive.appdata',
  'openid',
  'email',
  'profile',
].join(' ');

let gisPromise = null;
let tokenClient = null;

/* ---------------- Google Identity ---------------- */

export function loadGis() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      reject(new Error('Não foi possível carregar o login do Google. Verifique a conexão.'));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

export function preloadGis() {
  loadGis().catch(() => {});
}

/**
 * Abre o fluxo de login do Google e devolve um token de acesso.
 * O token vale ~1h e fica apenas na memória do app.
 */
export async function connect(clientId) {
  await loadGis();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    tokenClient = globalThis.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response?.error) {
          finish(reject, new Error(response.error_description || response.error));
          return;
        }
        finish(resolve, {
          accessToken: response.access_token,
          expiresAt: Date.now() + Math.max(120, (response.expires_in || 3600) - 60) * 1000,
          scope: response.scope,
        });
      },
      error_callback: (error) => {
        const message = error?.type === 'popup_closed'
          ? 'Login cancelado.'
          : (error?.message || 'Não foi possível entrar com o Google.');
        finish(reject, new Error(message));
      },
    });

    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (err) {
      finish(reject, err);
    }
  });
}

export function revoke(accessToken) {
  try {
    if (accessToken && globalThis.google?.accounts?.oauth2) {
      globalThis.google.accounts.oauth2.revoke(accessToken, () => {});
    }
  } catch { /* ignora */ }
}

export async function getUserInfo(accessToken) {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/* ---------------- Google Drive ---------------- */

async function driveFetch(accessToken, url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error('Sem conexão com o Google Drive.');
  }

  if (response.status === 401) {
    const error = new Error('Sessão do Google expirada. Entre novamente.');
    error.code = 'AUTH';
    throw error;
  }

  if (!response.ok) {
    let message = `Erro ${response.status} no Google Drive.`;
    try {
      const data = await response.json();
      if (data?.error?.message) message = data.error.message;
    } catch { /* corpo não-JSON */ }
    const error = new Error(message);
    if (response.status === 403) error.code = 'FORBIDDEN';
    throw error;
  }

  return response;
}

export async function findBackupFile(accessToken) {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
    fields: 'files(id,name,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: '1',
  });
  const response = await driveFetch(accessToken, `https://www.googleapis.com/drive/v3/files?${params}`);
  const data = await response.json();
  return data.files?.[0] || null;
}

export async function downloadBackup(accessToken, fileId) {
  const response = await driveFetch(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
  );
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('O backup no Drive está corrompido.');
  }
  if (!Array.isArray(payload?.records)) {
    throw new Error('O arquivo no Drive não é um backup válido deste app.');
  }
  return payload;
}

export async function uploadBackup(accessToken, fileId, payload) {
  const boundary = `ri-${Date.now().toString(36)}`;
  const metadata = fileId
    ? { name: DRIVE_FILE_NAME, mimeType: 'application/json' }
    : { name: DRIVE_FILE_NAME, mimeType: 'application/json', parents: ['appDataFolder'] };

  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(payload),
    `\r\n--${boundary}--`,
  ]);

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,modifiedTime,size`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size';

  const response = await driveFetch(accessToken, url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });

  return response.json();
}

/* ---------------- payload ---------------- */

export function buildPayload({ records, settings, companies, activeCompanyId, updatedAt }) {
  return {
    app: 'bispo-telecom',
    version: Array.isArray(companies) ? 2 : 1,
    updatedAt: updatedAt || new Date().toISOString(),
    settings,
    records,
    ...(Array.isArray(companies) ? { companies, activeCompanyId } : {}),
  };
}

export function isCloudNewer(cloudUpdatedAt, localUpdatedAt) {
  const cloud = Date.parse(cloudUpdatedAt || '');
  const local = Date.parse(localUpdatedAt || '');
  if (!Number.isFinite(cloud)) return false;
  if (!Number.isFinite(local)) return true;
  return cloud - local > 2000;
}

export function isValidPayload(payload) {
  return Boolean(payload && Array.isArray(payload.records));
}
