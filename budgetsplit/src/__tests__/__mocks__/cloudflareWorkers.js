// `cloudflare:workers` exists only inside the Workers runtime. The server tests import the Worker's
// entry (`server/api/index.ts`), which exports the `UserHub` Durable Object; this is enough for
// that class to load. The hub itself runs only on Cloudflare.
class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
module.exports = { DurableObject };
