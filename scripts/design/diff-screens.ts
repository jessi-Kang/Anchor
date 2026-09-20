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
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

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
  F01: "/today",
  F15: "/today/done",
  F16: "/settings",
  F16a: "/settings/delete",
};

const SKIP: Record<string, string> = {
  F01a: "같은 라우트의 다른 상태 — URL 로 따로 부를 수 없다",
  F02a: "같은 라우트의 다른 상태",
  F03a: "같은 라우트의 다른 상태",
  O02b: "같은 라우트의 다른 상태(언어 추가 모드)",
  O03a: "같은 라우트의 다른 상태(읽는 중)",
  F14a: "같은 라우트의 다른 상태(원어민 소리 없음)",
  X01: "라우트가 아니라 not-found 화면",
  X02: "라우트가 아니라 error 화면",
  E01: "영어 축 — 아직 구현 없음", E02: "영어 축 — 아직 구현 없음",
  E03: "영어 축 — 아직 구현 없음", E04: "영어 축 — 아직 구현 없음",
  E05: "영어 축 — 아직 구현 없음", E06: "영어 축 — 아직 구현 없음",
  S01: "스페인어 축 — 아직 구현 없음", S02: "스페인어 축 — 아직 구현 없음",
  S03: "스페인어 축 — 아직 구현 없음", S04: "스페인어 축 — 아직 구현 없음",
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

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  const rows: Array<{ id: string; pct: number }> = [];
  const unreachable: Array<{ id: string; why: string }> = [];

  for (const [id, route] of Object.entries(ROUTES)) {
    const refPath = path.resolve(process.cwd(), `design/screens/${id}.html`);
    if (!existsSync(refPath)) {
      unreachable.push({ id, why: "참고 화면이 없다" });
      continue;
    }

    const ref = await ctx.newPage();
    await ref.goto(`file://${refPath}`);
    await ref.waitForLoadState("networkidle").catch(() => undefined);
    await ref.evaluate(() => document.fonts.ready);
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
    writeFileSync(path.join(outDir, `${id}-diff.png`), PNG.sync.write(diff));
    rows.push({ id, pct: (n / (W * H)) * 100 });
  }

  await browser.close();

  rows.sort((x, y) => y.pct - x.pct);
  console.log(`\n참고 화면과 구현의 차이 — 큰 순서 (${rows.length}장, ${base})\n`);
  for (const r of rows) console.log(`  ${r.pct.toFixed(2).padStart(6)}%  ${r.id.padEnd(8)} .design-check/${r.id}-diff.png`);

  if (unreachable.length) {
    console.log(`\n맞대어 보지 못한 것 (${unreachable.length}장)\n`);
    for (const u of unreachable) console.log(`  ${u.id.padEnd(8)} ${u.why}`);
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
