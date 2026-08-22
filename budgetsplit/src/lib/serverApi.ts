import * as Device from 'expo-device';
import { File } from 'expo-file-system';

/**
 * The app's only talking-to-a-server code: sign-in (email magic link) and
 * server-side backup/restore, against `server/api` (Cloudflare Worker).
 *
 * Everything here is opt-in and additive. The app stays local-first: SQLite is
 * still the single source of truth, the existing share-sheet backup still works
 * with no account, and nothing on this path uploads a transaction — a server
 * backup is the same passphrase-encrypted envelope `lib/backup.ts` already
 * builds, which this file moves without being able to read.
 *
 * Signed-in state lives in `expo-secure-store`, not AsyncStorage: the session
 * token is a bearer credential, the first real one the app has ever held, and
 * feature flags' storage is not the right neighbourhood for it.
 */

const SESSION_KEY = 'budgetsplit.session.v1';

type SecureStoreModule = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/**
 * `expo-secure-store` is a **native** module, and this file is imported by a
 * route — which expo-router loads eagerly at startup. A top-level
 * `import * as SecureStore` therefore meant that a JS bundle running on a native
 * build without the module (an OTA update ahead of its binary, or a stale dev
 * client) **crashed the whole app on launch**, not just the account screen:
 *
 *     Error: Cannot find native module 'ExpoSecureStore'
 *
 * A local-first app must not die because an optional feature's dependency is
 * absent. Required lazily and cached, so a missing module degrades to "no
 * account UI" — which is exactly what an unconfigured build already looks like.
 *
 * `undefined` = not yet attempted, `null` = attempted and unavailable.
 */
let secureStore: SecureStoreModule | null | undefined;

function keychain(): SecureStoreModule | null {
  if (secureStore !== undefined) return secureStore;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    secureStore = require('expo-secure-store') as SecureStoreModule;
  } catch {
    secureStore = null;
  }
  return secureStore;
}

/** The session has nowhere safe to live, so the account layer stays off. */
export const secureStorageAvailable = (): boolean => keychain() !== null;

export type ServerUser = {
  id: string;
  email: string;
  name: string | null;
  /** Self-declared, never verified, never searchable. See `server/api` 0002. */
  phone: string | null;
  avatarUrl: string | null;
  createdAt: number;
};

export type ServerSession = { token: string; user: ServerUser };

export type ServerBackup = { id: string; sizeBytes: number; createdAt: number };

// --- Configuration --------------------------------------------------------

/** Nothing is configured and no account UI should appear — the default build. */
export class ServerNotConfiguredError extends Error {
  constructor() {
    super('Accounts are not configured in this build.');
    this.name = 'ServerNotConfiguredError';
  }
}

/** The session is gone (expired, or signed out elsewhere). Local state is already cleared. */
export class ServerAuthError extends Error {
  constructor(message = 'You’re signed out. Sign in again to continue.') {
    super(message);
    this.name = 'ServerAuthError';
  }
}

/** Any other non-2xx — carries the server's own message, which is written for humans. */
export class ServerRequestError extends Error {
  status: number;
  code?: string;
  /**
   * The whole parsed error body, when there was one.
   *
   * Kept because a 409 from `PUT /sync/entries` carries the *current* version of
   * the entry alongside the message, and that payload is the only thing that lets
   * a conflict be shown as "yours vs theirs" instead of a dead end. Discarding it
   * would leave the client knowing only that it lost, which is not enough to do
   * anything useful about it.
   */
  detail?: Record<string, unknown>;
  constructor(status: number, message: string, code?: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = 'ServerRequestError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/**
 * `null` when unset, which is the shipped default.
 *
 * Read through `process.env` at the reference site on purpose: Expo's babel
 * transform *inlines* `EXPO_PUBLIC_*` references at bundle time rather than
 * reading them at runtime, so this cannot be hoisted into a module constant
 * built from a variable name, and a build made without `.env` present gets
 * `undefined` here. Same trap `ocrProviders/gemini.ts` documents.
 */
export function serverBaseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Gate every piece of account UI on this — an unconfigured build shows none of
 * it, and neither does a build whose native keychain module is missing. The
 * second half matters: without somewhere to keep a bearer token, offering
 * sign-in would be offering something that cannot work.
 */
export const serverConfigured = (): boolean => serverBaseUrl() !== null && secureStorageAvailable();

// --- Session storage ------------------------------------------------------

export async function getStoredSession(): Promise<ServerSession | null> {
  const store = keychain();
  if (!store) return null;
  try {
    const raw = await store.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ServerSession>;
    if (typeof parsed.token !== 'string' || !parsed.token || !parsed.user) return null;
    return { token: parsed.token, user: parsed.user as ServerUser };
  } catch {
    // Unreadable keychain entry or a shape from an older build: treat as signed
    // out rather than throwing on every screen that asks who's signed in.
    return null;
  }
}

async function storeSession(session: ServerSession): Promise<void> {
  const store = keychain();
  // Refuse loudly rather than hold a credential in memory only: a "signed in"
  // state that evaporates on the next launch is worse than not signing in.
  if (!store) throw new ServerNotConfiguredError();
  await store.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

async function clearSession(): Promise<void> {
  try { await keychain()?.deleteItemAsync(SESSION_KEY); } catch { /* already gone */ }
}

// --- Transport ------------------------------------------------------------

type SendOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON-serialisable body. Mutually exclusive with `text`. */
  json?: unknown;
  /** Raw text body — used for the encrypted backup envelope. */
  text?: string;
  /** Bearer token, when the route needs one. */
  token?: string;
};

async function send(path: string, options: SendOptions = {}): Promise<Response> {
  const base = serverBaseUrl();
  if (!base) throw new ServerNotConfiguredError();

  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.text !== undefined) {
    headers['content-type'] = 'text/plain';
    body = options.text;
  }
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { method: options.method ?? 'GET', headers, body });
  } catch {
    // No connectivity, DNS failure, or the Worker is down. One message, because
    // the user's next move is the same in all three cases.
    throw new ServerRequestError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (response.ok) return response;

  // 401 means the token is dead server-side; keeping it locally would show a
  // signed-in screen that fails every action. Clear first, then report.
  if (response.status === 401 && options.token) {
    await clearSession();
    throw new ServerAuthError();
  }

  const detail = await response.json().catch(() => null) as
    (Record<string, unknown> & { error?: string; code?: string }) | null;
  throw new ServerRequestError(
    response.status,
    detail?.error ?? `The server returned an error (${response.status}).`,
    detail?.code,
    detail ?? undefined,
  );
}

/** Sends with the stored session, or throws `ServerAuthError` if there isn't one. */
async function sendAuthed(path: string, options: Omit<SendOptions, 'token'> = {}): Promise<Response> {
  const session = await getStoredSession();
  if (!session) throw new ServerAuthError('Sign in first.');
  return send(path, { ...options, token: session.token });
}

// --- Sign-in --------------------------------------------------------------

/**
 * Extracts the token from `budgetsplit:///auth?token=…`, or from a token the
 * user pasted by hand (the email prints it for exactly that case).
 *
 * Pure and lenient about the wrapper, strict about the shape: the server issues
 * lowercase hex, so anything else is a mis-paste and is better refused here than
 * spent as a request.
 */
export function extractAuthToken(input: string): string | null {
  const trimmed = input.trim();
  const fromQuery = /[?&]token=([0-9a-fA-F]{16,256})\b/.exec(trimmed);
  if (fromQuery) return fromQuery[1].toLowerCase();
  return /^[0-9a-fA-F]{16,256}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * What shows up in the account's session list — "iPhone 15", not a fingerprint.
 * `expo-device` rather than `Platform.OS` so it reads as a device a person can
 * recognise, and so this module stays importable outside a React Native runtime.
 */
export function deviceLabel(): string {
  return Device.modelName ?? Device.osName ?? 'This device';
}

export async function requestMagicLink(email: string): Promise<void> {
  await send('/auth/request-link', { method: 'POST', json: { email } });
}

export async function verifyMagicLink(token: string): Promise<ServerSession> {
  const response = await send('/auth/verify', {
    method: 'POST',
    json: { token, deviceLabel: deviceLabel() },
  });
  const data = await response.json() as { sessionToken?: string; user?: ServerUser };
  if (!data.sessionToken || !data.user) {
    throw new ServerRequestError(502, 'The server sent back an unexpected response.');
  }
  const session: ServerSession = { token: data.sessionToken, user: data.user };
  await storeSession(session);
  return session;
}

/**
 * Always clears the local session, even when the server call fails — a sign-out
 * that leaves the app looking signed in because the network blipped is worse
 * than a session row that outlives its device and expires on its own.
 */
export async function signOut(): Promise<void> {
  const session = await getStoredSession();
  if (session) {
    await send('/auth/logout', { method: 'POST', token: session.token }).catch(() => {});
  }
  await clearSession();
}

// --- Profile --------------------------------------------------------------

async function readUser(response: Response): Promise<ServerUser> {
  const data = await response.json() as { user?: ServerUser };
  if (!data.user) throw new ServerRequestError(502, 'The server sent back an unexpected response.');
  const session = await getStoredSession();
  // Keep the cached copy honest, so the account screen renders the same profile
  // the server holds without a round trip on every mount.
  if (session) await storeSession({ ...session, user: data.user });
  return data.user;
}

export async function fetchProfile(): Promise<ServerUser> {
  return readUser(await sendAuthed('/me'));
}

export async function updateProfile(
  patch: { name?: string | null; phone?: string | null; avatarUrl?: string | null },
): Promise<ServerUser> {
  return readUser(await sendAuthed('/me', { method: 'PATCH', json: patch }));
}

/**
 * Uploads a local avatar file as base64 JSON rather than raw bytes: React
 * Native's `fetch` has no dependable binary-body support (a `Uint8Array` body
 * silently stringifies), and a wrong avatar is a bad way to find that out. The
 * Worker accepts both shapes.
 */
export async function uploadAvatar(fileUri: string): Promise<ServerUser> {
  const base64 = await new File(fileUri).base64();
  const ext = fileUri.split('.').pop()?.toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
  return readUser(await sendAuthed('/me/avatar', { method: 'PUT', json: { contentType, base64 } }));
}

// --- Backups --------------------------------------------------------------

/** `envelopeJson` is the already-encrypted `BackupEnvelope`, serialised. */
export async function uploadBackup(envelopeJson: string): Promise<ServerBackup> {
  const response = await sendAuthed('/backups', { method: 'POST', text: envelopeJson });
  const data = await response.json() as { backup?: ServerBackup };
  if (!data.backup) throw new ServerRequestError(502, 'The server sent back an unexpected response.');
  return data.backup;
}

export async function listServerBackups(): Promise<ServerBackup[]> {
  const response = await sendAuthed('/backups');
  const data = await response.json() as { backups?: ServerBackup[] };
  return data.backups ?? [];
}

/** Returns the raw envelope text, for `decryptEnvelope` to open on-device. */
export async function downloadServerBackup(id: string): Promise<string> {
  const response = await sendAuthed(`/backups/${encodeURIComponent(id)}`);
  return response.text();
}

export async function deleteServerBackup(id: string): Promise<void> {
  await sendAuthed(`/backups/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// --- Linking (Stage B) ----------------------------------------------------

export type ServerLink = {
  id: string;
  createdAt: number;
  /** Whether *I* am showing my number to them. Never what they see of me. */
  sharingMyPhone: boolean;
  person: {
    id: string;
    name: string | null;
    email: string;
    /** Present only while their own disclosure is on — resolved server-side per request. */
    phone: string | null;
    avatarUrl: string | null;
  };
};

export type PendingClaim = {
  token: string;
  claimedAt: number;
  from: { id: string; name: string | null; email: string };
};

/** The link you hand to one person. Claiming it binds nothing until you approve. */
export async function createInvite(): Promise<{ token: string; url: string; expiresAt: number }> {
  const response = await sendAuthed('/invites', { method: 'POST' });
  return response.json() as Promise<{ token: string; url: string; expiresAt: number }>;
}

/**
 * Opens someone's invite. Returns `'pending'` — the sender still has to approve
 * you, because an invite is made to be forwarded and the app must not let a
 * forwarded one bind whoever taps it first.
 */
export async function claimInvite(token: string): Promise<'pending' | 'already-linked'> {
  const response = await sendAuthed('/invites/claim', { method: 'POST', json: { token } });
  const data = await response.json() as { state?: string };
  return data.state === 'already-linked' ? 'already-linked' : 'pending';
}

/** Claims waiting on *my* decision. */
export async function listPendingClaims(): Promise<PendingClaim[]> {
  const response = await sendAuthed('/invites');
  const data = await response.json() as { claims?: PendingClaim[] };
  return data.claims ?? [];
}

export async function decideClaim(token: string, approve: boolean): Promise<void> {
  await sendAuthed(`/invites/${encodeURIComponent(token)}/${approve ? 'approve' : 'decline'}`, { method: 'POST' });
}

export async function listLinks(): Promise<ServerLink[]> {
  const response = await sendAuthed('/links');
  const data = await response.json() as { links?: ServerLink[] };
  return data.links ?? [];
}

/** Flips only my own side. I can never change what they disclose to me. */
export async function setLinkPhoneSharing(id: string, sharePhone: boolean): Promise<void> {
  await sendAuthed(`/links/${encodeURIComponent(id)}`, { method: 'PATCH', json: { sharePhone } });
}

export async function removeLink(id: string): Promise<void> {
  await sendAuthed(`/links/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Same shape as `extractAuthToken`, for `budgetsplit:///link?token=…`. */
export const extractInviteToken = extractAuthToken;

// --- Sync (Stage C) --------------------------------------------------------

export type SyncGroup = {
  id: string;
  owner: string;
  state: 'pending' | 'approved';
  /** Null when this device has no wrap yet — invited, or reinstalled. */
  wrappedKey: string | null;
};

export type SyncEntry = {
  entryId: string;
  version: number;
  ciphertext: string;
  author: string;
  isDeleted: boolean;
  updatedAt: number;
};

export type SyncDevice = { deviceId: string; publicKey: string; label: string | null };

export async function registerDevice(
  deviceId: string, publicKey: string, label?: string,
): Promise<void> {
  await sendAuthed('/sync/devices', { method: 'POST', json: { deviceId, publicKey, label } });
}

/**
 * The devices of someone you are linked with — what a group key gets wrapped to.
 *
 * Only reachable for a person who has already approved a link with you. There is
 * no directory here and this route must not become one.
 */
export async function listDeviceKeys(userId?: string): Promise<SyncDevice[]> {
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const res = await sendAuthed(`/sync/devices${q}`);
  return ((await res.json()) as { devices: SyncDevice[] }).devices;
}

export async function listSyncGroups(deviceId: string): Promise<SyncGroup[]> {
  const res = await sendAuthed(`/sync/groups?deviceId=${encodeURIComponent(deviceId)}`);
  return ((await res.json()) as { groups: SyncGroup[] }).groups;
}

/**
 * Publish a group, with the key wrapped to my own devices.
 *
 * The wraps travel WITH the publish rather than after it: without them the owner
 * has published a group they cannot read, because the key exists only in the
 * memory of the device that just generated it.
 */
export async function publishSyncGroup(
  groupId: string, wraps: Array<{ deviceId: string; wrappedKey: string }>,
): Promise<void> {
  await sendAuthed('/sync/groups', { method: 'POST', json: { groupId, wraps } });
}

export async function inviteSyncMember(
  groupId: string, userId: string, wraps: Array<{ deviceId: string; wrappedKey: string }>,
): Promise<void> {
  await sendAuthed(`/sync/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST', json: { userId, wraps },
  });
}

export async function joinSyncGroup(groupId: string): Promise<void> {
  await sendAuthed(`/sync/groups/${encodeURIComponent(groupId)}/join`, { method: 'POST' });
}

/**
 * The push. Throws `ServerRequestError` with `status === 409` when the version is
 * stale, and `error.detail.current` then holds what the server actually has.
 *
 * Deliberately not swallowed into a boolean: a conflict is not a failed request,
 * it is news — someone else changed this entry — and the caller has to be able to
 * tell the two apart.
 */
export async function pushSyncEntry(entry: {
  groupId: string; entryId: string; version: number; ciphertext: string; isDeleted: boolean;
}): Promise<{ version: number; updatedAt: number }> {
  const res = await sendAuthed('/sync/entries', { method: 'PUT', json: entry });
  return (await res.json()) as { version: number; updatedAt: number };
}

export async function pullSyncEntries(
  groupId: string, since: number,
): Promise<{ entries: SyncEntry[]; cursor: number; more: boolean }> {
  const res = await sendAuthed(
    `/sync/entries?groupId=${encodeURIComponent(groupId)}&since=${since}`,
  );
  return (await res.json()) as { entries: SyncEntry[]; cursor: number; more: boolean };
}

export type SyncDispute = {
  entryId: string;
  byUser: string;
  version: number;
  createdAt: number;
  cleared: boolean;
};

/**
 * Tell the group I object to an entry — or withdraw that objection.
 *
 * Never a new version of their entry: a dispute is my opinion of what someone
 * else wrote, and expressing it as a version would let one person overwrite
 * another's record of what happened.
 */
export async function pushSyncDispute(
  groupId: string, entryId: string, version: number, cleared = false,
): Promise<void> {
  await sendAuthed('/sync/disputes', { method: 'PUT', json: { groupId, entryId, version, cleared } });
}

export async function pullSyncDisputes(
  groupId: string, since: number,
): Promise<{ disputes: SyncDispute[]; cursor: number; more: boolean }> {
  const res = await sendAuthed(
    `/sync/disputes?groupId=${encodeURIComponent(groupId)}&since=${since}`,
  );
  return (await res.json()) as { disputes: SyncDispute[]; cursor: number; more: boolean };
}

/** Leave a group someone else created. Their entries stay; my access ends. */
export async function leaveSyncGroup(groupId: string): Promise<void> {
  await sendAuthed(`/sync/groups/${encodeURIComponent(groupId)}/leave`, { method: 'POST' });
}

/** Delete a group for everyone. Owner only — the server enforces it too. */
export async function deleteSyncGroup(groupId: string): Promise<void> {
  await sendAuthed(`/sync/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });
}
