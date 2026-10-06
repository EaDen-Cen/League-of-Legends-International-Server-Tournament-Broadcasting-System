import type { OfficialHeroEvidence } from './types.js';
import { normalizeName } from './normalize.js';

const BASE = 'https://world.honorofkings.com/zlkdatasys/ip/hero';
const headers = {
  'user-agent': 'HOK-Broadcast-Hero-Sync/1.0 (+https://github.com/EaDen-Cen/HOK_Ban_Pick)',
  accept: 'text/html,application/xhtml+xml',
};

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value: string) {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim();
}

function titleFromHtml(html: string) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const value = stripTags(h1[1]).replace(/^Champion\s+Deatails\s+/i, '').trim();
    if (value) return value;
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title ? stripTags(title[1]).replace(/^Champion\s+Deatails\s+/i, '').trim() : undefined;
}

function attr(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? decodeHtml(match[1]) : undefined;
}

function officialAssetUrl(raw: string, pageUrl: string) {
  try {
    const url = new URL(raw, pageUrl);
    if (url.protocol !== 'https:') return undefined;
    const host = url.hostname.toLowerCase();
    const trusted =
      host === 'honorofkings.com' ||
      host.endsWith('.honorofkings.com') ||
      host.endsWith('.gtimg.cn') ||
      host.endsWith('.qpic.cn') ||
      host.endsWith('.qq.com');
    return trusted ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pick the page's main hero/key art rather than skin appreciation, skill icons,
 * QR codes or small avatar assets. The browser will crop this art to whatever
 * card aspect ratio the overlay uses.
 */
export function extractOfficialHeroArt(html: string, pageUrl: string, expectedEnglishName: string) {
  const skinIndex = html.search(/SKIN\s+APPRECIATION/i);
  const scope = skinIndex > 0 ? html.slice(0, skinIndex) : html;
  const normalizedName = normalizeName(expectedEnglishName);
  const candidates: Array<{ url: string; score: number }> = [];

  for (const match of scope.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const raw =
      attr(tag, 'data-original') ||
      attr(tag, 'data-src') ||
      attr(tag, 'data-lazy-src') ||
      attr(tag, 'src');
    if (!raw) continue;

    const url = officialAssetUrl(raw, pageUrl);
    if (!url) continue;

    const alt = decodeHtml(attr(tag, 'alt') || '');
    const title = decodeHtml(attr(tag, 'title') || '');
    const className = attr(tag, 'class') || '';
    const id = attr(tag, 'id') || '';
    const descriptor = `${alt} ${title} ${className} ${id} ${url}`.toLowerCase();

    if (/(skin|skill|icon|logo|qrcode|qr-code|avatar|head|badge|button|btn)/i.test(descriptor)) continue;

    let score = 0;
    const normalizedAlt = normalizeName(alt);
    if (normalizedAlt && normalizedAlt === normalizedName) score += 120;
    if (/hero[ _-]?data/i.test(descriptor)) score += 100;
    if (/hero[ _-]?(art|story|cover|kv|poster|role|character)/i.test(descriptor)) score += 80;
    if (/(cover|poster|banner|kv|role|character|story)/i.test(descriptor)) score += 35;
    if (/(origin|original|large|big|pc|desktop|1920|1080|1440|2160)/i.test(url)) score += 20;

    const width = Number(attr(tag, 'width') || 0);
    const height = Number(attr(tag, 'height') || 0);
    if (width >= 700 || height >= 700) score += 25;
    if (width >= 1200 || height >= 1200) score += 20;

    // The main character image is normally one of the first hero-related assets
    // on the official page. A modest base score lets a clean hero-name match win
    // without accepting arbitrary decorative images.
    if (score >= 60) candidates.push({ url, score });
  }

  // Some official pages use inline background images for the key visual.
  for (const match of scope.matchAll(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi)) {
    const url = officialAssetUrl(match[2], pageUrl);
    if (!url) continue;
    const around = scope.slice(Math.max(0, (match.index || 0) - 240), (match.index || 0) + 260).toLowerCase();
    if (/(skin|skill|icon|logo|qrcode|avatar)/i.test(around)) continue;
    let score = 0;
    if (/hero/.test(around)) score += 70;
    if (/(cover|poster|banner|kv|role|character|story)/i.test(around)) score += 35;
    if (score >= 60) candidates.push({ url, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url;
}

export function extractOfficialPickRate(html: string) {
  const patterns = [
    /["']?pickRate["']?\s*[:=]\s*["']?([0-9]+(?:\.[0-9]+)?)/i,
    /["']?pick_rate["']?\s*[:=]\s*["']?([0-9]+(?:\.[0-9]+)?)/i,
    /Pick\s*Rate[\s\S]{0,180}?([0-9]+(?:\.[0-9]+)?)\s*%/i,
    /([0-9]+(?:\.[0-9]+)?)\s*%[\s\S]{0,100}?Pick\s*Rate/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 0 && value <= 100) return value;
  }
  return undefined;
}

async function optionalPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchOfficialHeroEvidence(campId: number, expectedEnglishName: string, options: { includeChinese?: boolean } = {}): Promise<OfficialHeroEvidence> {
  const englishUrl = `${BASE}/en/${campId}.html`;
  const chineseUrl = `${BASE}/zh-Hant/${campId}.html`;
  const [englishHtml, chineseHtml] = await Promise.all([optionalPage(englishUrl), options.includeChinese === false ? Promise.resolve(undefined) : optionalPage(chineseUrl)]);
  const englishName = englishHtml ? titleFromHtml(englishHtml) : undefined;
  const chineseName = chineseHtml ? titleFromHtml(chineseHtml) : undefined;
  const confirmed = Boolean(englishName && normalizeName(englishName) === normalizeName(expectedEnglishName));
  const artUrl = englishHtml ? extractOfficialHeroArt(englishHtml, englishUrl, expectedEnglishName) : undefined;
  return { campId, englishName, chineseName, artUrl, englishUrl, chineseUrl, confirmed };
}


export async function fetchOfficialHeroRankStats(campId: number) {
  const sourceUrl = `https://camp.honorofkings.com/h5/hero-detail/index.html?heroId=${campId}`;
  const html = await optionalPage(sourceUrl);
  return {
    sourceUrl,
    pickRate: html ? extractOfficialPickRate(html) : undefined,
    checkedAt: new Date().toISOString(),
  };
}
