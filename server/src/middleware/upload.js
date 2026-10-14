'use strict';
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { E } = require('../utils/AppError');

const CERT_TYPES = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' };
const MAGIC = { 'application/pdf': Buffer.from('%PDF'), 'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]) };

fs.mkdirSync(path.join(config.uploadDir, 'certificates'), { recursive: true });

// Stored filename is random + extension derived from the whitelisted MIME type (never from user input).
const certUpload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, path.join(config.uploadDir, 'certificates')),
    filename: (_r, file, cb) => cb(null, crypto.randomUUID() + (CERT_TYPES[file.mimetype] || '.bin')),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_r, file, cb) => (CERT_TYPES[file.mimetype] ? cb(null, true) : cb(E.validation('Certificate must be a PDF, PNG or JPEG file'))),
}).single('file');

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_r, file, cb) => (/\.(csv|json)$/i.test(file.originalname) ? cb(null, true) : cb(E.validation('Import file must be .csv or .json'))),
}).single('file');

const sanitizeName = (n) => path.basename(String(n || 'file')).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 100);

function magicOk(filePath, mime) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    return buf.subarray(0, MAGIC[mime].length).equals(MAGIC[mime]);
  } finally { fs.closeSync(fd); }
}

module.exports = { certUpload, importUpload, sanitizeName, magicOk, CERT_TYPES };
