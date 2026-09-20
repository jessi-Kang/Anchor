/**
 * 참고 화면(design/screens/*.html)이 화면 규칙을 지키는지 390×844 로 열어서 검사한다.
 *   pnpm design:lint            — 전부
 *   pnpm design:lint F03 O03    — 고른 것만
 *
 * 보는 것: 844px 를 넘치는지, 링크가 실제 파일을 가리키는지, 탭 영역이 가로·세로 모두
 * 44px 이상인지, 주 버튼(검은 56px)이 화면당 1개인지. docs/FLOW.md 4장과 CLAUDE.md 의 규칙이다.
 *
 * 탭 영역은 <a>·<button>·[role=button] 과 `data-tap` 을 단 것을 전부 잰다. 참고 HTML 은
 * 정적이라 누르는 것이 <span> 으로 그려지는 자리가 있는데(F03 의 알아/몰라 칩), 그런 자리에
 * `data-tap` 을 단다. 처음엔 <a> 의 높이만 재다가 폭 26px 짜리 라벨과 32px 짜리 칩을 통째로
 *놓쳤다. 검사가 못 잡는 규칙은 없는 규칙이다.
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

/**
 * 화면에 쓰면 안 되는 내부 용어. 우리끼리 쓰는 말이지 사용자가 배운 적 없는 말이다
 * (`CLAUDE.md` 하지 않는 것 · `design/SCREENS.md`). 픽셀 비교로는 못 잡는 종류라 여기 둔다 —
 * `design:diff` 는 라우트로 부를 수 있는 화면만 보는데 S01~S04 는 일본어 카드와 라우트를
 * 나눠 써서 닿지 않고, 닿는 화면도 낱말 하나 차이는 순위 아래쪽에 묻힌다.
 */
const INTERNAL = ["재만남", "씨앗", "노드", "앵커", "그래프에 심는"];

/**
 * "덩어리"도 내부 용어다 — 화면에서는 "이 말"이라고 쓴다(`design/SCREENS.md`).
 * 다만 아래 다섯 장이 아직 옛말을 쓰고 있고 **바꿀 문구를 UX 가 들고 있다.**
 * 고칠 수 없는 것으로 검사를 빨갛게 만들면 QA 가 매 라운드 같은 줄을 넘기게 되고,
 * 그때부터 이 검사 전체가 넘기는 것이 된다. 그래서 여기 있는 동안은 세어서 알려만 준다.
 * **문구가 오면 이 목록을 지운다** — 목록이 비면 "덩어리"도 그냥 INTERNAL 이 된다.
 */
const CHUNK_PENDING = ["F15", "S01", "S02", "S03", "S04"];

async function main() {
  const picked = process.argv.slice(2);
  const ids = readdirSync(DIR)
    .filter((f) => f.endsWith(".html") && f !== "Sitemap.html")
    .map((f) => f.slice(0, -5))
    .filter((id) => picked.length === 0 || picked.includes(id));

  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const problems: string[] = [];
  const pending: string[] = [];

  for (const id of ids) {
    const page = await ctx.newPage();
    await page.goto(`file://${path.join(DIR, id)}.html`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.evaluate(() => document.fonts.ready);

    const found = await page.evaluate((tapMin) => {
      // 화면 틀은 390×844 인 div 다. `body.firstElementChild` 를 쓰다가 <link> 를 집고 있었다 —
      // 넘침은 documentElement 쪽 조건이 대신 잡아 줘서 표가 안 났고, 본문 글자를 읽으려니 그제야 빈 값이 나왔다.
      const frame = (document.querySelector('div[style*="height: 844px"]') ?? document.body) as HTMLElement;
      const links = [...document.querySelectorAll("a")].filter((a) => !a.href.includes("fonts.g"));
      const tappable = [...document.querySelectorAll("a, button, [role=button], [data-tap]")].filter(
        (el) => !(el instanceof HTMLAnchorElement) || !el.href.includes("fonts.g"),
      );
      return {
        overflow: frame.scrollHeight > frame.clientHeight || document.documentElement.scrollHeight > 844,
        small: tappable
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { text: (el.textContent || "").trim().slice(0, 14), h: Math.round(r.height), w: Math.round(r.width) };
          })
          .filter((x) => x.h < tapMin || x.w < tapMin),
        text: (frame.innerText || "").replace(/\s+/g, " "),
        hrefs: links.map((a) => a.getAttribute("href") || ""),
        primary: links.filter((a) => /background: #2A2D33/.test(a.getAttribute("style") || "")).length,
      };
    }, TAP_MIN);

    if (found.overflow) problems.push(`${id}: 844px 를 넘친다`);
    for (const s of found.small) problems.push(`${id}: 탭 영역 ${s.w}×${s.h} — "${s.text}" (가로·세로 ${TAP_MIN}px 이상이어야 한다)`);
    for (const href of found.hrefs) {
      if (!existsSync(path.join(DIR, href))) problems.push(`${id}: 없는 화면으로 간다 — ${href}`);
    }
    if (found.primary > 1) problems.push(`${id}: 주 버튼이 ${found.primary}개 (화면당 1개)`);
    for (const w of INTERNAL) {
      if (found.text.includes(w)) problems.push(`${id}: 화면에 내부 용어 "${w}" 가 있다`);
    }
    if (found.text.includes("덩어리")) (CHUNK_PENDING.includes(id) ? pending : problems).push(`${id}: 화면에 내부 용어 "덩어리" 가 있다`);
    await page.close();
  }

  await browser.close();
  if (pending.length) {
    console.log(`아직 못 고친 것 (${pending.length}장) — 바꿀 문구를 기다리는 중이라 세기만 한다\n${pending.join("\n")}\n`);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`화면 ${ids.length}장, 규칙 어긋난 곳 없음`);
}

main();
