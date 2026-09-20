/**
 * 참고 화면(design/screens/*.html)이 화면 규칙을 지키는지 390×844 로 열어서 검사한다.
 *   pnpm design:lint            — 전부
 *   pnpm design:lint F03 O03    — 고른 것만
 *
 * 보는 것: 844px 를 넘치는지, 링크가 실제 파일을 가리키는지, 탭 영역이 44px 이상인지,
 * 주 버튼(검은 56px)이 화면당 1개인지. docs/FLOW.md 4장과 design/SCREENS.md 의 규칙이다.
 */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const DIR = path.resolve(process.cwd(), "design/screens");
const W = 390;
const H = 844;
const TAP_MIN = 44;

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
  const picked = process.argv.slice(2);
  const ids = readdirSync(DIR)
    .filter((f) => f.endsWith(".html") && f !== "Sitemap.html")
    .map((f) => f.slice(0, -5))
    .filter((id) => picked.length === 0 || picked.includes(id));

  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const problems: string[] = [];

  for (const id of ids) {
    const page = await ctx.newPage();
    await page.goto(`file://${path.join(DIR, id)}.html`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.evaluate(() => document.fonts.ready);

    const found = await page.evaluate((tapMin) => {
      const frame = document.body.firstElementChild as HTMLElement;
      const links = [...document.querySelectorAll("a")].filter((a) => !a.href.includes("fonts.g"));
      return {
        overflow: frame.scrollHeight > frame.clientHeight || document.documentElement.scrollHeight > 844,
        small: links
          .map((a) => ({ text: (a.textContent || "").trim().slice(0, 14), h: Math.round(a.getBoundingClientRect().height) }))
          .filter((x) => x.h < tapMin),
        hrefs: links.map((a) => a.getAttribute("href") || ""),
        primary: links.filter((a) => /background: #2A2D33/.test(a.getAttribute("style") || "")).length,
      };
    }, TAP_MIN);

    if (found.overflow) problems.push(`${id}: 844px 를 넘친다`);
    for (const s of found.small) problems.push(`${id}: 탭 영역 ${s.h}px — "${s.text}" (${TAP_MIN}px 이상이어야 한다)`);
    for (const href of found.hrefs) {
      if (!existsSync(path.join(DIR, href))) problems.push(`${id}: 없는 화면으로 간다 — ${href}`);
    }
    if (found.primary > 1) problems.push(`${id}: 주 버튼이 ${found.primary}개 (화면당 1개)`);
    await page.close();
  }

  await browser.close();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`화면 ${ids.length}장, 규칙 어긋난 곳 없음`);
}

main();
