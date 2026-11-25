import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const backend = path.resolve(import.meta.dirname, '..', '..', 'backend');
const include = ['server.js', 'http.js', 'routes', 'services', 'package.json', 'node_modules'];
const outDir = path.join(import.meta.dirname, 'build');
const output = path.join(outDir, 'api.zip');

if (!fs.existsSync(path.join(backend, 'node_modules', 'serverless-http'))) {
  console.error('Run "npm install" in backend/ first.');
  process.exit(1);
}

const skipDir = (name) => name === '.bin' || name === 'dist-types';
const skipFile = (name) =>
  name === '.package-lock.json' ||
  name === 'requests.http' ||
  name.startsWith('.env') ||
  /\.(d\.ts|d\.mts|d\.cts|map|md)$/.test(name);

const files = [];
function collect(p) {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(p).sort()) {
      const full = path.join(p, name);
      if (fs.statSync(full).isDirectory() ? skipDir(name) : skipFile(name)) continue;
      collect(full);
    }
  } else if (stat.isFile()) {
    files.push(p);
  }
}
include.forEach((name) => fs.existsSync(path.join(backend, name)) && collect(path.join(backend, name)));
if (files.length > 65535) {
  console.error(`Too many files for a standard zip (${files.length}).`);
  process.exit(1);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const parts = [];
const central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(path.relative(backend, file).split(path.sep).join('/'));
  const data = fs.readFileSync(file);
  const packed = zlib.deflateRawSync(data);
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(0x5021, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  parts.push(local, name, packed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(0x0314, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt16LE(0x5021, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += local.length + name.length + packed.length;
}
const centralSize = central.reduce((sum, b) => sum + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(output, Buffer.concat([...parts, ...central, end]));
const mb = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
console.log(`Created infra/floci/build/api.zip (${files.length} files, ${mb} MB). .env is NOT included.`);
