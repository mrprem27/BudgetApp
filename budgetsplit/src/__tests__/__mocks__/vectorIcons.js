// Stub for @expo/vector-icons, which ships untransformed ESM.
//
// Not an empty object: `constants/palette.ts` reads `Feather.glyphMap` at runtime
// in `asFeather()`, so an empty stub would throw there. An empty glyph map keeps
// it working and makes every icon name resolve to its fallback — the honest
// answer in an environment with no icon font loaded.
module.exports = {
  Feather: { glyphMap: {} },
};
