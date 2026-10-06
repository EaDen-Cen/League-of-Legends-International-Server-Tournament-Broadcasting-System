import test from 'node:test';
import assert from 'node:assert/strict';
import heroes from '../src/components/HeroList.js';
import { enterTarget, heroMatchesSearch } from '../src/control/heroSearch.js';

const hero=(name:string)=>{
  const found=heroes.find(item=>item.chineseName===name);
  assert.ok(found,`missing hero ${name}`);
  return found;
};

test('Chinese hero search supports pinyin initials',()=>{
  assert.equal(heroMatchesSearch(hero('阿狸'),'al','zh'),true);
  assert.equal(heroMatchesSearch(hero('盖伦'),'gl','zh'),true);
  assert.equal(heroMatchesSearch(hero('安妮'),'an','zh'),true);
  assert.equal(heroMatchesSearch(hero('艾希'),'ax','zh'),true);
  assert.equal(heroMatchesSearch(hero('阿狸'),'AL','zh'),true);
});

test('initial-only matching is limited to Chinese mode while normal text search still works',()=>{
  assert.equal(heroMatchesSearch(hero('盖伦'),'gl','eng'),false);
  assert.equal(heroMatchesSearch(hero('盖伦'),'Garen','eng'),true);
  assert.equal(heroMatchesSearch(hero('阿狸'),'Ahri','eng'),true);
});

test('Enter target is the first eligible filtered hero only when a query exists',()=>{
  const eligible=[{id:105},{id:54}];
  assert.equal(enterTarget(eligible,'al')?.id,105);
  assert.equal(enterTarget(eligible,'   '),undefined);
  assert.equal(enterTarget([],'al'),undefined);
});
