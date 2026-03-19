// 生成图标的 Node.js 脚本
// 运行: node generate-icons.js

const fs = require('fs');
const path = require('path');

// 简单的 PNG 图标生成器（不依赖外部库）
// 使用纯 JavaScript 生成简单的 PNG 图标

function createPNGIcon(size) {
  // PNG 文件头
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const width = size;
  const height = size;
  const bitDepth = 8;
  const colorType = 6; // RGBA
  const compressionMethod = 0;
  const filterMethod = 0;
  const interlaceMethod = 0;

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(bitDepth, 8);
  ihdrData.writeUInt8(colorType, 9);
  ihdrData.writeUInt8(compressionMethod, 10);
  ihdrData.writeUInt8(filterMethod, 11);
  ihdrData.writeUInt8(interlaceMethod, 12);

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // 创建图像数据
  const rawData = [];
  const backgroundColor = { r: 26, g: 115, b: 232, a: 255 }; // #1a73e8
  const foregroundColor = { r: 255, g: 255, b: 255, a: 255 }; // white

  for (let y = 0; y < height; y++) {
    rawData.push(0); // 过滤器类型
    for (let x = 0; x < width; x++) {
      // 创建圆角矩形背景
      const padding = size * 0.15;
      const radius = size * 0.15;

      let inBackground = false;

      // 检查是否在圆角矩形内
      if (x >= padding && x < width - padding && y >= padding && y < height - padding) {
        // 检查四个角
        const corners = [
          { cx: padding + radius, cy: padding + radius },
          { cx: width - padding - radius, cy: padding + radius },
          { cx: padding + radius, cy: height - padding - radius },
          { cx: width - padding - radius, cy: height - padding - radius }
        ];

        let inCorner = false;
        for (const corner of corners) {
          const dx = x - corner.cx;
          const dy = y - corner.cy;
          if ((x < padding + radius || x > width - padding - radius) &&
              (y < padding + radius || y > height - padding - radius)) {
            if (dx * dx + dy * dy <= radius * radius) {
              inCorner = true;
              break;
            }
          }
        }

        if (x >= padding + radius && x < width - padding - radius) {
          inBackground = true;
        } else if (y >= padding + radius && y < height - padding - radius) {
          inBackground = true;
        } else if (inCorner) {
          inBackground = true;
        }
      }

      // 检查是否在目录图标线条上
      let inForeground = false;
      if (inBackground) {
        const lineStartX = size * 0.28;
        const lineEndX = size * 0.72;
        const lineThickness = Math.max(1, size * 0.08);
        const lineGap = size * 0.14;
        const startY = size * 0.28;

        for (let i = 0; i < 3; i++) {
          const lineY = startY + i * (lineThickness + lineGap);
          if (y >= lineY && y < lineY + lineThickness &&
              x >= lineStartX && x < lineEndX) {
            inForeground = true;
            break;
          }
        }
      }

      if (inForeground) {
        rawData.push(foregroundColor.r, foregroundColor.g, foregroundColor.b, foregroundColor.a);
      } else if (inBackground) {
        rawData.push(backgroundColor.r, backgroundColor.g, backgroundColor.b, backgroundColor.a);
      } else {
        rawData.push(0, 0, 0, 0); // 透明
      }
    }
  }

  // 压缩图像数据
  const zlib = require('zlib');
  const deflatedData = zlib.deflateSync(Buffer.from(rawData));

  const idatChunk = createChunk('IDAT', deflatedData);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  // 组合 PNG 文件
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 计算
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = getCRC32Table();

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }

  return crc ^ 0xFFFFFFFF;
}

let crc32Table = null;
function getCRC32Table() {
  if (crc32Table) return crc32Table;

  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
  }
  return crc32Table;
}

// 生成图标
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

[16, 48, 128].forEach(size => {
  const png = createPNGIcon(size);
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created: ${filename}`);
});

console.log('Icons generated successfully!');
