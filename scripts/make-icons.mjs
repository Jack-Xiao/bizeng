import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf){
  let table = [];
  for(let n=0; n<256; n++){
    let c = n;
    for(let k=0; k<8; k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1;
    table[n] = c>>>0;
  }
  let crc = 0xFFFFFFFF;
  for(const b of buf) crc = table[(crc^b)&0xFF] ^ (crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}

function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data])));
  return Buffer.concat([len,t,data,crc]);
}

function png(size, [r,g,b]){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
  ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1+size*3);
  for(let x=0; x<size; x++){ row[1+x*3] = r; row[2+x*3] = g; row[3+x*3] = b; }
  const raw = Buffer.concat(Array(size).fill(row));
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

mkdirSync('icons', { recursive: true });
for(const size of [180,192,512]) writeFileSync(`icons/icon-${size}.png`, png(size, [37,99,235]));
console.log('icons generated');
