// Real SHA-256 (via Node's crypto), not an empty stub — same reasoning as the
// other mocks in this folder: a stub would make the pdf.js integrity check
// (pdfjsCache.ts) untestable rather than tested, which is how bugs ship green.
const crypto = require('crypto');

const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };

async function digestStringAsync(_algorithm, data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

module.exports = { digestStringAsync, CryptoDigestAlgorithm };
