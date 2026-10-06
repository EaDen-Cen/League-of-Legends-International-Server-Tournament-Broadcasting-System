/// <reference lib="dom" />
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import heroes from '../../src/components/HeroList.js';
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
  const page = await browser.newPage();
  const rows = await page.evaluate(async entries => {
    const result: {id:number;name:string;url?:string;width?:number;height?:number;status:string}[]=[];
    // Limit concurrent CDN requests and wait for actual browser image decoding.
    for (let i=0;i<entries.length;i+=8) result.push(...await Promise.all(entries.slice(i,i+8).map(async h => {
      if (!h.artLink || h.artLink===h.imageLink) return {id:h.id,name:h.englishName,status:'missing'};
      const img = new Image();
      const loaded = await new Promise<boolean>(resolve => {
        const timer=setTimeout(()=>resolve(false),20000);
        img.onload=()=>{clearTimeout(timer);resolve(true);}; img.onerror=()=>{clearTimeout(timer);resolve(false);};img.src=h.artLink!;
      });
      return {id:h.id,name:h.englishName,url:h.artLink,width:img.naturalWidth,height:img.naturalHeight,status:!loaded?'unreachable':Math.max(img.naturalWidth,img.naturalHeight)>=1000?'verified':'low-resolution'};
    })));
    return result;
  }, heroes.map(({id,englishName,artLink,imageLink})=>({id,englishName,artLink,imageLink})));
  await mkdir('../research/hero-sync',{recursive:true});
  await writeFile('../research/hero-sync/art-audit.json',JSON.stringify({checkedAt:new Date().toISOString(),rows},null,2)+'\n');
  console.log(JSON.stringify({total:rows.length,counts:rows.reduce((counts,r)=>({...counts,[r.status]:(counts[r.status]||0)+1}),{} as Record<string,number>),issues:rows.filter(r=>r.status!=='verified')},null,2));
} finally { await browser.close(); }
