import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AssetRecord } from './types.js';

interface ImageInfo {
  extension: 'png' | 'jpg' | 'webp';
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
}

export function detectImage(buffer: Uint8Array): ImageInfo | undefined {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buffer.length >= 12 &&
    String.fromCharCode(...buffer.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...buffer.slice(8, 12)) === 'WEBP'
  ) {
    return { extension: 'webp', mime: 'image/webp' };
  }
  return undefined;
}

export function sha256(buffer: Uint8Array) {
  return createHash('sha256').update(buffer).digest('hex');
}

function allowedAssetUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('Hero asset must use HTTPS');
  if (url.hostname !== 'camp.honorofkings.com') throw new Error(`Untrusted hero asset host: ${url.hostname}`);
  return url;
}

export async function downloadHeroAsset(args: {
  heroId: number;
  campId: number;
  sourceUrl: string;
  publicDir: string;
}): Promise<AssetRecord> {
  const url = allowedAssetUrl(args.sourceUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'HOK-Broadcast-Hero-Sync/1.0' },
    });
    if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status} ${url}`);
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > 8 * 1024 * 1024) throw new Error(`Hero image is unexpectedly large: ${body.byteLength} bytes`);
    const info = detectImage(body);
    if (!info) throw new Error(`Unsupported or invalid hero image: ${url}`);

    const relative = `/heroesImg/${args.heroId}.${info.extension}`;
    const destination = `${args.publicDir}/heroesImg/${args.heroId}.${info.extension}`;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, body);

    return {
      heroId: args.heroId,
      campId: args.campId,
      sourceUrl: url.toString(),
      localPath: relative,
      sha256: sha256(body),
      mime: info.mime,
      bytes: body.byteLength,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateLocalImage(file: string) {
  const data = new Uint8Array(await readFile(file));
  return Boolean(detectImage(data));
}
