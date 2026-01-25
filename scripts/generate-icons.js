// Simple script to generate placeholder PWA icons
// Run with: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Create raw image data (filter byte + RGB for each pixel per row)
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    rawData[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const pixelStart = rowStart + 1 + x * 3;
      // Create a simple "H" pattern for Health Tracker
      const isH = isPartOfH(x, y, width, height);
      if (isH) {
        rawData[pixelStart] = 74;     // R - green accent
        rawData[pixelStart + 1] = 222; // G
        rawData[pixelStart + 2] = 128; // B
      } else {
        rawData[pixelStart] = r;
        rawData[pixelStart + 1] = g;
        rawData[pixelStart + 2] = b;
      }
    }
  }

  // Compress the raw data
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // Build chunks
  const chunks = [
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ];

  return Buffer.concat([signature, ...chunks]);
}

function isPartOfH(x, y, width, height) {
  const margin = Math.floor(width * 0.2);
  const thickness = Math.floor(width * 0.15);
  const centerY = Math.floor(height / 2);

  // Left vertical bar of H
  const leftBar = x >= margin && x < margin + thickness &&
                  y >= margin && y < height - margin;

  // Right vertical bar of H
  const rightBar = x >= width - margin - thickness && x < width - margin &&
                   y >= margin && y < height - margin;

  // Horizontal bar of H
  const horizBar = x >= margin && x < width - margin &&
                   y >= centerY - thickness/2 && y < centerY + thickness/2;

  return leftBar || rightBar || horizBar;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation for PNG
function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  const table = makeCRCTable();

  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeCRCTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}

// Generate icons
const publicDir = path.join(__dirname, '..', 'public');

const icons = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

icons.forEach(({ name, size }) => {
  const png = createPNG(size, size, 0, 0, 0); // Black background
  fs.writeFileSync(path.join(publicDir, name), png);
  console.log(`Created ${name} (${size}x${size})`);
});

console.log('Done! Icons created in public/');
