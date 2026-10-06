import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import heroes from '../../src/components/HeroList.js';
import autoSyncedHeroes from '../../src/data/autoSyncedHeroes.js';
import heroSyncOverrides from '../../src/data/heroSyncOverrides.js';
import type { Hero } from '../../src/data/heroTypes.js';
import { downloadHeroAsset } from './assets.js';
import { fetchCatalog, fetchCatalogHeroDetail, CATALOG_URL } from './fetchCatalog.js';
import { fetchOfficialHeroEvidence, fetchOfficialHeroRankStats } from './fetchOfficial.js';
import { makePlan, nextLocalIds } from './compare.js';
import { mergeOverride, renderAutoSyncedHeroes, renderOverrides, type HeroOverride } from './generated.js';
import { normalizeName, uniqueStrings } from './normalize.js';
import { updateHeroDocuments } from './documents.js';
import { needsChineseNameBackfill, PLACEHOLDER_CHINESE_NAMES, preferredChineseHeroName } from './localizedNames.js';
import type { AssetRecord, SourceSnapshot, SyncAudit } from './types.js';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const repoRoot = resolve(projectRoot, '..');
const snapshotPath = resolve(repoRoot, 'research/hero-sync/catalog-snapshot.json');
const autoHeroesPath = resolve(projectRoot, 'src/data/autoSyncedHeroes.ts');
const overridesPath = resolve(projectRoot, 'src/data/heroSyncOverrides.ts');
const publicDir = resolve(projectRoot, 'public');

async function readSnapshot(): Promise<SourceSnapshot | undefined> {
  try {
    return JSON.parse(await readFile(snapshotPath, 'utf8')) as SourceSnapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function assertSourceHealth(previous: SourceSnapshot | undefined, remoteCount: number) {
  if (!previous?.heroes.length) return;
  const floor = Math.max(80, Math.floor(previous.heroes.length * 0.9));
  if (remoteCount < floor) {
    throw new Error(
      `Remote roster dropped from ${previous.heroes.length} to ${remoteCount}; refusing a likely partial source response`,
    );
  }
}

function artworkBackfill(plan: ReturnType<typeof makePlan>) {
  return plan.matches.filter(match => !match.local.artLink || match.local.artLink === match.local.imageLink || match.local.campId === undefined);
}

const PICK_RATE_REFRESH_MS = 6 * 24 * 60 * 60 * 1000;
function pickRateRefresh(plan: ReturnType<typeof makePlan>) {
  const now = Date.now();
  return plan.matches.filter(match => {
    const stamp = match.local.officialPickRateUpdatedAt;
    if (!stamp) return true;
    const parsed = Date.parse(stamp);
    return !Number.isFinite(parsed) || now - parsed >= PICK_RATE_REFRESH_MS;
  });
}

function compactSummary(plan: ReturnType<typeof makePlan>) {
  const artBackfill = artworkBackfill(plan);
  return {
    changed: plan.changed || artBackfill.length > 0 || pickRateRefresh(plan).length > 0,
    checkedAt: plan.checkedAt,
    remoteCount: plan.remoteCount,
    baselineMissing: plan.baselineMissing,
    additions: plan.additions.map(hero => ({ campId: hero.campId, englishName: hero.englishName, occupation: hero.occupation })),
    artworkBackfill: artBackfill.map(match => ({ localId: match.local.id, campId: match.remote.campId, englishName: match.remote.englishName })),
    pickRateRefresh: pickRateRefresh(plan).map(match => ({ localId: match.local.id, campId: match.remote.campId, englishName: match.remote.englishName })),
    sourceChanges: plan.sourceChanges,
    localDifferences: plan.localDifferences,
    missingLocalWarnings: plan.missingLocal.map(hero => ({ id: hero.id, englishName: hero.englishName, campId: hero.campId })),
  };
}

function newHero(args: {
  id: number;
  englishName: string;
  chineseName: string;
  occupation: string;
  campId: number;
  imageLink: string;
  artLink?: string;
}): Hero {
  const hero: Hero = {
    id: args.id,
    englishName: args.englishName,
    chineseName: args.chineseName,
    occupation: args.occupation,
    altOccupation: '',
    campId: args.campId,
    imageLink: args.imageLink,
    artLink: args.artLink,
    combo: [],
    counter: [],
    beCountered: [],
    relationshipStatus: 'unverified',
  };
  if (normalizeName(args.englishName).startsWith('flowborn')) hero.variantGroup = 'flowborn';
  return hero;
}

async function applyUpdate(
  remoteHeroes: Awaited<ReturnType<typeof fetchCatalog>>,
  previous: SourceSnapshot | undefined,
  plan: ReturnType<typeof makePlan>,
) {
  const autoHeroes = structuredClone(autoSyncedHeroes) as Hero[];
  const overrides = structuredClone(heroSyncOverrides) as Record<number, HeroOverride>;
  const assets: AssetRecord[] = [];
  const manualReview: string[] = [];
  const additionsAudit: SyncAudit['additions'] = [];
  const overrideAudit: SyncAudit['metadataOverrides'] = [];

  const orderedAdditions = [...plan.additions].sort((a, b) => a.campId - b.campId);
  const ids = nextLocalIds(heroes, orderedAdditions.length);

  for (let index = 0; index < orderedAdditions.length; index++) {
    let remote = orderedAdditions[index];
    const id = ids[index];
    if (!remote.imageUrl) {
      try {
        remote = await fetchCatalogHeroDetail(remote.campId);
      } catch (error) {
        manualReview.push(`Skipped new hero ${remote.englishName} (${remote.campId}): detail fetch failed (${error instanceof Error ? error.message : 'unknown error'}).`);
        continue;
      }
    }
    if (!remote.imageUrl) {
      manualReview.push(`Skipped new hero ${remote.englishName} (${remote.campId}): no official CDN hero image found on catalog detail page.`);
      continue;
    }

    const evidence = await fetchOfficialHeroEvidence(remote.campId, remote.englishName);
    if (!evidence.confirmed) {
      manualReview.push(
        `New hero ${remote.englishName} (${remote.campId}) was discovered by the catalog but could not be name-confirmed on the official IP page. The generated PR requires manual review.`,
      );
    }

    const asset = await downloadHeroAsset({
      heroId: id,
      campId: remote.campId,
      sourceUrl: remote.imageUrl,
      publicDir,
    });
    assets.push(asset);

    const chineseName = preferredChineseHeroName(remote.englishName, evidence.chineseName) || remote.englishName;
    if (!preferredChineseHeroName(remote.englishName, evidence.chineseName)) {
      manualReview.push(`No official zh-Hant name was available for ${remote.englishName}; Chinese display temporarily falls back to English.`);
    }

    const created = newHero({
      id,
      englishName: remote.englishName,
      chineseName,
      occupation: remote.occupation,
      campId: remote.campId,
      imageLink: asset.localPath,
      artLink: evidence.confirmed ? evidence.artUrl : undefined,
    });
    autoHeroes.push(created);
    additionsAudit.push({
      localId: id,
      campId: remote.campId,
      englishName: created.englishName,
      chineseName: created.chineseName,
      occupation: created.occupation,
      officialConfirmed: evidence.confirmed,
    });
  }

  // Backfill stable Camp IDs and high-resolution official character/key art for
  // every existing hero matched by the international catalog. Full artwork is
  // stored as a remote official-CDN URL; the small local icon remains the
  // offline fallback and continues to be used by bans/history/search grids.
  for (const match of artworkBackfill(plan)) {
    const evidence = await fetchOfficialHeroEvidence(match.remote.campId, match.remote.englishName, { includeChinese: false });
    const next: HeroOverride = {};

    if (!match.local.artLink || match.local.artLink === match.local.imageLink) {
      // A thumbnail fallback is not full art, and must never stop future retries.
      if (evidence.artUrl && evidence.confirmed) next.artLink = evidence.artUrl;
      if (!evidence.artUrl || !evidence.confirmed) {
        manualReview.push(
          `No high-resolution official key art was detected for local hero #${match.local.id} ${match.local.englishName}; overlay will keep using the local icon fallback.`,
        );
      }
    }

    if (Object.keys(next).length > 0) {
      overrides[match.local.id] = mergeOverride(overrides[match.local.id], next);
      overrideAudit.push({ localId: match.local.id, campId: match.remote.campId, fields: next });
    }
  }

  // Ranked pick rate is dynamic official metadata. Refresh it at most once per
  // weekly sync cycle, in small batches to avoid hammering HOK CAMP.
  // Existing heroes can remain stuck on a placeholder Chinese name even when
  // their stable Camp identity and English name never change. Re-check only
  // those suspicious entries against official localized evidence.
  for (const match of plan.matches.filter(item => needsChineseNameBackfill(item.local))) {
    const evidence = await fetchOfficialHeroEvidence(match.remote.campId, match.remote.englishName);
    const chineseName = preferredChineseHeroName(match.remote.englishName, evidence.chineseName);
    if (!chineseName || chineseName === match.local.chineseName) continue;

    const next: HeroOverride = {
      chineseName,
      aliases: uniqueStrings([
        ...(match.local.aliases || []),
        ...(PLACEHOLDER_CHINESE_NAMES.has(match.local.chineseName.trim().toLowerCase()) ? [] : [match.local.chineseName]),
      ]),
    };
    overrides[match.local.id] = mergeOverride(overrides[match.local.id], next);
    overrideAudit.push({ localId: match.local.id, campId: match.remote.campId, fields: next });
  }

  const statsCandidates = pickRateRefresh(plan);
  let pickRateFailures = 0;
  for (let start = 0; start < statsCandidates.length; start += 6) {
    const batch = statsCandidates.slice(start, start + 6);
    const results = await Promise.all(batch.map(async match => ({
      match,
      stats: await fetchOfficialHeroRankStats(match.remote.campId),
    })));
    for (const { match, stats } of results) {
      if (stats.pickRate === undefined) {
        pickRateFailures++;
        continue;
      }
      const next: HeroOverride = {
        officialPickRate: stats.pickRate,
        officialPickRateUpdatedAt: stats.checkedAt,
      };
      overrides[match.local.id] = mergeOverride(overrides[match.local.id], next);
      overrideAudit.push({ localId: match.local.id, campId: match.remote.campId, fields: next });
    }
  }
  if (pickRateFailures) {
    manualReview.push(`Official HOK CAMP pick rate could not be parsed for ${pickRateFailures} matched heroes; existing values were kept and will be retried later.`);
  }

  for (const difference of plan.localDifferences) {
    const match = plan.matches.find(item => item.local.id === difference.localId);
    if (!match) continue;

    if (difference.field === 'campId') {
      if (match.local.campId === undefined) {
        const next: HeroOverride = { campId: match.remote.campId };
        overrides[match.local.id] = mergeOverride(overrides[match.local.id], next);
        overrideAudit.push({ localId: match.local.id, campId: match.remote.campId, fields: next });
      } else if (match.local.campId !== match.remote.campId) {
        manualReview.push(
          `Camp ID mismatch for local hero #${match.local.id} ${match.local.englishName}: local ${match.local.campId} vs remote ${match.remote.campId}. Not auto-applied because this could indicate a bad identity match.`,
        );
      }
      continue;
    }

    if (difference.field === 'occupation') {
      manualReview.push(
        `Local lane differs from current auxiliary catalog for #${match.local.id} ${match.local.englishName}: ${match.local.occupation} → ${match.remote.occupation}. Not auto-applied because lane metadata is not sourced from an authoritative tournament feed.`,
      );
      continue;
    }

    if (difference.field === 'englishName') {
      const evidence = await fetchOfficialHeroEvidence(match.remote.campId, match.remote.englishName);
      if (!evidence.confirmed) {
        manualReview.push(
          `Local name differs from current catalog for #${match.local.id}: ${match.local.englishName} → ${match.remote.englishName}, but the official page did not confirm it. No runtime rename was applied.`,
        );
        continue;
      }
      const next: HeroOverride = {
        englishName: match.remote.englishName,
        aliases: uniqueStrings([...(match.local.aliases || []), match.local.englishName]),
        campId: match.remote.campId,
      };
      overrides[match.local.id] = mergeOverride(overrides[match.local.id], next);
      overrideAudit.push({ localId: match.local.id, campId: match.remote.campId, fields: next });
    }
  }

  for (const change of plan.sourceChanges) {
    if (change.field === 'added' || change.field === 'missing') continue;
    const match = plan.matches.find(item => item.remote.campId === change.campId);
    if (!match) continue;

    if (change.field === 'occupation') {
      manualReview.push(
        `Lane changed in auxiliary catalog for ${match.remote.englishName}: ${change.before} → ${change.after}. Not auto-applied because lane metadata is not sourced from an authoritative tournament feed.`,
      );
      continue;
    }

    if (change.field === 'englishName') {
      const evidence = await fetchOfficialHeroEvidence(match.remote.campId, match.remote.englishName);
      if (!evidence.confirmed) {
        manualReview.push(
          `Name changed in catalog for local hero #${match.local.id}: ${change.before} → ${change.after}, but the official page did not confirm it. No runtime rename was applied.`,
        );
        continue;
      }
      const next: HeroOverride = {
        englishName: match.remote.englishName,
        aliases: uniqueStrings([...(match.local.aliases || []), match.local.englishName, change.before || '']),
        campId: match.remote.campId,
      };
      overrides[match.local.id] = mergeOverride(overrides[match.local.id], next);
      overrideAudit.push({ localId: match.local.id, campId: match.remote.campId, fields: next });
      continue;
    }

    if (change.field === 'imageUrl' && match.remote.imageUrl) {
      const asset = await downloadHeroAsset({
        heroId: match.local.id,
        campId: match.remote.campId,
        sourceUrl: match.remote.imageUrl,
        publicDir,
      });
      assets.push(asset);
      const next: HeroOverride = { imageLink: asset.localPath, campId: match.remote.campId };
      overrides[match.local.id] = mergeOverride(overrides[match.local.id], next);
      overrideAudit.push({ localId: match.local.id, campId: match.remote.campId, fields: next });
    }
  }

  const snapshot: SourceSnapshot = {
    checkedAt: plan.checkedAt,
    source: CATALOG_URL,
    heroes: remoteHeroes,
  };

  const audit: SyncAudit = {
    checkedAt: plan.checkedAt,
    mode: 'update',
    sources: {
      catalog: CATALOG_URL,
      officialEnglishPattern: 'https://world.honorofkings.com/zlkdatasys/ip/hero/en/{campId}.html',
      officialChinesePattern: 'https://world.honorofkings.com/zlkdatasys/ip/hero/zh-Hant/{campId}.html',
    },
    remoteCount: plan.remoteCount,
    additions: additionsAudit,
    metadataOverrides: overrideAudit,
    manualReview,
    missingLocalWarnings: plan.missingLocal.map(
      hero => `Local hero #${hero.id} ${hero.englishName} was not found in the current auxiliary catalog. It was NOT deleted.`,
    ),
    sourceChanges: plan.sourceChanges,
    localDifferences: plan.localDifferences,
    assets,
  };

  await mkdir(resolve(repoRoot, 'research/hero-sync'), { recursive: true });
  await Promise.all([
    writeFile(autoHeroesPath, renderAutoSyncedHeroes(autoHeroes), 'utf8'),
    writeFile(overridesPath, renderOverrides(overrides), 'utf8'),
    writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8'),
    writeFile(
      resolve(repoRoot, `research/hero-sync/${plan.checkedAt.slice(0, 10)}.json`),
      JSON.stringify(audit, null, 2) + '\n',
      'utf8',
    ),
  ]);

  await updateHeroDocuments({
    baseHeroes: heroes,
    autoHeroes,
    overrides,
    checkedAt: plan.checkedAt,
    remoteCount: plan.remoteCount,
  });

  return audit;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const update = args.has('--update');
  const json = args.has('--json');
  if (update && args.has('--check')) throw new Error('Use either --check or --update, not both');

  const previous = await readSnapshot();
  const remoteHeroes = await fetchCatalog();
  assertSourceHealth(previous, remoteHeroes.length);
  const plan = makePlan(heroes, remoteHeroes, previous);

  if (!update) {
    const summary = compactSummary(plan);
    if (json) process.stdout.write(JSON.stringify(summary));
    else {
      console.log(`Hero sync check: ${plan.remoteCount} remote heroes, ${plan.additions.length} local additions, ${plan.sourceChanges.length} source changes, ${artworkBackfill(plan).length} artwork backfills, ${pickRateRefresh(plan).length} pick-rate refreshes.`);
      if (plan.baselineMissing) console.log('No catalog baseline exists yet; the first update will create one.');
      for (const hero of plan.additions) console.log(`+ NEW: ${hero.englishName} (camp ${hero.campId}, ${hero.occupation})`);
      for (const warning of plan.missingLocal) console.log(`! LOCAL ONLY (not deleted): #${warning.id} ${warning.englishName}`);
    }
    return;
  }

  if (!plan.changed && artworkBackfill(plan).length === 0 && pickRateRefresh(plan).length === 0) {
    console.log('Hero roster, artwork and official pick-rate metadata are up to date; no files changed.');
    return;
  }

  const audit = await applyUpdate(remoteHeroes, previous, plan);
  console.log(
    `Hero sync update prepared: ${audit.additions.length} additions, ${audit.metadataOverrides.length} safe metadata overrides, ${audit.manualReview.length} manual-review notes.`,
  );
}

await main();
