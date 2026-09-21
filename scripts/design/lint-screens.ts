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
import { readdirSync, existsSync, readFileSync } from "node:fs";
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
 * 화면에 쓰면 안 되는 내부 용어. 우리끼리 쓰는 말이지 사용자가 배운 적 없는 말이다.
 * 픽셀 비교로는 못 잡는 종류라 여기 있다 — `design:diff` 는 라우트로 부를 수 있는 화면만 보는데
 * S01~S04 는 일본어 카드와 라우트를 나눠 써서 닿지 않고, 닿는 화면도 낱말 하나 차이는 순위 아래에 묻힌다.
 *
 * **목록을 여기 베껴 적지 않는다.** `CLAUDE.md` "하지 않는 것"의 내부 용어 줄에서 읽는다 —
 * 두 벌이 되면 한쪽만 늘어나고, 그때부터 어느 쪽이 규칙인지 알 수 없다.
 */
function internalTerms(): string[] {
  const md = readFileSync(path.resolve(process.cwd(), "CLAUDE.md"), "utf8");
  const line = md.match(/^- 내부 용어\((.+?)\)/m);
  if (!line) throw new Error("CLAUDE.md 에서 내부 용어 줄을 못 찾았다 — 줄이 바뀌었으면 여기도 같이 고친다");
  return [
    ...line[1].split("·").map((w) => w.trim()),
    // CLAUDE.md 줄에 없지만 다른 문서가 화면에서 금지한 말. 그 문서를 적어 둔다.
    // CLAUDE.md 줄로 올라가면 여기서 지운다.
    "덩어리", // design/SCREENS.md — 화면에서는 "이 말", 문서에서만 "덩어리"
    "재만남", // docs/FLOW.md 4장 — 화면 이름을 알약으로도 라벨로도 달지 않는다
  ];
}

async function main() {
  const picked = process.argv.slice(2);
  // `archive/` 는 **명시적으로** 뺀다. 지금은 `readdirSync` 가 한 층만 읽어서 우연히 안 걸리지만,
  // 버린 화면은 글꼴도 규칙도 안 따라오니 거기서 문이 울리면 **고칠 자리가 아닌 데서 우는 것**이
  // 되고, 그러면 다음엔 문을 꺼 버리게 된다 — 틀린 통과만큼이나 틀린 경보가 도구를 못 믿게 만든다.
  const ids = readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html") && e.name !== "Sitemap.html")
    .map((e) => e.name)
    .map((f) => f.slice(0, -5))
    .filter((id) => picked.length === 0 || picked.includes(id));

  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const problems: string[] = [];
  const tall: string[] = [];
  const INTERNAL = internalTerms();

  for (const id of ids) {
    const page = await ctx.newPage();
    await page.goto(`file://${path.join(DIR, id)}.html`);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.evaluate(() => document.fonts.ready);

    const found = await page.evaluate((tapMin) => {
      // 화면 틀은 390×844 인 div 다. `body.firstElementChild` 를 쓰다가 <link> 를 집고 있었다 —
      // 넘침은 documentElement 쪽 조건이 대신 잡아 줘서 표가 안 났고, 본문 글자를 읽으려니 그제야 빈 값이 나왔다.
      // **높이를 박아서 찾지 않는다.** 전에는 `height: 844px` 로 찾았는데, 설정처럼 제 높이를
      // 선언한 화면에서 이 선택자가 **빗나가 body 로 떨어졌다.** body 는 넘치는 일이 없어서
      // 검사가 조용히 통과했다 — 못 찾은 것을 "괜찮다" 로 답한 것이다.
      const frame = ([...document.querySelectorAll("div")].find((d) => /width:\s*390px/.test(d.getAttribute("style") || "")) ??
        document.body) as HTMLElement;
      const links = [...document.querySelectorAll("a")].filter((a) => !a.href.includes("fonts.g"));
      const tappable = [...document.querySelectorAll("a, button, [role=button], [data-tap]")].filter(
        (el) => !(el instanceof HTMLAnchorElement) || !el.href.includes("fonts.g"),
      );
      return {
        // **넘침은 「선언한 틀」을 기준으로 잰다.** 844 를 박아 두면 설정처럼 원래 스크롤되는
        // 화면이 영영 빨갛다. 그런 화면은 틀을 제 높이로 선언해서 **잘린 데 없이** 보여 준다 —
        // 아래가 잘린 그림은 다음 사람에게 "여기까지가 전부" 라고 거짓말을 한다.
        // 틀보다 내용이 크면 그건 여전히 넘침이다 (design/SCREENS.md).
        overflow: frame.scrollHeight > frame.clientHeight || document.documentElement.scrollHeight > frame.clientHeight,
        small: tappable
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { text: (el.textContent || "").trim().slice(0, 14), h: Math.round(r.height), w: Math.round(r.width) };
          })
          .filter((x) => x.h < tapMin || x.w < tapMin),
        frameH: frame.clientHeight,
        text: (frame.innerText || "").replace(/\s+/g, " "),
        hrefs: links.map((a) => a.getAttribute("href") || ""),
        primary: links.filter((a) => /background: #2A2D33/.test(a.getAttribute("style") || "")).length,
      };
    }, TAP_MIN);

    if (found.overflow) problems.push(`${id}: 틀(${found.frameH}px)을 넘친다`);
    if (found.frameH > H) tall.push(`${id}(${found.frameH}px)`);
    for (const s of found.small) problems.push(`${id}: 탭 영역 ${s.w}×${s.h} — "${s.text}" (가로·세로 ${TAP_MIN}px 이상이어야 한다)`);
    for (const href of found.hrefs) {
      if (!existsSync(path.join(DIR, href))) problems.push(`${id}: 없는 화면으로 간다 — ${href}`);
    }
    if (found.primary > 1) problems.push(`${id}: 주 버튼이 ${found.primary}개 (화면당 1개)`);
    for (const w of INTERNAL) {
      if (found.text.includes(w)) problems.push(`${id}: 화면에 내부 용어 "${w}" 가 있다`);
    }
    await page.close();
  }

  await browser.close();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`화면 ${ids.length}장, 규칙 어긋난 곳 없음`);
  /*
    **틀을 키우면 넘침이 사라진다.** 고의가 아니라 실수로 그렇게 된다 — `844` 고정은 못 속이는데
    제가 선언한 틀은 속일 수 있다. 그래서 **선언이 조용해지지 않게** 한 줄로 남긴다.
    실패가 아니라 **사실**이다: "이 화면은 스크롤된다" 가 눈에 보이는 값이 된다.
  */
  if (tall.length) console.log(`틀이 ${H}px 보다 큰 화면: ${tall.join(" · ")}`);
}

main();
