import {chromium} from '/Users/diego/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--allow-file-access-from-files']});
const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1,offline:true});const page=await context.newPage();let errors=[],requests=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log(m.text());}});page.on('request',r=>requests.push(r.url()));
await page.goto('file:///Users/diego/Downloads/miami-gpt/ocean-drive.html');await page.waitForFunction(()=>window.sceneReady,null,{timeout:120000});
await page.waitForTimeout(1500);
for(const t of [5,38,78,115]){await page.evaluate(t=>window.oceanDrive.seek(t),t);await page.waitForTimeout(400);await page.screenshot({path:`review/final-${String(t).padStart(3,'0')}.png`});}
await page.evaluate(()=>window.oceanDrive.seek(10));const fps=await page.evaluate(async()=>{let times=[],start=performance.now();for(let i=0;i<75;i++){await new Promise(requestAnimationFrame);times.push(performance.now());}return{fps:75000/(performance.now()-start),maxFrameMs:Math.max(...times.slice(1).map((v,i)=>v-times[i]))};});
await page.click('#play');await page.waitForTimeout(600);let playing=await page.evaluate(()=>window.oceanDrive.stats.time>10.1);await page.click('#play');let a=await page.evaluate(()=>window.oceanDrive.stats.time);await page.waitForTimeout(150);let paused=await page.evaluate(t=>window.oceanDrive.stats.time===t,a);
await page.locator('#seek').fill('50');await page.locator('#seek').dispatchEvent('input');let seeking=await page.evaluate(()=>Math.abs(window.oceanDrive.stats.time-62.5)<.01);
await page.keyboard.press('h');let hidden=await page.locator('body').evaluate(b=>b.classList.contains('clean'));await page.keyboard.press('h');
await page.click('#quality');let balanced=await page.evaluate(()=>window.oceanDrive.stats.quality==='balanced');await page.click('#quality');
await page.evaluate(()=>window.oceanDrive.seek(5));await page.keyboard.press('h');await page.waitForTimeout(650);await page.screenshot({path:'review/ocean-drive-preview.png'});await page.keyboard.press('h');await page.waitForTimeout(650);
const stats=await page.evaluate(()=>window.oceanDrive.stats);
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.oceanDrive.seek(25));await page.waitForTimeout(650);await page.screenshot({path:'review/mobile.png'});let mobileNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth);
const result={errors,externalRequests:requests.filter(r=>/^https?:/.test(r)),checks:{playing,paused,seeking,hidden,balanced,mobileNoOverflow},performance:fps,stats};fs.writeFileSync('review/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();
