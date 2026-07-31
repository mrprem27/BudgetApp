// babel-preset-expo rewrites `process.env.EXPO_PUBLIC_*` references into an
// import from this virtual module. The real file ships as untransformed ESM
// (ignored by transformIgnorePatterns), so pure-logic tests that reference an
// EXPO_PUBLIC_* var (e.g. ocrProviders/gemini.ts) need this stub. Returning
// the live process.env (not a snapshot) so tests can still mutate
// process.env.EXPO_PUBLIC_* between cases and see the change take effect.
module.exports = { env: process.env };
