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
import { FRAME_W, FRAME_H, FRAME_STYLE, ROUTES, SKIP } from "./frame";

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

const W = FRAME_W;
const outDir = path.resolve(process.cwd(), ".design-check");

/**
 * 참고 화면 → 구현 라우트. `[id]` 자리는 디자인 미리보기가 아무 값이나 받으므로 `x` 를 쓴다.
 * 여기 없는 화면은 아래 SKIP 에 이유를 적는다 — 빠진 것과 못 부르는 것이 구분돼야 한다.
 */
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
 *
 * 높이는 **그 화면의 틀**이다. 844 를 박아 두면 긴 화면의 석 장이 눌려서, 잘리지도 않은 그림이
 * 세로로 찌그러진 채 나란히 선다 — 그걸 보고 "왜 다르지" 를 세는 사람이 다음 사람이다.
 */
async function writeStrip(ctx: BrowserContext, id: string, h: number, ref: Buffer, app: Buffer, diff: Buffer) {
  const src = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
  const cell = (label: string, b: Buffer) =>
    `<figure style="margin:0"><figcaption style="font:500 13px 'Noto Sans KR',sans-serif;color:#6B7078;padding-bottom:8px">${label}</figcaption>` +
    `<img src="${src(b)}" width="${W}" height="${h}" style="display:block;border:1px solid #E6E7EA;border-radius:4px"></figure>`;
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
  const ctx = await browser.newContext({ viewport: { width: W, height: FRAME_H }, deviceScaleFactor: 1 });

  const rows: Array<{ id: string; pct: number; h: number }> = [];
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
    /*
      **자는 참고가 선언한 틀이다.** 844 를 박아 두고 거기서 잘랐더니 F16 이 5.48% 로 맨 위에
      섰는데, 그 화면은 참고가 1014 를 선언하고 주 버튼을 **바닥**에 붙인다 — 844 에서 자르면
      참고 버튼은 잘려 나가고 앱 버튼은 남는다. 내용으로는 절대 못 줄이는 차이라, 그 순위는
      화면이 아니라 자를 가리키고 있었다. `design:lint` 는 이미 선언을 읽고 있었으니
      (`frame.ts`) **두 도구가 서로 다른 화면을 보고 있던 것**이다.

      **자르는 게 아니라 둘 다 그 높이로 그린다.** 자만 바꾸면 앱은 여전히 844 짜리 화면으로
      그려진다 — 앱의 비교 모드 CSS(`.screenFixed`)도 844 를 박고 있었다. 844 를 박은 자리가
      셋이었던 것이다. 그래서 창을 틀 높이로 열고, 그 높이를 `--frame-h` 로 넣어 준다.
      그래야 `Grow` 가 미는 주 버튼이 참고와 같은 바닥에 선다.
    */
    const frameH = await ref.evaluate((style) => {
      const re = new RegExp(style);
      const frame = [...document.querySelectorAll("div")].find((d) => re.test(d.getAttribute("style") || ""));
      return frame ? frame.clientHeight : 0;
    }, FRAME_STYLE);
    if (!frameH) {
      // **기본값으로 안 돌아간다.** 844 로 떨어뜨리면 못 찾은 것이 "괜찮다" 로 읽힌다 —
      // lint 가 틀을 높이로 찾다가 body 로 떨어져 조용히 통과하던 것과 같은 실수다.
      unreachable.push({ id, why: `참고에서 틀(폭 ${W}px)을 못 찾았다` });
      await ref.close();
      continue;
    }
    if (frameH !== FRAME_H) await ref.setViewportSize({ width: W, height: frameH });
    const refPng = await ref.screenshot({ clip: { x: 0, y: 0, width: W, height: frameH } });
    await ref.close();

    const app = await ctx.newPage();
    if (frameH !== FRAME_H) await app.setViewportSize({ width: W, height: frameH });
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
    // 앱의 비교 모드(`.screenFixed`)에 틀 높이를 넘긴다. 글꼴까지 기다린 **뒤**에 넣는다 —
    // 값만 바뀌는 것이라 여기서 넣어도 찍히는 그림은 같고, 넣을 자리가 하나뿐이라 안 갈린다.
    await app.evaluate((h) => document.documentElement.style.setProperty("--frame-h", `${h}px`), frameH);
    const appPng = await app.screenshot({ clip: { x: 0, y: 0, width: W, height: frameH } });
    await app.close();

    writeFileSync(path.join(outDir, `${id}-ref.png`), refPng);
    writeFileSync(path.join(outDir, `${id}-app.png`), appPng);
    const a = PNG.sync.read(refPng);
    const b = PNG.sync.read(appPng);
    const diff = new PNG({ width: W, height: frameH });
    const n = pixelmatch(a.data, b.data, diff.data, W, frameH, { threshold: 0.1 });
    const diffPng = PNG.sync.write(diff);
    writeFileSync(path.join(outDir, `${id}-diff.png`), diffPng);
    await writeStrip(ctx, id, frameH, refPng, appPng, diffPng);
    rows.push({ id, pct: (n / (W * frameH)) * 100, h: frameH });
  }

  await browser.close();

  rows.sort((x, y) => y.pct - x.pct);
  console.log(`\n참고 화면과 구현의 차이 — 큰 순서 (${rows.length}장, ${base})\n`);
  // **다른 자로 잰 화면은 그렇다고 말한다.** 안 적으면 F16 의 퍼센트만 목록에 서고, 그것이
  // 844 짜리 옆 줄과 같은 자로 나온 값처럼 읽힌다 (lint 의 "틀이 844px 보다 큰 화면" 과 같은 결).
  for (const r of rows) {
    const ruler = r.h === FRAME_H ? "" : `  (틀 ${r.h}px)`;
    console.log(`  ${r.pct.toFixed(2).padStart(6)}%  ${r.id.padEnd(8)} .design-check/${r.id}.png${ruler}`);
  }

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
