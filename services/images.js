// Saves an uploaded image (data URL) into public/images/uploads and returns its public path.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { HttpError } = require('../middleware/auth');
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

exports.saveDataUrl = dataUrl => {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new HttpError(400, 'Upload a JPG, PNG or WebP image.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new HttpError(400, 'Image must be under 3 MB.');
  const name = crypto.randomBytes(8).toString('hex') + '.' + TYPES[m[1]];
  const dir = path.join(__dirname, '..', 'public', 'images', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  return '/images/uploads/' + name;
};

// Only allow local paths or http(s) URLs
exports.cleanUrl = u => {
  u = String(u || '').trim();
  if (!u) return null;
  if (!/^(\/images\/|https?:\/\/)/i.test(u)) throw new HttpError(400, 'Image must be an /images/ path or an http(s) URL.');
  return u.slice(0, 500);
};
