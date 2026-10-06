import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import heroes from '../src/components/HeroList.js';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngDimensions(bytes: Buffer, label: string) {
  assert.deepEqual(bytes.subarray(0, 8), pngSignature, `${label}: PNG signature`);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${label}: PNG header`);
  assert.equal(bytes.readUInt32BE(8), 13, `${label}: PNG header length`);
  const compressed: Buffer[] = [];
  let ended = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    const next = offset + size + 12;
    assert.ok(next <= bytes.length, `${label}: truncated PNG chunk`);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (kind === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + size));
    if (kind === 'IEND') { ended = true; break; }
    offset = next;
  }
  assert.ok(ended && compressed.length > 0, `${label}: complete PNG image data`);
  assert.ok(inflateSync(Buffer.concat(compressed)).length > 0, `${label}: decodable PNG data`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

// Three upstream assets use JPEG/WebP bytes despite their .png filenames.
// Keep these existing portraits usable while checking the actual file format.
function legacyImageDimensions(bytes: Buffer, label: string) {
  if (bytes.subarray(0, 8).equals(pngSignature)) return pngDimensions(bytes, label);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    assert.equal(bytes.readUInt16BE(bytes.length - 2), 0xffd9, `${label}: complete JPEG`);
    for (let offset = 2; offset + 9 <= bytes.length;) {
      assert.equal(bytes[offset], 0xff, `${label}: JPEG marker`);
      const marker = bytes[offset + 1];
      if (marker === 0xff) { offset++; continue; }
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
      }
      const size = bytes.readUInt16BE(offset + 2);
      assert.ok(size >= 2, `${label}: JPEG segment length`);
      offset += size + 2;
    }
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, `${label}: complete WebP`);
    const format = bytes.toString('ascii', 12, 16);
    if (format === 'VP8 ') {
      assert.equal(bytes.toString('hex', 23, 26), '9d012a', `${label}: WebP frame signature`);
      return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
    }
    if (format === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
    if (format === 'VP8L' && bytes[20] === 0x2f) {
      return [1 + bytes[21] + ((bytes[22] & 0x3f) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)];
    }
  }
  assert.fail(`${label}: unsupported or invalid image encoding`);
}

test('hero IDs and names are valid and unique; Riot champion IDs remain stable', () => {
  const ids = new Set<number>();
  const names = new Set<string>();
  for (const hero of heroes) {
    assert.ok(Number.isSafeInteger(hero.id) && hero.id > 0, `Invalid ID: ${hero.id}`);
    assert.ok(!ids.has(hero.id), `Duplicate ID: ${hero.id}`);
    assert.ok(hero.englishName.trim(), `ID ${hero.id} needs an English name`);
    assert.ok(hero.chineseName.trim(), `ID ${hero.id} needs a display name for Chinese mode`);
    const normalizedName = hero.englishName.trim().toLowerCase();
    assert.ok(!names.has(normalizedName), `Duplicate English name: ${hero.englishName}`);
    ids.add(hero.id); names.add(normalizedName);
  }
  assert.equal(heroes.length, 173);
  assert.equal(heroes.find(h=>h.id===29)?.englishName, 'Twitch');
  assert.equal(heroes.find(h=>h.id===103)?.chineseName, '阿狸');
});


test('hero relationships reference existing heroes and contain no self references or misspelled counter field', () => {
  const ids = new Set(heroes.map(hero => hero.id));
  for (const hero of heroes) {
    assert.ok(!Object.hasOwn(hero, 'couter'), `${hero.englishName}: misspelled counter field`);
    for (const field of ['counter', 'beCountered', 'combo'] as const) {
      for (const target of hero[field] ?? []) {
        assert.ok(ids.has(target), `${hero.englishName}.${field} references missing ID ${target}`);
        assert.notEqual(target, hero.id, `${hero.englishName}.${field} references itself`);
      }
    }
  }
});

test('every hero has a valid local portrait at its declared image path', () => {
  for (const hero of heroes) {
    assert.match(hero.imageLink, /^\/champions\/[A-Za-z0-9]+\.png$/);
    const label = `${hero.englishName} (${hero.imageLink})`;
    const bytes = readFileSync(new URL(`../public${hero.imageLink}`, import.meta.url));
    assert.ok(bytes.length >= 32, `${label}: missing image data`);
    const [width, height] = legacyImageDimensions(bytes, label);
    assert.ok(width > 0 && height > 0, `${label}: invalid dimensions ${width}×${height}`);
  }
});
