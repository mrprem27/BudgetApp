jest.mock('expo-file-system', () => require('./__mocks__/expoFileSystem'));

import * as SecureStore from 'expo-secure-store';
import {
  extractAuthToken, serverBaseUrl, serverConfigured, deviceLabel,
  requestMagicLink, verifyMagicLink, signOut, getStoredSession,
  fetchProfile, updateProfile, uploadBackup, listServerBackups,
  downloadServerBackup, deleteServerBackup,
  ServerAuthError, ServerNotConfiguredError, ServerRequestError,
  claimInvite, decideClaim, listLinks, listPendingClaims, setLinkPhoneSharing,
} from '../lib/serverApi';

/**
 * The optional server client: what it sends, what it stores, and — the part that
 * actually matters — what it does when the server says no.
 *
 * `fetch` is faked per case rather than hitting a Worker, but the session store
 * is the real in-memory keychain mock, so "signing out clears the token" and
 * "a 401 drops the session" are genuinely observed rather than asserted about a
 * spy.
 */

const BASE = 'https://api.example.com';
const ORIGINAL_URL = process.env.EXPO_PUBLIC_API_URL;

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

/** Queue of responses, consumed in order — one per fetch. */
function mockFetch(...responses: Array<{ status?: number; body?: unknown; text?: string }>) {
  const queue = [...responses];
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift() ?? { status: 200, body: {} };
    const status = next.status ?? 200;
    const payload = next.text ?? JSON.stringify(next.body ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(payload),
      text: async () => payload,
    };
  }) as unknown as typeof fetch;
}

const USER = { id: 'u1', email: 'a@b.com', name: 'Prem', avatarUrl: null, createdAt: 1 };

async function signIn() {
  mockFetch({ body: { sessionToken: 'tok-123', user: USER } });
  await verifyMagicLink('a'.repeat(32));
  calls = [];
}

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = BASE;
  calls = [];
  (SecureStore as unknown as { __reset(): void }).__reset();
});

afterAll(() => {
  process.env.EXPO_PUBLIC_API_URL = ORIGINAL_URL;
});

describe('configuration', () => {
  it('trims a trailing slash so paths never double up', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com/';
    expect(serverBaseUrl()).toBe('https://api.example.com');
  });

  it('treats unset and blank as "no server", which is the shipped default', () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    expect(serverBaseUrl()).toBeNull();
    expect(serverConfigured()).toBe(false);

    process.env.EXPO_PUBLIC_API_URL = '   ';
    expect(serverConfigured()).toBe(false);
  });

  it('refuses to call out when nothing is configured', async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    mockFetch({ body: { ok: true } });
    await expect(requestMagicLink('a@b.com')).rejects.toBeInstanceOf(ServerNotConfiguredError);
    expect(calls).toHaveLength(0);
  });

  it('labels the device by model, for the account\'s session list', () => {
    expect(deviceLabel()).toBe('Test Phone');
  });
});

describe('extractAuthToken', () => {
  const token = 'ab12'.repeat(8);

  it('reads the token out of the deep link the email bounces into', () => {
    expect(extractAuthToken(`budgetsplit:///auth?token=${token}`)).toBe(token.toLowerCase());
  });

  it('accepts a bare pasted code, which is the laptop escape hatch', () => {
    expect(extractAuthToken(`  ${token.toUpperCase()}  `)).toBe(token.toLowerCase());
  });

  it('rejects a truncated paste rather than spending a request on it', () => {
    expect(extractAuthToken('ab12')).toBeNull();
    expect(extractAuthToken('budgetsplit:///auth')).toBeNull();
    expect(extractAuthToken('not a token at all')).toBeNull();
  });
});

describe('sign-in', () => {
  it('stores the session on verify, and sends the device label with it', async () => {
    mockFetch({ body: { sessionToken: 'tok-123', user: USER } });
    const session = await verifyMagicLink('a'.repeat(32));

    expect(session.token).toBe('tok-123');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      token: 'a'.repeat(32),
      deviceLabel: 'Test Phone',
    });
    await expect(getStoredSession()).resolves.toEqual({ token: 'tok-123', user: USER });
  });

  it('surfaces the server\'s own message, which is written for the user', async () => {
    mockFetch({ status: 401, body: { error: 'That sign-in link is no longer valid. Request a new one.' } });
    await expect(verifyMagicLink('a'.repeat(32))).rejects.toThrow('no longer valid');
    // No token was sent, so a 401 here is a dead *link*, not a dead session —
    // there is nothing stored to clear.
    await expect(getStoredSession()).resolves.toBeNull();
  });

  it('passes the send failure\'s code through, since its fix is server config', async () => {
    mockFetch({ status: 502, body: { error: 'Could not send the sign-in email', code: 'E_SENDER_NOT_VERIFIED' } });
    await expect(requestMagicLink('a@b.com')).rejects.toMatchObject({
      code: 'E_SENDER_NOT_VERIFIED',
    });
  });

  it('reports an unreachable server as one connection problem', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    await expect(requestMagicLink('a@b.com')).rejects.toThrow('Could not reach the server');
  });

  it('clears the local session even when the logout call fails', async () => {
    await signIn();
    global.fetch = jest.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;

    await signOut();

    // Otherwise a network blip leaves the app looking signed in, with every
    // action behind it failing.
    await expect(getStoredSession()).resolves.toBeNull();
  });
});

describe('authed requests', () => {
  it('attaches the bearer token', async () => {
    await signIn();
    mockFetch({ body: { user: USER } });
    await fetchProfile();

    expect(calls[0].url).toBe(`${BASE}/me`);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer tok-123');
  });

  it('refuses before sending when nobody is signed in', async () => {
    mockFetch({ body: { user: USER } });
    await expect(fetchProfile()).rejects.toBeInstanceOf(ServerAuthError);
    expect(calls).toHaveLength(0);
  });

  it('drops the stored session on a 401, so the UI stops claiming signed in', async () => {
    await signIn();
    mockFetch({ status: 401, body: { error: 'Not signed in' } });

    await expect(fetchProfile()).rejects.toBeInstanceOf(ServerAuthError);
    await expect(getStoredSession()).resolves.toBeNull();
  });

  it('keeps the cached user in step with what the server returned', async () => {
    await signIn();
    const renamed = { ...USER, name: 'Prem B' };
    mockFetch({ body: { user: renamed } });

    await updateProfile({ name: 'Prem B' });

    const stored = await getStoredSession();
    expect(stored?.user.name).toBe('Prem B');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ name: 'Prem B' });
  });

  it('reports a non-401 failure with its status, without signing the user out', async () => {
    await signIn();
    mockFetch({ status: 413, body: { error: 'Backup is larger than 52428800 bytes' } });

    await expect(uploadBackup('{"ciphertext":"x"}')).rejects.toBeInstanceOf(ServerRequestError);
    await expect(getStoredSession()).resolves.not.toBeNull();
  });
});

describe('backups', () => {
  it('uploads the envelope as opaque text, unparsed and unwrapped', async () => {
    await signIn();
    const envelope = JSON.stringify({ v: 1, createdAt: 5, ciphertext: 'U2FsdGVk' });
    mockFetch({ status: 201, body: { backup: { id: 'b1', sizeBytes: envelope.length, createdAt: 5 } } });

    const saved = await uploadBackup(envelope);

    expect(saved.id).toBe('b1');
    // Byte-for-byte: the server stores what `lib/backup.ts` encrypted, so a
    // re-encoding here would be a restore that can't be decrypted.
    expect(calls[0].init.body).toBe(envelope);
    expect((calls[0].init.headers as Record<string, string>)['content-type']).toBe('text/plain');
  });

  it('lists and deletes by id', async () => {
    await signIn();
    mockFetch(
      { body: { backups: [{ id: 'b1', sizeBytes: 10, createdAt: 1 }] } },
      { body: { ok: true } },
    );

    await expect(listServerBackups()).resolves.toHaveLength(1);
    await deleteServerBackup('b1');
    expect(calls[1].url).toBe(`${BASE}/backups/b1`);
    expect(calls[1].init.method).toBe('DELETE');
  });

  it('returns an empty list rather than throwing when the field is missing', async () => {
    await signIn();
    mockFetch({ body: {} });
    await expect(listServerBackups()).resolves.toEqual([]);
  });

  it('hands the download back as raw text for on-device decryption', async () => {
    await signIn();
    mockFetch({ text: '{"v":1,"createdAt":5,"ciphertext":"U2FsdGVk"}' });

    const text = await downloadServerBackup('b1');
    expect(JSON.parse(text).ciphertext).toBe('U2FsdGVk');
  });
});

describe('linking', () => {
  it('claims an invite without linking anything', async () => {
    await signIn();
    mockFetch({ body: { state: 'pending' } });

    // The whole point of the design: opening someone's link asks, it does not
    // bind. A forwarded invite must not attach whoever taps it first.
    await expect(claimInvite('b'.repeat(32))).resolves.toBe('pending');
    expect(calls[0].url).toBe(`${BASE}/invites/claim`);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ token: 'b'.repeat(32) });
  });

  it('reports an existing link instead of asking again', async () => {
    await signIn();
    mockFetch({ body: { state: 'already-linked' } });
    await expect(claimInvite('b'.repeat(32))).resolves.toBe('already-linked');
  });

  it('approves and declines through distinct endpoints', async () => {
    await signIn();
    mockFetch({ body: { state: 'approved' } }, { body: { state: 'declined' } });

    await decideClaim('tok1', true);
    await decideClaim('tok2', false);
    expect(calls[0].url).toBe(`${BASE}/invites/tok1/approve`);
    expect(calls[1].url).toBe(`${BASE}/invites/tok2/decline`);
  });

  it('sends only my own sharing flag, never theirs', async () => {
    await signIn();
    mockFetch({ body: { ok: true, sharingMyPhone: true } });

    await setLinkPhoneSharing('link-1', true);
    expect(calls[0].init.method).toBe('PATCH');
    // No user id, no "their" flag: the server decides which column is mine from
    // the session, so this request cannot express changing what they disclose.
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ sharePhone: true });
  });

  it('reads a linked person, phone included only when the server sent one', async () => {
    await signIn();
    mockFetch({ body: { links: [
      { id: 'l1', createdAt: 1, sharingMyPhone: false,
        person: { id: 'u2', name: 'Rohan', email: 'r@x.com', phone: null, avatarUrl: null } },
    ] } });

    const [link] = await listLinks();
    // `null` is the server having resolved "they are not sharing" — the client
    // never receives a number it is meant to hide.
    expect(link.person.phone).toBeNull();
    expect(link.sharingMyPhone).toBe(false);
  });

  it('returns empty lists rather than throwing when fields are missing', async () => {
    await signIn();
    mockFetch({ body: {} }, { body: {} });
    await expect(listLinks()).resolves.toEqual([]);
    await expect(listPendingClaims()).resolves.toEqual([]);
  });
});
