// Optional real-browser regression: npm install --no-save playwright, then run this file.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.setContent(`
    <button id="first">First</button>
    <div style="visibility:hidden">
      <button id="inherited-hidden">Hidden</button>
      <button id="visible-child" style="visibility:visible">Visible child</button>
    </div>
    <div style="display:none"><button id="display-none">Excluded</button></div>
    <div inert><button id="inert">Excluded</button></div>
    <button id="last">Last</button>
  `);
  await page.addScriptTag({path:fileURLToPath(new URL('../public/assets/player.js',import.meta.url))});
  assert.deepEqual(await page.evaluate(()=>StudioPlayer.candidates().map(node=>node.id)),['first','visible-child','last']);
  await page.locator('#first').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'visible-child');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'last');
  console.log('PASS: visible descendants remain candidates and match real Tab navigation');
} finally {
  await browser.close();
}
