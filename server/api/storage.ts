import type { Env } from './types';

/**
 * Where the encrypted backup blobs and avatars live.
 *
 * Two backends, for one practical reason: **R2 has to be switched on in the
 * Cloudflare dashboard before a bucket can exist**, and that step can ask for a
 * payment method. Workers KV needs neither — it is part of the Workers free plan
 * and `wrangler kv namespace create` just works. So a deployment with no card on
 * file gets working backups on KV, and one with R2 enabled transparently gets
 * the better store.
 *
 * The differences that matter are encoded as `maxBytes` and nothing else, so
 * every route reads the same three methods either way.
 */

export type StoredBlob = { body: ReadableStream | ArrayBuffer; contentType: string };

export type Storage = {
  kind: 'r2' | 'kv';
  /** Largest single object this backend accepts. */
  maxBytes: number;
  put(key: string, bytes: ArrayBuffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredBlob | null>;
  delete(keys: string | string[]): Promise<void>;
};

/** R2's own per-object ceiling is far higher; this is our sanity cap. */
const R2_MAX_BYTES = 50 * 1024 * 1024;
/** KV's hard limit per value — 25 MiB. Exceeding it is a write that simply fails. */
const KV_MAX_BYTES = 25 * 1024 * 1024;

/** `null` when neither backend is bound — the routes answer 503. */
export function storage(env: Env): Storage | null {
  if (env.FILES) return r2Storage(env.FILES);
  if (env.BLOBS) return kvStorage(env.BLOBS);
  return null;
}

function r2Storage(bucket: R2Bucket): Storage {
  return {
    kind: 'r2',
    maxBytes: R2_MAX_BYTES,
    async put(key, bytes, contentType) {
      await bucket.put(key, bytes, { httpMetadata: { contentType } });
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      };
    },
    async delete(keys) {
      await bucket.delete(keys);
    },
  };
}

function kvStorage(kv: KVNamespace): Storage {
  return {
    kind: 'kv',
    maxBytes: KV_MAX_BYTES,
    async put(key, bytes, contentType) {
      // KV has no notion of an HTTP content type, so it rides along as metadata
      // — which is also why `get` uses getWithMetadata rather than plain get.
      const body = bytes instanceof Uint8Array
        ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
        : bytes;
      await kv.put(key, body, { metadata: { contentType } });
    },
    async get(key) {
      const { value, metadata } = await kv.getWithMetadata<{ contentType?: string }>(key, 'arrayBuffer');
      if (!value) return null;
      return { body: value, contentType: metadata?.contentType ?? 'application/octet-stream' };
    },
    async delete(keys) {
      // No batch delete in KV; the counts here are single digits (pruning old
      // backups), so a loop is the whole implementation rather than a compromise.
      for (const key of Array.isArray(keys) ? keys : [keys]) await kv.delete(key);
    },
  };
}
