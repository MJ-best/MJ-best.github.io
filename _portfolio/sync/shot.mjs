// 사용: node shot.mjs <url> <out.png>   — 1440×900 데스크톱 화면 캡쳐
import { chromium } from 'playwright';

const [url, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
} catch (e) {
  console.log('goto:', String(e).slice(0, 120));
}
await page.waitForTimeout(1500);
// 첫 방문 안내 창이 화면을 가리면 닫는다
await page.keyboard.press('Escape').catch(() => {});
await page.screenshot({ path: out });
await browser.close();
