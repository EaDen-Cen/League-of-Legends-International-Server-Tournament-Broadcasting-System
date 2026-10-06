import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import heroes from '../src/components/HeroList.js';
import { initialState, phases } from '../src/shared/types.js';
import { heroArtCrop } from '../src/data/heroArtFocus.js';
import { heroSortModes, sortHeroes } from '../src/control/heroSort.js';
import { recognizeImage } from './capture.js';

test('standard LoL draft follows both ban rounds and ten picks', () => {
  assert.equal(phases('match').map(p=>p.team[0]+p.action[0]).join(' '),
    'bb rb bb rb bb rb bp rp rp bp bp rp rb bb rb bb rp bp bp rp');
  const state = initialState();
  assert.deepEqual(state.blueTeam.playerRoles, ['top','jungle','mid','bot','support']);
  assert.equal(state.bpInputMode, 'manual');
  assert.equal(state.draftRuleMode, 'normal');
});

test('LoL art uses neutral defaults and preserves director crop overrides', () => {
  assert.deepEqual(heroArtCrop(19,'panel'), {x:50,y:31,scale:1.12});
  assert.deepEqual(heroArtCrop(19,'side',{side:{x:44,y:23,scale:1.41}}), {x:44,y:23,scale:1.41});
  assert.equal(heroArtCrop(1,'panel',{panel:{x:47,y:0,scale:.6}}).scale,1);
  assert.ok(heroes.every(hero => !hero.counter && !hero.combo && !hero.variantGroup));
  const annie = heroes.find(hero => hero.englishName === 'Annie');
  assert.equal(annie?.chineseName, '安妮');
  assert.ok(annie?.aliases?.includes('黑暗之女'));
  assert.match(annie?.artLink || '', /\/champion\/splash\/Annie_0\.jpg$/);
});

test('all sorting modes retain unavailable champions at the end', () => {
  const unavailable = new Set([1,103]);
  for (const mode of heroSortModes) {
    assert.deepEqual(sortHeroes(heroes,mode,id=>unavailable.has(id)).slice(-2).map(h=>h.id).sort((a,b)=>a-b),[1,103]);
  }
});

test('recognition templates use LoL portraits and Riot IDs', async () => {
  const hero = heroes.find(h=>h.id===103)!;
  const result = await recognizeImage(readFileSync(new URL(`../public${hero.imageLink}`,import.meta.url)));
  assert.equal(result[0].heroId,103);
  assert.ok(result[0].confidence > .99);
});
