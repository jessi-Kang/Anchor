/**
 * 참고 화면(design/screens/<ID>.html)과 실제 앱 화면을 390×844 로 찍어 픽셀 비교한다.
 *   pnpm design:check O01 http://localhost:3000/?fixed=1
 *
 * 출력: .design-check/<ID>-ref.png, <ID>-app.png, <ID>-diff.png + 불일치 비율.
 * 참고 HTML 은 Google Fonts 를 네트워크로 받고 앱은 next/font 로 self-host 하므로
 * 글리프 렌더링에 1px 안팎의 차이가 생길 수 있다. 레이아웃이 맞으면 보통 1~3% 안이다.
 */
import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const [id, appUrl] = process.argv.slice(2);
if (!id || !appUrl) {
  console.error("usage: pnpm design:check <SCREEN_ID> <APP_URL>");
  process.exit(2);
}

const W = 390;
const H = 844;
const outDir = path.resolve(process.cwd(), ".design-check");
mkdirSync(outDir, { recursive: true });

function findChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium")).sort().reverse()) {
    for (const c of ["chrome-linux/chrome", "chrome-linux64/chrome"]) {
      const p = path.join(root, dir, c);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

async function main() {
  const refPath = path.resolve(process.cwd(), `design/screens/${id}.html`);
  if (!existsSync(refPath)) throw new Error(`참고 화면 없음: ${refPath}`);

  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  const ref = await ctx.newPage();
  await ref.goto(`file://${refPath}`);
  await ref.waitForLoadState("networkidle").catch(() => undefined);
  await ref.evaluate(() => document.fonts.ready);
  const refPng = await ref.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });

  const app = await ctx.newPage();
  await app.goto(appUrl, { waitUntil: "networkidle" });
  await app.evaluate(() => document.fonts.ready);
  const appPng = await app.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });

  await browser.close();

  writeFileSync(path.join(outDir, `${id}-ref.png`), refPng);
  writeFileSync(path.join(outDir, `${id}-app.png`), appPng);

  const a = PNG.sync.read(refPng);
  const b = PNG.sync.read(appPng);
  const diff = new PNG({ width: W, height: H });
  const mismatched = pixelmatch(a.data, b.data, diff.data, W, H, { threshold: 0.1 });
  writeFileSync(path.join(outDir, `${id}-diff.png`), PNG.sync.write(diff));

  const pct = (mismatched / (W * H)) * 100;
  console.log(`${id}: 불일치 픽셀 ${mismatched} / ${W * H} (${pct.toFixed(2)}%) → .design-check/${id}-diff.png`);
  if (pct > 5) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
