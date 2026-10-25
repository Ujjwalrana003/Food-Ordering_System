// Draws a plated-dish illustration (SVG) for every sample menu item into public/images/menu.
// Replace any of them with your own photo (same file name, .jpg/.png) and update image_url in Admin.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'public', 'images', 'menu');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
// name, background, food color, garnish color, shape
const items = [
  ['Paneer Tikka', '#f7d9a8', '#e9893a', '#3f8f3a', 'cubes'],
  ['Veg Spring Rolls', '#f3e2b3', '#d9a441', '#c8283d', 'rolls'],
  ['Amritsari Fish', '#dbe9f0', '#e3a72f', '#6b9e3a', 'rolls'],
  ['Butter Chicken', '#f8d3b8', '#d9542b', '#f6e9c8', 'bowl'],
  ['Dal Makhani', '#efd9c4', '#5a2e1b', '#f6e9c8', 'bowl'],
  ['Kadhai Paneer', '#f2d0c2', '#c8442b', '#3f8f3a', 'bowl'],
  ['Butter Naan', '#f1e3c6', '#e6c07a', '#f6d77a', 'bread'],
  ['Missi Roti', '#eadfc4', '#b98a4a', '#7a5a2a', 'bread'],
  ['Sweet Lassi', '#e6e0f3', '#fbf6ea', '#f2b134', 'glass'],
  ['Masala Chaas', '#dcebd6', '#eef2d8', '#3f8f3a', 'glass'],
  ['Chicken Tikka', '#f6d6c0', '#d2491f', '#3f8f3a', 'cubes'],
  ['Palak Paneer', '#dfead0', '#3f7d2e', '#f6e9c8', 'bowl'],
  ['Rajma Chawal', '#f1dcd0', '#8c2f22', '#fbf6ea', 'bowl'],
  ['Chole Bhature', '#f3e0b8', '#c9812b', '#e9d27a', 'bread'],
  ['Gulab Jamun', '#f3d9d4', '#7a2b16', '#f2b134', 'bowl'],
  ['Rice Kheer', '#f6efe0', '#f3e7c9', '#c9812b', 'bowl'],
];
const dots = (n, cx, cy, r, c, s = 5) => Array.from({ length: n }, (_, i) => {
  const a = i * 2.4, d = r * Math.sqrt((i + .5) / n);
  return `<circle cx="${(cx + d * Math.cos(a)).toFixed(1)}" cy="${(cy + d * Math.sin(a)).toFixed(1)}" r="${s}" fill="${c}" opacity=".85"/>`;
}).join('');
function art(shape, f, g) {
  const cx = 200, cy = 170;
  if (shape === 'cubes') return [[-60, -40], [10, -55], [60, -5], [-30, 25], [30, 40], [-75, 20]].map(([x, y], i) =>
    `<rect x="${cx + x - 24}" y="${cy + y - 24}" width="48" height="48" rx="8" fill="${f}" transform="rotate(${i * 17} ${cx + x} ${cy + y})"/><rect x="${cx + x - 24}" y="${cy + y - 24}" width="48" height="14" rx="7" fill="#fff" opacity=".25" transform="rotate(${i * 17} ${cx + x} ${cy + y})"/>`).join('') + dots(10, cx, cy + 10, 90, g, 6);
  if (shape === 'rolls') return [-55, 0, 55].map((o, i) =>
    `<rect x="${cx - 95}" y="${cy + o - 20}" width="190" height="40" rx="20" fill="${f}" transform="rotate(${-12 + i * 12} ${cx} ${cy + o})"/><ellipse cx="${cx + 88}" cy="${cy + o - i * 6 + 2}" rx="7" ry="16" fill="#fff" opacity=".3"/>`).join('') + dots(8, cx, cy, 100, g, 5);
  if (shape === 'bowl') return `<circle cx="${cx}" cy="${cy}" r="105" fill="#fff" opacity=".9"/><circle cx="${cx}" cy="${cy}" r="88" fill="${f}"/><path d="M${cx - 60} ${cy - 10}q30 -35 60 0t60 0" stroke="${g}" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>` + dots(9, cx, cy + 25, 55, g, 6);
  if (shape === 'bread') return `<ellipse cx="${cx}" cy="${cy}" rx="120" ry="90" fill="${f}" transform="rotate(-20 ${cx} ${cy})"/><ellipse cx="${cx}" cy="${cy}" rx="120" ry="90" fill="none" stroke="${g}" stroke-width="6" stroke-dasharray="2 14" stroke-linecap="round" transform="rotate(-20 ${cx} ${cy})" opacity=".9"/>` + dots(14, cx, cy, 80, g, 4);
  return `<path d="M${cx - 60} ${cy - 90}h120l-14 170a20 20 0 0 1 -20 18h-52a20 20 0 0 1 -20 -18z" fill="#fff" opacity=".85"/><path d="M${cx - 54} ${cy - 50}h108l-10 128a14 14 0 0 1 -14 12h-60a14 14 0 0 1 -14 -12z" fill="${f}"/><rect x="${cx + 12}" y="${cy - 120}" width="8" height="90" rx="4" fill="${g}" transform="rotate(14 ${cx} ${cy})"/>` + dots(6, cx, cy - 50, 36, g, 4);
}
fs.mkdirSync(dir, { recursive: true });
for (const [name, bg, f, g, shape] of items) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="${name}"><rect width="400" height="300" fill="${bg}"/><circle cx="200" cy="170" r="128" fill="#fff" opacity=".55"/><circle cx="200" cy="170" r="112" fill="#fff" opacity=".7"/>${art(shape, f, g)}</svg>`;
  fs.writeFileSync(path.join(dir, slug(name) + '.svg'), svg);
}
fs.writeFileSync(path.join(dir, 'placeholder.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#ece9e2"/><circle cx="200" cy="150" r="70" fill="#fff"/><circle cx="200" cy="150" r="48" fill="#ddd8cc"/></svg>`);
console.log('Generated', items.length, 'images in', dir);
