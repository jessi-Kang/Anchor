/**
 * **Jessi 가 보는 창에서 화면마다 셋을 본다.**
 *   pnpm design:fold                      — http://localhost:3000
 *   pnpm design:fold http://localhost:4000
 *
 *   (가) 주 버튼이 스크롤 없이 보이는가
 *   (나) 나가는 길이 눌러 보이는가 — 옆에 선 글자와 **눈으로** 갈리는가
 *   (다) 붙은 막대가 글자를 가리나 — 바닥에 고정된 것 밑으로 글자가 들어가지 않는가
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
 * **그래서 이 도구는 참고를 안 본다.** 앱만 열어서 **사람 쪽 세 가지**를 잰다. 기준이 바깥에
 * 있으니 참고와 앱이 같이 틀려도 걸린다.
 *
 * **(다) 는 (가) 를 고치면서 생긴 축이다.** 주 버튼을 창 바닥에 붙이자(2026-09-21) **접히는 것과
 * 가리는 것이 갈렸다** — 붙은 막대는 접히지 않으면서 그 아래 글자를 덮을 수 있다. (가) 는 그걸
 * 못 본다. 실제로 그날 붙는 요소에 배경을 잘못 줘서 **주 버튼이 통째로 회색**이 된 채로 (가)·(나)
 * 가 25/25 초록이었다(잡은 건 `design:diff` 였다). **자 하나가 초록인 것과 괜찮은 것은 다른 말이다.**
 *
 * **지금은 이 열이 처음부터 전부 0 이다. 그게 맞다** — 자는 결함이 있을 때 세우는 게 아니라
 * **결함이 안 생겼다는 것을 계속 말해 주려고** 세운다. 다음에 누가 붙는 요소를 하나 더 만들면
 * 그때 빨개진다.
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

/**
 * **(다) 붙은 막대가 글자를 가리나.** 끝까지 내린 상태에서 잰다 — 붙은 요소가 **쉬는 자리**에
 * 서 있을 때도 글자를 덮으면 그건 스크롤로 못 푸는 가림이다.
 *
 * **이 자의 물음은 「스크롤로 못 푸는 가림」 하나다.** 처음 닿는 상태(맨 위)에서 붙은 막대가
 * 무엇을 덮는지는 **이 자의 물음이 아니다** — 내리면 풀리기 때문이다. 그게 구멍처럼 보여도
 * 없던 자를 세우지 마라(PM 축이 F14 에서 맨 위일 때 억양 곡선 범례 석 자가 가려지는 걸 쟀는데,
 * 124px 내리면 보이고 앱 전체에서 한 자리뿐이라 「고칠 것인지부터」에서 아니오로 닫혔다).
 *
 * **한 점에서만 재는 것이 맞다 — 여기서는.** 2026-09-22 에 `design:edge` 가 「겹침이 0 인 자리만
 * 본다」로 걸렸고(밀려 서 있을 때 F14 버튼 줄이 흰 카드와 56px 겹친다), 이 열도 같은 한 점이라
 * 같이 고쳐야 하는 것처럼 보였다. **프로덕트 리더 판정: 안 고친다.** 두 열의 **정의가 다르다**:
 *
 *   (다)   덮인 글자가 **스크롤로도 안 풀리나**   → 맨 위의 겹침은 내리면 풀리므로 결함이 아니다
 *   edge   **그 순간** 버튼 둘레가 보이나          → 밀려 서 있는 그 순간이 곧 판정 시점이다
 *
 * 그래서 edge 는 두 상태를 보고 이 열은 끝점 하나를 본다. **같아 보이는 구멍이 한쪽에만 구멍이다.**
 * 맨 위를 더하면 이 열의 시간이 두 배가 되는데, 그렇게 사서 잡는 것은 **스크롤로 풀리는 가림**뿐이다.
 *
 * 세 가지를 지킨다:
 *
 *  1. **잎 노드만 센다.** 부모를 세면 `main` 부터 전부 걸려서 수가 뜻을 잃는다.
 *  2. **붙은 요소 자신과 그 자식은 뺀다.** 버튼 글자는 제 버튼 위에 있는 것이지 가려진 게 아니다.
 *  3. **칠하는 띠까지 넓혀 잰다.** 붙은 줄의 배경을 가짜 요소(`::before`·`::after`)로 제 상자보다
 *     넓게 깔아 둔 자리가 있다(`ui.module.css` 의 버튼 줄 둘레 띠). 요소 상자만 재면 **내가
 *     방금 넣은 그 띠를 자가 못 본다.** 절대 위치 가짜 요소의 음수 `inset` 과 `top:100%` 만큼
 *     바깥으로 넓힌다. 퍼센트로 남는 값은 못 읽으니 건너뛴다 — 못 잰 것을 잰 척하지 않는다.
 *
 * **비침도 같이 본다.** 배경이 반투명하거나 `opacity < 1` 인 붙은 요소는 밑이 비쳐 읽힌다.
 * 그때는 그 아래 글자를 **가려진 것으로 센다** — 덮은 것과 비친 것은 사용자에게 같은 일이다.
 * 제 배경이 비쳐도 **가짜 요소가 불투명하게 깔아 주면** 비치지 않는다(지금 버튼 줄이 그 꼴이다).
 */
const COVER = `(function () {
  function alpha(c) {
    var m = /rgba?\\(([^)]+)\\)/.exec(c);
    if (!m) return c === "transparent" ? 0 : 1;
    var p = m[1].split(",");
    return p.length > 3 ? parseFloat(p[3]) : 1;
  }
  function px(v) { return /px$/.test(v) ? parseFloat(v) : NaN; }

  /** 요소 상자 + 그 요소가 **칠하는** 가짜 요소 띠 */
  function painted(el) {
    var r = el.getBoundingClientRect();
    var box = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, opaque: alpha(getComputedStyle(el).backgroundColor) === 1 };
    ["::before", "::after"].forEach(function (which) {
      var cs = getComputedStyle(el, which);
      if (!cs || cs.content === "none" || cs.position === "static") return;
      var t = px(cs.top), b = px(cs.bottom), l = px(cs.left), ri = px(cs.right), h = px(cs.height);
      if (!isNaN(t) && t < 0) box.top = Math.min(box.top, r.top + t);
      if (!isNaN(l) && l < 0) box.left = Math.min(box.left, r.left + l);
      if (!isNaN(ri) && ri < 0) box.right = Math.max(box.right, r.right - ri);
      if (!isNaN(b) && b < 0) box.bottom = Math.max(box.bottom, r.bottom - b);
      // top 이 요소 높이와 같으면 100% 로 붙인 띠다 — 그 아래로 height 만큼 더 칠한다
      if (!isNaN(t) && !isNaN(h) && Math.abs(t - r.height) < 1) box.bottom = Math.max(box.bottom, r.bottom + h);
      if (alpha(cs.backgroundColor) === 1) box.opaque = true;
    });
    return box;
  }

  var stuck = Array.prototype.slice.call(document.querySelectorAll("body *")).filter(function (e) {
    var p = getComputedStyle(e).position;
    return p === "sticky" || p === "fixed";
  });
  var bars = stuck.map(function (e) {
    var b = painted(e);
    b.el = e;
    b.seeThrough = !b.opaque || parseFloat(getComputedStyle(e).opacity) < 1;
    b.text = (e.innerText || "").replace(/\\s+/g, " ").slice(0, 12);
    return b;
  });

  // 잎 노드 글자만. 붙은 요소 자신과 그 자식은 뺀다.
  var leaves = Array.prototype.slice.call(document.querySelectorAll("body *")).filter(function (e) {
    if (e.children.length) return false;
    if (!(e.innerText || "").trim()) return false;
    for (var i = 0; i < stuck.length; i++) if (stuck[i] === e || stuck[i].contains(e)) return false;
    return true;
  });

  var hidden = [];
  leaves.forEach(function (e) {
    var r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    for (var i = 0; i < bars.length; i++) {
      var b = bars[i];
      var over = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      var side = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      if (over > 1 && side > 1) { hidden.push({ text: (e.innerText || "").trim().slice(0, 10), bar: b.text }); break; }
    }
  });

  return {
    bars: bars.length,
    seeThrough: bars.filter(function (b) { return b.seeThrough; }).map(function (b) { return b.text; }),
    hidden: hidden,
  };
})()`;

type Row = { id: string; route: string; fold: string; exit: string; cover: string; ok: boolean };

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const rows: Row[] = [];

  for (const [id, route] of Object.entries(ROUTES)) {
    let r: Awaited<ReturnType<typeof page.evaluate>>;
    let cv: Awaited<ReturnType<typeof page.evaluate>>;
    try {
      await page.goto(base + route, { waitUntil: "networkidle", timeout: 20000 });
      await page.evaluate("document.fonts.ready");
      r = await page.evaluate(PROBE);
      // (다) 는 **끝까지 내린 뒤** 잰다. 붙은 것이 쉬는 자리로 돌아간 상태에서도 덮으면 그게 진짜 가림이다.
      await page.evaluate("window.scrollTo(0, document.scrollingElement.scrollHeight)");
      await page.waitForTimeout(80);
      cv = await page.evaluate(COVER);
    } catch {
      rows.push({ id, route, fold: "못 열었다", exit: "—", cover: "—", ok: false });
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

    // (다) 붙은 막대가 글자를 가리나
    const c = cv as { bars: number; seeThrough: string[]; hidden: { text: string; bar: string }[] };
    const okC = c.hidden.length === 0 && c.seeThrough.length === 0;
    const cover =
      c.bars === 0
        ? "붙은 것 없음"
        : c.hidden.length > 0
          ? `▲ ${c.hidden.length}자 가려짐 (${c.hidden[0].text} — ${c.hidden[0].bar})`
          : c.seeThrough.length > 0
            ? `비치는 막대 ${c.seeThrough.length} (${c.seeThrough[0]})`
            : `안 가림 (막대 ${c.bars})`;

    rows.push({ id, route, fold, exit, cover, ok: okA && okB && okC });
  }
  await browser.close();

  const bad = rows.filter((r) => !r.ok);
  console.log(`Jessi 가 보는 창 ${VIEW_W}×${VIEW_H} — 화면 ${rows.length}장\n`);
  console.log("      화면  라우트                  (가) 주 버튼          (나) 나가는 길          (다) 가림");
  for (const r of rows)
    console.log(
      `${r.ok ? "  통과" : "  실패"}  ${r.id.padEnd(6)}${r.route.padEnd(24)}${r.fold.padEnd(20)}${r.exit.padEnd(24)}${r.cover}`,
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
