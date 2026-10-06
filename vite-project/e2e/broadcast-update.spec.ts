import { test, expect } from '@playwright/test';
import { harness } from './harness';
import heroes from '../src/components/HeroList';

test('empty history, inline settings and BO win boxes follow authoritative side swaps',async({browser,baseURL})=>{
  const h=await harness(baseURL),context=await browser.newContext({viewport:{width:1920,height:1080}});
  try {
    await h.send({type:'reset_match'});
    await h.send({type:'settings',settings:{...h.state(),language:'eng',scoreDisplay:'boxes',overlayLayout:'side'}});
    const page=await context.newPage();await page.goto('/overlay/draft#token=e2e-overlay');
    await expect(page.locator('.broadcast-side')).toBeVisible();
    await expect(page.locator('.draft-history')).toHaveCount(0);
    for (const [format,count] of [['BO1',1],['BO3',2],['BO5',3]] as const) {
      await h.send({type:'settings',settings:{...h.state(),seriesFormat:format}});
      await expect(page.locator('.blue-score .score-box')).toHaveCount(count);
      await expect(page.locator('.red-score .score-box')).toHaveCount(count);
    }
    await h.send({type:'score',team:'blue',delta:1});
    await expect(page.locator('.blue-score .lit')).toHaveCount(1);
    await h.send({type:'swap_sides'});await expect(page.locator('.red-score .lit')).toHaveCount(1);
    expect((await page.locator('.ban.hero-slot').first().boundingBox())!.width).toBeGreaterThanOrEqual(72);
    const control=await context.newPage();await control.goto('/control#token=e2e-control');
    await control.getByRole('button',{name:'Match settings',exact:true}).click();
    await expect(control.locator('.control-monitor .settings-inline')).toBeVisible();
    await expect(control.locator('dialog[open]')).toHaveCount(0);
    const below=await control.locator('.settings-inline').evaluate(e=>!!(e.previousElementSibling?.classList.contains('lifecycle')));
    expect(below).toBe(true);
    await h.fill();
    await expect(page.locator('.hero-art')).toHaveCount(10);
    await expect(page.locator('.ban.hero-slot')).toHaveCount(10);
    const footer = (await page.locator('.broadcast-bottom > .phase').boundingBox())!;
    const leftBan = (await page.locator('.ban-team.display-left .hero-slot').last().boundingBox())!;
    const rightBan = (await page.locator('.ban-team.display-right .hero-slot').first().boundingBox())!;
    expect(leftBan.x + leftBan.width).toBeLessThan(footer.x);
    expect(rightBan.x).toBeGreaterThan(footer.x + footer.width);
    await expect(page.locator('.hero-reveal:not([class="hero-reveal"])')).toHaveCount(0);
    await page.screenshot({path:'artifacts/side-full-art.png',omitBackground:true});
  } finally {await h.send({type:'reset_match'});h.close();await context.close();}
});

test('recognition requires review; rejection and stale results cannot submit; manual fallback works',async({browser,baseURL})=>{
  const h=await harness(baseURL),context=await browser.newContext();
  try {
    await h.send({type:'reset_match'});await h.send({type:'settings',settings:{...h.state(),language:'eng',bpInputMode:'screen'}});
    const page=await context.newPage();let fail=false;
    await page.route('**/api/capture',route=>route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{error:'disabled'}:{candidates:[{heroId:heroes[0].id,confidence:.96}],preview:'data:image/png;base64,iVBORw0KGgo='})}));
    await page.goto('/control#token=e2e-control');
    await page.getByRole('button',{name:'Legacy capture',exact:true}).click();
    const readStable = async () => {
      const read = page.getByRole('button',{name:'Recognize now',exact:true});
      await read.click();
      await expect(read).toBeEnabled();
      if (!await page.getByRole('dialog').count()) await read.click();
    };
    await readStable();
    await expect(page.getByRole('dialog',{name:'Review recognition'})).toBeVisible();
    expect(h.state().currentPhase).toBe(0);
    await page.getByRole('button',{name:'Reject / keep watching'}).click();expect(h.state().currentPhase).toBe(0);
    await readStable();
    await expect(page.getByRole('dialog')).toBeVisible();
    await h.send({type:'skip_ban',team:'blue'});await expect(page.getByRole('dialog')).toHaveCount(0);
    await h.send({type:'undo'});
    await readStable();
    await page.getByRole('button',{name:'Confirm and submit'}).click();
    await expect.poll(()=>h.state().currentPhase).toBe(1);
    expect(h.state().blueBans).toEqual([heroes[0].id]);
    fail=true;await page.getByRole('button',{name:'Recognize now',exact:true}).click();
    await expect(page.locator('.screen-input [role="status"]')).toContainText('Capture unavailable');
    await page.getByLabel('Search heroes',{exact:true}).fill(heroes[1].englishName);
    await page.locator('.hero-grid button:not(:disabled)').first().click();
    await expect.poll(()=>h.state().currentPhase).toBe(2);
  } finally {await h.send({type:'reset_match'});h.close();await context.close();}
});
