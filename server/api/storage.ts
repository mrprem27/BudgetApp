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
  kind: 'r2' | 'kv' | 'r2+kv';
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

/**
 * `null` when neither backend is bound — the routes answer 503.
 *
 * When BOTH are bound, R2 is the store and KV is a **read fallback**. That is the
 * whole migration story, and it exists because the obvious version loses data:
 * switching `FILES` on makes every route look in R2, and every backup already
 * written to KV becomes unreachable in the same deploy. Silently — a user opens
 * the restore list, sees their ten snapshots (the rows are in D1), taps one, and
 * gets "that backup is no longer stored".
 *
 * So a miss in R2 falls through to KV, and anything found there is **copied into
 * R2 as it is read**, so the estate drains itself as people use it. Deletes go to
 * both, because a blob only half-deleted is one that comes back.
 */
export function storage(env: Env): Storage | null {
  if (env.FILES && env.BLOBS) return migratingStorage(env.FILES, env.BLOBS);
  if (env.FILES) return r2Storage(env.FILES);
  if (env.BLOBS) return kvStorage(env.BLOBS);
  return null;
}

/**
 * R2 in front, KV behind, promoting on read.
 *
 * Reported as `r2+kv` on `/health` rather than `r2`, so "is the old store still
 * carrying anything" is answerable with a curl instead of a guess — that is the
 * signal for when the KV binding can finally be removed.
 */
function migratingStorage(bucket: R2Bucket, kv: KVNamespace): Storage {
  const r2 = r2Storage(bucket);
  const legacy = kvStorage(kv);
  return {
    kind: 'r2+kv',
    maxBytes: R2_MAX_BYTES,
    put: r2.put,
    async get(key) {
      const hit = await r2.get(key);
      if (hit) return hit;

      const old = await legacy.get(key);
      if (!old) return null;

      // Promote, then serve. A failed copy must NOT fail the read — the user
      // gets their backup either way, and it simply migrates on the next attempt.
      try {
        const bytes = old.body instanceof ArrayBuffer ? old.body : await new Response(old.body).arrayBuffer();
        await r2.put(key, bytes, old.contentType);
        return { body: bytes, contentType: old.contentType };
      } catch {
        return old;
      }
    },
    async delete(keys) {
      // Both, always. Deleting only from R2 would leave the KV copy to be
      // promoted straight back the next time it is read — a deleted backup
      // resurrecting itself is worse than one that lingers.
      await r2.delete(keys);
      await legacy.delete(keys).catch(() => {});
    },
  };
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
