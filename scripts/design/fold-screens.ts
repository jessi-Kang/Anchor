/**
 * **Jessi 가 보는 창에서 화면마다 둘을 본다.**
 *   pnpm design:fold                      — http://localhost:3000
 *   pnpm design:fold http://localhost:4000
 *
 *   (가) 주 버튼이 스크롤 없이 보이는가
 *   (나) 나가는 길이 눌러 보이는가 — 옆에 선 글자와 **눈으로** 갈리는가
 *
 * `docs/SPEC.md` 9장 MVP 범위의 첫 방문 칸을 켜는 조건이 이 둘이고, 이 스크립트가 그 조건이다.
 * 문장으로만 적어 두면 다음 사람이 폰으로 한 번 열어 보고 「봤다」고 켠다.
 *
 * **왜 `design:check`·`design:diff` 로는 안 걸렸나.** 그 둘은 **참고 HTML 과 앱을 맞대어 본다.**
 * 둘이 **같은 모양으로 틀리면 0% 가 나온다.** 2026-09-21 에 그렇게 됐다 — 상단 "지금 어디" 링크가
 * 참고에서도 앱에서도 옆의 시각과 색·크기·굵기·밑줄이 같았고, 비교는 통과였고, Jessi 는 프로덕션에서
 * 갇혔다("여기서 빠져나갈 길이 없어"). 그리고 `design:diff` 는 F03 내용이 2,400px 을 넘는 것을
 * 이미 보고도 0.02% 라고 적었다 — **재던 축이 「참고와 같은가」 하나뿐이라서** 넘친다는 사실이
 * 퍼센트 안으로 사라졌다.
 *
 * **그래서 이 도구는 참고를 안 본다.** 앱만 열어서 **사람 쪽 두 가지**를 잰다. 기준이 바깥에
 * 있으니 참고와 앱이 같이 틀려도 걸린다.
 *
 * **자는 `scripts/design/frame.ts` 의 `VIEW_W × VIEW_H` 다** — 참고 틀(390×844)이 아니라
 * Jessi 의 폰에서 실제로 보이는 창(360×650). 그 수가 어떻게 나왔는지는 그 파일에 적혀 있다.
 */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { VIEW_W, VIEW_H, ROUTES } from "./frame";

function findChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium")).sort().reverse())
    for (const c of ["chrome-linux/chrome", "chrome-linux64/chrome"]) {
      const p = path.join(root, dir, c);
      if (existsSync(p)) return p;
    }
  return undefined;
}

/**
 * 재는 조각. **화살표 함수가 아니라 문자열이다** — `tsx` 가 이름을 살리려고 `__name` 을 끼워 넣는데
 * 브라우저에는 그 함수가 없어 `evaluate` 가 죽는다 (`diff-screens.ts` 의 글꼴 자와 같은 이유).
 *
 * 주 버튼을 찾는 규칙은 **높이 56 + 반경 14** 다. 디자인 시스템이 주 버튼을 그 한 벌로 못 박아
 * 둬서(CLAUDE.md: 56px, 반경 14px, 화면당 하나) 화면마다 안 흔들린다. 클래스 이름으로 찾으면
 * CSS 모듈이 해시로 바꿔서 빌드마다 갈린다.
 *
 * **색으로 찾지 않는다.** 처음엔 검정 배경(`#2A2D33`)으로 찾았는데, 그러면 **아직 안 켜진 주 버튼**을
 * 통째로 놓친다 — F02·F13·F17 은 입력 전에 버튼이 회색(`.button:disabled`)이라 "주 버튼 없음" 이
 * 나왔다. 그 화면들이야말로 첫 방문이 지나는 자리다. 꺼져 있어도 **자리는 차지하고 접히는 것도
 * 똑같다.** 자가 상태를 타면 상태마다 다른 답을 준다.
 */
const PROBE = `(function () {
  var se = document.scrollingElement;
  var btns = Array.prototype.slice.call(document.querySelectorAll("button, a")).filter(function (e) {
    var cs = getComputedStyle(e);
    return Math.abs(parseFloat(cs.height) - 56) < 2 && parseFloat(cs.borderTopLeftRadius) === 14;
  });
  var btn = btns[btns.length - 1];
  var bar = document.querySelector("main > div");
  var link = bar ? bar.querySelector("a") : null;
  var spans = bar ? bar.querySelectorAll("span") : [];
  var near = spans.length ? spans[spans.length - 1] : null;
  function look(e) {
    if (!e) return null;
    var c = getComputedStyle(e), r = e.getBoundingClientRect();
    return { color: c.color, size: c.fontSize, weight: c.fontWeight, line: c.textDecorationLine,
             bg: c.backgroundColor, text: e.innerText, w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  }
  var br = btn ? btn.getBoundingClientRect() : null;
  return {
    doc: se.scrollHeight,
    button: btn ? { text: btn.innerText, bottom: +(br.y + br.height + se.scrollTop).toFixed(1) } : null,
    link: look(link), near: look(near),
    /** 나가는 길이 아예 없는 화면인가 — 로그인·첫 언어 고르기는 위가 없어서 정상이다 */
    hasUp: !!link
  };
})()`;

/**
 * 위가 없는 것이 **정상인** 화면. `components/ui` 의 `Screen` 이 `up` 없이 불리는 자리이고,
 * 셋 다 이유가 다르다: O01·O02a 는 아직 로그인·첫 언어라 위가 생기지 않았고, **F01 은 홈이라
 * 위가 없는 것이 맨 위라는 뜻**이다(홈의 이탈은 설정 한 곳, `docs/FLOW.md` 4장).
 *
 * **이 목록은 짧게 유지한다.** 여기 이름을 넣는 것은 "이 화면은 나가는 길을 안 본다" 는 뜻이라,
 * 안 보이는 길을 고치는 대신 목록에 넣으면 오늘 고친 것이 내일 되돌아온다.
 */
const NO_UP = new Set(["O01", "O02a", "F01"]);

type Row = { id: string; route: string; fold: string; exit: string; ok: boolean };

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const rows: Row[] = [];

  for (const [id, route] of Object.entries(ROUTES)) {
    let r: Awaited<ReturnType<typeof page.evaluate>>;
    try {
      await page.goto(base + route, { waitUntil: "networkidle", timeout: 20000 });
      await page.evaluate("document.fonts.ready");
      r = await page.evaluate(PROBE);
    } catch {
      rows.push({ id, route, fold: "못 열었다", exit: "—", ok: false });
      continue;
    }
    const m = r as {
      doc: number;
      button: { text: string; bottom: number } | null;
      link: Record<string, string | number> | null;
      near: Record<string, string | number> | null;
      hasUp: boolean;
    };

    // (가) 주 버튼
    let fold: string;
    let okA: boolean;
    if (!m.button) {
      fold = "주 버튼 없음";
      okA = false;
    } else {
      const over = +(m.button.bottom - VIEW_H).toFixed(1);
      okA = over <= 0;
      fold = okA ? `보임 (여유 ${-over})` : `▼ ${over}px 밖`;
    }

    // (나) 나가는 길. **없는 것과 안 보이는 것을 가른다.**
    // 옆에 선 글자와 색·크기·굵기·밑줄 **넷 다 같으면** 그건 링크가 아니라 그냥 글자로 읽힌다.
    // 탭 영역(44px)은 여기서 안 센다 — 손가락은 지켜도 눈이 못 찾는 자리가 오늘의 결함이었다.
    let exit: string;
    let okB: boolean;
    if (!m.hasUp) {
      okB = NO_UP.has(id);
      exit = okB ? "위가 없는 화면" : "나가는 길 없음";
    } else if (!m.near) {
      okB = true;
      exit = "옆에 선 글자 없음";
    } else {
      const same = (["color", "size", "weight", "line"] as const).filter((k) => m.link![k] === m.near![k]);
      okB = same.length < 4;
      exit = okB ? `갈림 (같은 항목 ${same.length}/4)` : `옆 글자와 똑같음 (${m.link!.color})`;
    }

    rows.push({ id, route, fold, exit, ok: okA && okB });
  }
  await browser.close();

  const bad = rows.filter((r) => !r.ok);
  console.log(`Jessi 가 보는 창 ${VIEW_W}×${VIEW_H} — 화면 ${rows.length}장\n`);
  console.log("      화면  라우트                  (가) 주 버튼            (나) 나가는 길");
  for (const r of rows)
    console.log(
      `${r.ok ? "  통과" : "  실패"}  ${r.id.padEnd(6)}${r.route.padEnd(24)}${r.fold.padEnd(22)}${r.exit}`,
    );
  console.log(`\n${rows.length - bad.length} 통과 / ${bad.length} 실패`);
  if (bad.length) {
    console.log(`\n실패: ${bad.map((r) => r.id).join(" · ")}`);
    console.log("→ docs/SPEC.md 9장 첫 방문 칸은 이 목록이 빌 때까지 안 켜진다.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
