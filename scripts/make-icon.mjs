// One-off icon generator. Run: node scripts/make-icon.mjs
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

const S = 128;
const png = new PNG({ width: S, height: S });

const BG = [21, 101, 192]; // database blue
const FG = [255, 255, 255];

function set(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) << 2;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = a;
}

// Rounded-rect background
const radius = 22;
function inRounded(x, y) {
  const minX = radius;
  const maxX = S - 1 - radius;
  const minY = radius;
  const maxY = S - 1 - radius;
  let cx = x;
  let cy = y;
  if (x < minX) cx = minX;
  else if (x > maxX) cx = maxX;
  if (y < minY) cy = minY;
  else if (y > maxY) cy = maxY;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (inRounded(x, y)) set(x, y, BG);
    else set(x, y, [0, 0, 0], 0);
  }
}

// Database cylinder
const cx = S / 2;
const rx = 34; // horizontal radius
const ry = 11; // ellipse vertical radius
const topY = 38;
const botY = 90;

function ellipse(x, y, ey) {
  const nx = (x - cx) / rx;
  const ny = (y - ey) / ry;
  return nx * nx + ny * ny <= 1;
}

for (let y = topY - ry; y <= botY + ry; y++) {
  for (let x = cx - rx; x <= cx + rx; x++) {
    const within = Math.abs(x - cx) <= rx;
    const inBody = within && y >= topY && y <= botY;
    if (inBody || ellipse(x, y, topY) || ellipse(x, y, botY)) {
      set(Math.round(x), Math.round(y), FG);
    }
  }
}

// Two band separators (the "rings") in BG color
for (const yy of [topY + 17, topY + 34]) {
  for (let x = cx - rx; x <= cx + rx; x++) {
    if (ellipse(x, yy, yy)) set(Math.round(x), Math.round(yy), BG);
  }
}

writeFileSync('media/icon.png', PNG.sync.write(png));
console.log('wrote media/icon.png');
