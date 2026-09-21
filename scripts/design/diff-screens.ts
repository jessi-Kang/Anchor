/**
 * 참고 화면과 구현을 **한 번에 전부** 맞대어 보고 차이가 큰 순서로 세운다.
 *   pnpm design:diff                      — http://localhost:3000
 *   pnpm design:diff http://localhost:4000
 *
 * 왜 있나: 참고 HTML 과 코드에 같은 것이 두 벌 있는데 한쪽만 고쳐지는 일이 반복됐다
 * (자료 이름 · 홈의 못 한 말 행 · 그래프의 괄호 앵커 — 셋 다 코드가 맞고 참고가 옛 상태였다).
 * 셋 다 누가 딴 일을 하다 우연히 걸렸다. 참고는 사람이 보는 그림이고 코드는 도는 것이라
 * 둘을 하나로 모을 수 없으니, **어긋남을 없애는 대신 어긋남이 보이게** 만든다.
 *
 * **이 도구는 판정하지 않는다.** 참고는 목업이라 자료 내용·날짜·개수가 구현과 다른 게 정상이고,
 * 차이가 크다고 틀린 것이 아니다. 통과/실패를 찍지 않고 **볼 차례만** 정해 준다. 어느 쪽이 맞는지도
 * 사람이 열어 보고 가른다 — 지금까지 코드가 맞았다고 그게 규칙이 되면 안 된다.
 * 읽는 법은 `design/SCREENS.md` 에 있다.
 */
import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

/**
 * 지정한 글꼴로 그려졌는지 재는 조각. **화살표 함수가 아니라 문자열이다** — `tsx` 가 이름을 살려
 * 두려고 `__name` 을 끼워 넣는데 브라우저에는 그 함수가 없어서 `evaluate` 가 죽는다.
 */
const FONT_PROBE = [
  "(function(){",
  " function w(fam, t){ var s=document.createElement('span'); s.textContent=t;",
  "  s.style.cssText='position:absolute;visibility:hidden;white-space:nowrap;font-size:16px;font-family:'+fam;",
  "  document.body.appendChild(s); var x=s.getBoundingClientRect().width; s.remove(); return Math.round(x*10)/10; }",
  " var KR='협력의 협 다 만난 글자야', JP='NTT 協力 20 きょう';",
  " var NONE='\"Definitely Not A Font 9x\", sans-serif';",
  " // **글꼴은 쓰이는 순간에야 받아진다.** 일본어가 한 글자도 없는 화면(O01)에서는 JP 를 아무도",
  " // 안 써서 받아지지 않고, 재려고 만든 span 이 그제야 요청을 걸어 **덜 받은 채로 재진다.**",
  " // 그래서 재기 전에 두 벌을 대놓고 부른다. `fonts.check` 와 달리 `load` 는 판정이 아니라",
  " // 요청이라, 이 환경에서 `check` 가 거짓 양성을 내던 것과는 다른 일을 한다.",
  " return Promise.all([document.fonts.load('16px \"Noto Sans KR\"', KR),",
  "                     document.fonts.load('16px \"Noto Sans JP\"', JP)])",
  "  .catch(function(){ return null; })",
  "  .then(function(){ return document.fonts.ready; })",
  "  .then(function(){ return { faces: document.fonts.size,",
  "    kr:{ noto:w('\"Noto Sans KR\", sans-serif',KR), sans:w('sans-serif',KR), ctrl:w(NONE,KR) },",
  "    jp:{ noto:w('\"Noto Sans JP\", sans-serif',JP), sans:w('sans-serif',JP), ctrl:w(NONE,JP) } }; });",
  "})()",
].join("\n");

const W = 390;
const H = 844;
const outDir = path.resolve(process.cwd(), ".design-check");

/**
 * 참고 화면 → 구현 라우트. `[id]` 자리는 디자인 미리보기가 아무 값이나 받으므로 `x` 를 쓴다.
 * 여기 없는 화면은 아래 SKIP 에 이유를 적는다 — 빠진 것과 못 부르는 것이 구분돼야 한다.
 */
const ROUTES: Record<string, string> = {
  O01: "/",
  O02a: "/onboarding/languages",
  F02: "/inputs/new",
  F03: "/inputs/x",
  O03: "/onboarding/kana",
  O03b: "/onboarding/kana/module",
  F04: "/cards/x",
  // 카드를 못 만든 자리. **주소로 부를 수 있어서** 여기 있다 — 카드 행을 안 만들기로 하면서
  // `/cards/[id]` 가 될 수 없어 자료 밑에 제 라우트가 생겼고, 주소가 있는 상태는 맞대어 볼 수 있다.
  F04a: "/inputs/x/no-card",
  Scene1: "/cards/x/1",
  Scene2: "/cards/x/2",
  Scene3: "/cards/x/3",
  Scene4: "/cards/x/4",
  Scene5: "/cards/x/5",
  F10: "/cards/x/speak",
  F11: "/graph",
  F12: "/inputs/x/read",
  F13: "/talk",
  F17: "/talk/x/guess",
  F14: "/talk/x",
  F18: "/talk/past",
  F01: "/today",
  F19: "/inputs",
  F15: "/today/done",
  F16: "/settings",
  F16a: "/settings/delete",
};

const SKIP: Record<string, string> = {
  F01a: "같은 라우트의 다른 상태 — URL 로 따로 부를 수 없다",
  F02a: "같은 라우트의 다른 상태",
  F03a: "같은 라우트의 다른 상태",
  // 자료의 한자를 전부 "알아" 로 내린 뒤의 F03. **데이터가 정하는 상태**라 주소로 못 부른다.
  // 화면 쪽은 이미 서 있다 — h1 "다 아는 한자야", 머리줄 "여기서 새로 배울 건 없어…", 주 버튼 "홈으로"
  // (`inputs/[id]/judge-rows.tsx`). F12b 와 같은 갈래다.
  F03c: "같은 라우트의 다른 상태(다 아는 자료의 F03) — 데이터가 정하는 상태라 URL 로 못 부른다",
  O02b: "같은 라우트의 다른 상태(언어 추가 모드)",
  O03a: "같은 라우트의 다른 상태(읽는 중)",
  F14a: "같은 라우트의 다른 상태(겨눌 소리 없음)",
  // 부를 낱말이 없는 한자의 Scene1. `/cards/[id]/1` 을 Scene1 과 나눠 쓰고, **어느 쪽이 서는지는
  // 그 카드의 데이터**(`payload.anchor`)가 정한다. 미리보기가 내는 카드가 앵커 있는 協 하나뿐이라
  // 주소로 부를 수가 없다 — 미리보기가 카드를 고를 수 있게 되는 날 ROUTES 로 옮겨 간다.
  Scene1a: "같은 라우트의 다른 상태(부를 낱말이 없는 카드의 Scene1) — 데이터가 정하는 상태라 URL 로 못 부른다",
  // 듣기를 누른 **뒤에야** 아는 상태(그 기기에 목소리가 없다)라 주소로 못 부른다.
  // 한 장이 F10 과 F14 를 같이 덮는다 — 같은 상태를 두 번호로 그리면 한쪽만 고치는 날이 온다.
  F10a: "같은 라우트의 다른 상태(겨눌 소리도 들려줄 소리도 없음) — 탭 뒤라 URL 로 못 부른다",
  F12a: "같은 라우트의 다른 상태(틴트 덩어리를 탭해 읽기를 연 F12) — 탭 뒤라 URL 로 못 부른다",
  // 자료를 다 만난 뒤의 F12. **데이터가 정하는 상태**라 주소로 못 부른다(그 자료의 한자를 전부
  // 풀어야 선다). 화면 쪽은 이미 서 있다 — 바닥 줄이 "새로 배울 건 없어. 다 만난 글자야." 로 가고,
  // 섞인 낱말이 없으니 "협은 방금 봤지" 줄은 안 난다 (`inputs/[id]/read/page.tsx`).
  F12b: "같은 라우트의 다른 상태(다 만난 자료의 F12) — 데이터가 정하는 상태라 URL 로 못 부른다",
  F17a: "같은 라우트의 다른 상태(영어 문장을 못 만들어 추측이 칸에 남은 F17)",
  F03c: "같은 라우트의 다른 상태(그 자료의 한자를 전부 알아로 고른 F03) — 데이터가 정하는 상태라 URL 로 못 부른다",
  Scene1a: "같은 라우트의 다른 상태(부를 낱말이 없는 한자의 Scene1) — 어느 카드냐가 정하는 상태라 URL 로 못 부른다",
  // F19 는 `/inputs` 로 정해져 위 ROUTES 에 있다 (SKIP 의 "아직 안 정해졌다" 줄은 그래서 뺐다).
  X01: "라우트가 아니라 not-found 화면",
  X02: "라우트가 아니라 error 화면",
  // E·S 는 **없는 화면이 아니다.** 영어 어근 카드(E01~E06)와 스페인어 소리 카드(S01~S04)는
  // 일본어 카드와 같은 라우트를 쓴다 — `/cards/[id]`, `/cards/[id]/1..5`, `/cards/[id]/speak`
  // (docs/SITEMAP.md). 언어는 라우트가 아니라 데이터 속성이라 URL 로 "영어 카드"를 부를 수 없고,
  // 디자인 미리보기가 내는 카드가 일본어 하나뿐이라 여기서는 맞대어 볼 수가 없다.
  // 미리보기가 언어를 고를 수 있게 되면 그날 SKIP 에서 빠지고 ROUTES 로 옮겨 간다.
  // (못 한 말 축 F13·F17·F14 는 이것과 다른 축이고 제 라우트가 있어서 위에서 돌고 있다.)
  E01: "영어 어근 카드 — `/cards/[id]` 를 F04 와 나눠 쓴다. 미리보기가 일본어 카드만 낸다",
  E02: "영어 어근 카드 — `/cards/[id]/1..5` 를 Scene1~5 와 나눠 쓴다",
  E03: "영어 어근 카드 — 같은 장면 라우트",
  E04: "영어 어근 카드 — 같은 장면 라우트",
  E05: "영어 어근 카드 — 같은 장면 라우트",
  E06: "영어 어근 카드 — `/cards/[id]/speak` 를 F10 과 나눠 쓴다",
  S01: "스페인어 소리 카드 — `/cards/[id]` 를 F04 와 나눠 쓴다. 미리보기가 일본어 카드만 낸다",
  S02: "스페인어 소리 카드 — `/cards/[id]/1..5` 를 Scene1~5 와 나눠 쓴다",
  S03: "스페인어 소리 카드 — 같은 장면 라우트",
  S04: "스페인어 소리 카드 — `/cards/[id]/speak` 를 F10 과 나눠 쓴다",
};

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
 * 참고·구현·차이를 **한 장**으로 남긴다(`.design-check/<ID>.png`). 세 파일을 매번 나란히 붙여
 * 놓고 봐야 했다 — 여는 값이 보는 값보다 크면 안 본다. 이름이 짧은 쪽이 먼저 여는 것이다:
 * `<ID>.png` 가 세 칸짜리, `<ID>-ref/-app/-diff.png` 는 한 칸을 크게 볼 때 쓴다.
 * 칸 이름을 그림 안에 넣는 건 브라우저로 그리기 때문이다 — 픽셀로 글자를 찍는 것보다 싸다.
 */
async function writeStrip(ctx: BrowserContext, id: string, ref: Buffer, app: Buffer, diff: Buffer) {
  const src = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
  const cell = (label: string, b: Buffer) =>
    `<figure style="margin:0"><figcaption style="font:500 13px 'Noto Sans KR',sans-serif;color:#6B7078;padding-bottom:8px">${label}</figcaption>` +
    `<img src="${src(b)}" width="${W}" height="${H}" style="display:block;border:1px solid #E6E7EA;border-radius:4px"></figure>`;
  const page = await ctx.newPage();
  await page.setContent(
    `<body style="margin:0;background:#F6F6F7"><div id="s" style="display:inline-flex;gap:16px;padding:20px">` +
      cell(`참고 ${id}`, ref) +
      cell("구현", app) +
      cell("다른 픽셀", diff) +
      `</div></body>`,
  );
  const strip = await page.locator("#s").screenshot();
  writeFileSync(path.join(outDir, `${id}.png`), strip);
  await page.close();
}

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  const rows: Array<{ id: string; pct: number }> = [];
  const unreachable: Array<{ id: string; why: string }> = [];

  /**
   * 두 목록 어디에도 없는 참고 화면을 먼저 센다. 없으면 **조용히 빠진다** — 그게 제일 나쁘다.
   * SKIP 에 이유를 적게 한 것도 빠뜨린 것과 못 부르는 것을 가르려는 건데, 애초에 두 목록에
   * 이름이 없으면 가를 것도 없다. 화면을 새로 그린 날 이 줄이 뜬다.
   * Sitemap.html 은 화면이 아니라 라우트 그림이라 뺀다(`design:lint` 도 같은 이유로 뺀다).
   */
  const listed = new Set([...Object.keys(ROUTES), ...Object.keys(SKIP)]);
  // `archive/` 는 여기서도 명시적으로 뺀다 — 버린 화면을 "목록에 없다" 고 세면 매번 두 줄이
  // 뜨고, 매번 뜨는 줄은 곧 안 읽는 줄이 된다 (lint 쪽에 같은 주석).
  const missing = readdirSync(path.resolve(process.cwd(), "design/screens"), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html") && e.name !== "Sitemap.html")
    .map((e) => e.name)
    .map((f) => f.replace(/\.html$/, ""))
    .filter((id) => !listed.has(id));

  for (const [id, route] of Object.entries(ROUTES)) {
    const refPath = path.resolve(process.cwd(), `design/screens/${id}.html`);
    if (!existsSync(refPath)) {
      unreachable.push({ id, why: "참고 화면이 없다" });
      continue;
    }

    const ref = await ctx.newPage();
    /*
      **요청한 글꼴로 그려졌는지를 재서, 아니면 멈춘다.**

      처음엔 `document.fonts.ready` 만 기다렸다. 스타일시트를 **못 받아도** 그 약속은 지켜진다 —
      기다릴 것이 없으니 즉시 resolve 한다. 그래서 참고는 시스템 기본 sans, 구현은 Noto 로 그려졌고
      **글자가 있는 화면이 전부 달라졌다.** 그 값으로 "볼 차례" 를 정하면 순서 자체가 거짓이다.

      다음엔 `document.fonts.size === 0` 으로 막았다. **그것도 샜다.** 자체 호스팅으로 옮긴 뒤
      `@font-face` 를 써 놓으면 **파일을 못 받아도 face 는 등록된다** — 경로를 일부러 깨뜨려 보니
      `size` 가 그대로 2 였다. 가드가 조용히 통과했다.

      그래서 묻는 것을 바꿨다. **"글꼴이 실렸나" 가 아니라 "내가 지정한 그 글꼴로 그려졌나" 다.**
      같은 글자를 `Noto` 지정과 `sans-serif` 지정으로 재서 **폭이 같으면 안 그려진 것**이다.

      그리고 **대조군을 넣는다.** 없는 글꼴 이름으로도 한 번 재서, 그것이 `sans-serif` 와 **다르게**
      나오면 재는 방법 자체가 망가진 것이므로 그때도 던진다 — 이 환경의 `document.fonts.check` 가
      실제로 그랬다. **없는 글꼴을 "있다" 고 답했다.** 대조군이 없으면 그런 거짓 양성은 영영 안 보인다.
      (`requestfailed` 와 `size` 는 값이 싸니 같이 보되 **그것만으로 통과시키지 않는다.**)
    */
    const fontFail: string[] = [];
    ref.on("requestfailed", (r) => {
      if (/\.(woff2?|ttf|otf)(\?|$)/i.test(r.url()) || /fonts\./i.test(r.url())) {
        fontFail.push(`${r.failure()?.errorText ?? "실패"} ${r.url().slice(-40)}`);
      }
    });
    await ref.goto(`file://${refPath}`);
    await ref.waitForLoadState("networkidle").catch(() => undefined);
    await ref.evaluate(() => document.fonts.ready);
    const probe = (await ref.evaluate(FONT_PROBE)) as {
      faces: number;
      kr: { noto: number; sans: number; ctrl: number };
      jp: { noto: number; sans: number; ctrl: number };
    };
    const broken = [
      probe.kr.ctrl !== probe.kr.sans ? `대조군이 이상하다 — 없는 글꼴 폭 ${probe.kr.ctrl} ≠ sans ${probe.kr.sans}` : "",
      probe.kr.noto === probe.kr.sans ? `'Noto Sans KR' 로 안 그려졌다 (폭이 sans-serif 와 같다: ${probe.kr.noto})` : "",
      probe.jp.noto === probe.jp.sans ? `'Noto Sans JP' 로 안 그려졌다 (폭이 sans-serif 와 같다: ${probe.jp.noto})` : "",
    ].filter(Boolean);
    if (broken.length) {
      await ref.close();
      throw new Error(
        `${id}: 참고 화면이 지정한 글꼴로 안 그려졌다.\n  ` +
          broken.join("\n  ") +
          `\n  (등록된 face ${probe.faces}개` +
          (fontFail.length ? `, 실패한 요청: ${fontFail[0]}` : ", 실패한 요청 없음") +
          `)\n` +
          `이대로 찍으면 참고와 구현이 다른 글꼴이라 글자가 있는 화면이 전부 달라진다.\n` +
          `차이값이 거짓이 되므로 멈춘다 — design/fonts/ 의 파일과 화면의 @font-face 경로를 봐라.`,
      );
    }
    const refPng = await ref.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
    await ref.close();

    const app = await ctx.newPage();
    const url = `${base}${route}${route.includes("?") ? "&" : "?"}fixed=1`;
    const res = await app.goto(url, { waitUntil: "networkidle" }).catch(() => null);
    const landed = app.url();
    if (!res || !res.ok() || !landed.includes(route.split("?")[0])) {
      // 로그인으로 튕기거나 라우트가 없는 경우. 차이 0% 로 세면 "같다" 로 읽혀 더 나쁘다.
      unreachable.push({ id, why: `열리지 않음 (${res ? res.status() : "이동 실패"} → ${landed.replace(base, "") || "?"})` });
      await app.close();
      continue;
    }
    await app.evaluate(() => document.fonts.ready);
    const appPng = await app.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
    await app.close();

    writeFileSync(path.join(outDir, `${id}-ref.png`), refPng);
    writeFileSync(path.join(outDir, `${id}-app.png`), appPng);
    const a = PNG.sync.read(refPng);
    const b = PNG.sync.read(appPng);
    const diff = new PNG({ width: W, height: H });
    const n = pixelmatch(a.data, b.data, diff.data, W, H, { threshold: 0.1 });
    const diffPng = PNG.sync.write(diff);
    writeFileSync(path.join(outDir, `${id}-diff.png`), diffPng);
    await writeStrip(ctx, id, refPng, appPng, diffPng);
    rows.push({ id, pct: (n / (W * H)) * 100 });
  }

  await browser.close();

  rows.sort((x, y) => y.pct - x.pct);
  console.log(`\n참고 화면과 구현의 차이 — 큰 순서 (${rows.length}장, ${base})\n`);
  for (const r of rows) console.log(`  ${r.pct.toFixed(2).padStart(6)}%  ${r.id.padEnd(8)} .design-check/${r.id}.png`);

  if (unreachable.length) {
    console.log(`\n맞대어 보지 못한 것 (${unreachable.length}장)\n`);
    for (const u of unreachable) console.log(`  ${u.id.padEnd(8)} ${u.why}`);
  }
  if (missing.length) {
    console.log(`\n어느 목록에도 없는 화면 (${missing.length}장) — ROUTES 나 SKIP 에 한 줄 더해라\n`);
    for (const id of missing) console.log(`  ${id}`);
  }
  const skipped = Object.entries(SKIP);
  console.log(`\n대상이 아닌 것 (${skipped.length}장)\n`);
  for (const [id, why] of skipped) console.log(`  ${id.padEnd(8)} ${why}`);

  console.log(`\n이 목록은 볼 차례일 뿐 판정이 아니다. 읽는 법은 design/SCREENS.md.\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
