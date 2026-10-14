'use strict';
const crypto = require('crypto');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function batchId(date = new Date()) {
  const d = date.toISOString().slice(0, 10).replace(/-/g, '');
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `FT-${d}-${s}`;
}
const BATCH_ID_RE = /^FT-\d{8}-[A-Z0-9]{6}$/;
module.exports = { batchId, BATCH_ID_RE };
