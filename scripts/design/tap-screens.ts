/**
 * **누르는 자리가 손가락만 한가 — 앱에서.**
 *   pnpm design:tap                      — http://localhost:3000
 *   pnpm design:tap http://localhost:4000
 *
 * `CLAUDE.md`: "누르는 것의 탭 영역은 44px 이상. **보이는 크기가 아니라 영역 기준이라**, 글자만
 * 있는 링크는 여백으로 영역을 키우되 레이아웃을 밀지 않는다."
 *
 * **왜 `design:lint` 가 있는데 또 세우나.** 그 자는 같은 규칙을 **165곳**에서 재고 통과하는데
 * **전부 `design/screens/*.html`** 이다. 참고는 그림이고 앱은 물건이라 답이 갈린다 — 실제로
 * 갈렸다(아래 큐). **앱은 아무도 안 쟀다.** 같은 규칙, 다른 물건, 다른 답.
 *
 * **그래서 참고를 안 본다.** `design:fold`·`design:edge` 와 같은 자리에 선다: 앱만 열어서
 * 사람 쪽 하나를 잰다. 자는 `frame.ts` 의 `VIEW_W × VIEW_H`(360×650) — Jessi 의 폰에서
 * 실제로 보이는 창이다.
 *
 * **자 하나에 물음 하나.** 색·폰트·`h1` 은 여기서 안 본다. 2026-09-22 에 `design:edge` 와
 * `design:fold` 의 (다) 가 같은 구멍처럼 보였다가 **정의가 다르다**로 갈린 날의 값이다.
 */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { VIEW_W, VIEW_H, ROUTES } from "./frame";

const TAP_MIN = 44;

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
 * **이미 알고 있고 큐에 있는 미달.** `docs/TEAM.md` 멈춤 판, 2026-09-22 판정 — 누르면 눌리고,
 * 둘 다 첫 5분 경로 밖이고, 다음에 그 파일을 여는 손에 얹는다.
 *
 * **왜 목록이 필요한가.** 그냥 빨갛게 두면 **설계대로 매일 빨간 것이 서 있는 꼴**이 되고, 그러면
 * 빨강을 무시하는 버릇이 붙는다(밤 백업에서 고친 그 병이다). 이 여섯은 설계대로가 아니라
 * **알고 있고 큐에 있는 것**이라 다르다. 그래서 **「빨강 여섯」과 「빨강 일곱」이 한눈에 갈리게**
 * 둘을 다른 말로 찍는다 — 일곱째만 종료 코드를 빨갛게 만든다.
 *
 * **목록이 낡으면 그것도 찍는다.** 큐에 있는데 안 나오면 고쳐졌다는 뜻이고, 그때는 여기서
 * 지워야 한다. 안 지우면 다음 미달이 이 이름을 쓰고 조용히 숨는다.
 */
const QUEUED_WHY = "큐에 있음 (docs/TEAM.md 멈춤 판, 2026-09-22 판정)";
const QUEUED: Record<string, { tag: string; text: string; n: number }[]> = {
  F03: [
    { tag: "BUTTON", text: "알아", n: 2 },
    { tag: "BUTTON", text: "몰라", n: 2 },
  ],
  F12: [{ tag: "SPAN", text: "協力", n: 2 }],
};

/**
 * **「보이는 크기」가 아니라 「영역」을 재는 조각.**
 *
 * 상자(`getBoundingClientRect`)만 보면 **여백·가짜 요소로 넓혀 둔 자리를 미달로 잘못 잡는다** —
 * 규칙이 바로 그렇게 넓히라고 적혀 있는데도(위 `CLAUDE.md` 인용). 그래서 모자란 것만 골라
 * **바깥을 두드려 본다**: 상자 밖 1px 부터 한 칸씩, 네 방향으로.
 *
 *   `document.elementFromPoint` 가 그 요소(또는 그 자손)를 잡나
 *     안 잡힘  →  거기서 영역이 끝난다
 *     잡힘     →  넓혀 둔 것이다. 그만큼 더해서 잰다
 *
 * **계산된 스타일이 아니라 실제로 눌리는 자리를 본다.** `padding` 을 읽으면 가짜 요소로 넓힌
 * 자리를 못 보고, 가짜 요소를 읽으면 부모가 가로챈 자리를 못 본다. 손가락이 닿는지는 결국
 * 적중 판정이 답한다 — `design:edge` 가 칠한 픽셀을 읽은 것과 같은 까닭이다.
 *
 * **화살표 함수가 아니라 문자열이다** — `tsx` 가 이름을 살리려고 끼우는 `__name` 이 브라우저에
 * 없어서 `evaluate` 가 죽는다 (`fold-screens.ts` 와 같은 이유).
 *
 * **누르는 것을 고르는 선택자는 `design:lint` 와 같다.** 같은 규칙을 다른 물건에 대는 자라,
 * 대상까지 다르면 두 수를 나란히 놓을 수가 없다.
 */
const TAP = `(function (MIN, REACH) {
  var els = Array.prototype.slice.call(document.querySelectorAll("a, button, [role=button], [data-tap]"));
  var out = [];
  els.forEach(function (el) {
    var box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;   // 안 보이면 누를 것도 아니다
    var text = (el.innerText || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 12);
    var row = { tag: el.tagName, text: text, w: Math.round(box.width), h: Math.round(box.height),
                ew: Math.round(box.width), eh: Math.round(box.height), grew: "" };
    if (box.width >= MIN && box.height >= MIN) { out.push(row); return; }

    // 모자란 것만 바깥을 두드린다. 창 밖은 못 두드리니 가운데로 끌어온다.
    el.scrollIntoView({ block: "center", inline: "center" });
    var r = el.getBoundingClientRect();
    function hits(x, y) {
      if (x < 0 || y < 0 || x > window.innerWidth - 1 || y > window.innerHeight - 1) return false;
      var t = document.elementFromPoint(x, y);
      return !!t && (t === el || el.contains(t));
    }
    function reach(dx, dy) {
      var ex = dx < 0 ? r.left : dx > 0 ? r.right - 1 : (r.left + r.right) / 2;
      var ey = dy < 0 ? r.top : dy > 0 ? r.bottom - 1 : (r.top + r.bottom) / 2;
      var got = 0;
      for (var d = 1; d <= REACH; d++) {
        if (!hits(ex + dx * d, ey + dy * d)) break;
        got = d;
      }
      return got;
    }
    var L = reach(-1, 0), R = reach(1, 0), U = reach(0, -1), D = reach(0, 1);
    row.ew = Math.round(r.width + L + R);
    row.eh = Math.round(r.height + U + D);
    if (L + R + U + D > 0) row.grew = "←" + L + " →" + R + " ↑" + U + " ↓" + D;
    out.push(row);
  });
  return out;
})(${TAP_MIN}, 24)`;

type Hit = { tag: string; text: string; w: number; h: number; ew: number; eh: number; grew: string };
type Row = { id: string; route: string; taps: number; grew: number; queued: Hit[]; fresh: Hit[]; err?: string };

/** 큐 목록에서 이 미달과 같은 이름을 하나 집어 쓴다. 다 쓰면 그다음부터는 새것이다. */
function takeQueued(left: { tag: string; text: string; n: number }[] | undefined, hit: Hit): boolean {
  if (!left) return false;
  const slot = left.find((q) => q.tag === hit.tag && q.text === hit.text && q.n > 0);
  if (!slot) return false;
  slot.n -= 1;
  return true;
}

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
  const started = Date.now();
  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const rows: Row[] = [];
  // 큐 목록의 사본. 화면마다 쓴 만큼 줄여서, 다 쓰고 남은 것이 "고쳐졌다" 로 남는다.
  const left: Record<string, { tag: string; text: string; n: number }[]> = Object.fromEntries(
    Object.entries(QUEUED).map(([id, list]) => [id, list.map((q) => ({ ...q }))]),
  );

  for (const [id, route] of Object.entries(ROUTES)) {
    let hits: Hit[];
    try {
      await page.goto(base + route, { waitUntil: "networkidle", timeout: 30000 });
      await page.evaluate("document.fonts.ready");
      hits = (await page.evaluate(TAP)) as Hit[];
    } catch {
      rows.push({ id, route, taps: 0, grew: 0, queued: [], fresh: [], err: "못 열었다" });
      continue;
    }
    const small = hits.filter((x) => x.ew < TAP_MIN || x.eh < TAP_MIN);
    const queued: Hit[] = [];
    const fresh: Hit[] = [];
    for (const hit of small) (takeQueued(left[id], hit) ? queued : fresh).push(hit);
    rows.push({ id, route, taps: hits.length, grew: hits.filter((x) => x.grew && x.ew >= TAP_MIN && x.eh >= TAP_MIN).length, queued, fresh });
  }
  await browser.close();

  const taps = rows.reduce((n, r) => n + r.taps, 0);
  const grew = rows.reduce((n, r) => n + r.grew, 0);
  const queued = rows.reduce((n, r) => n + r.queued.length, 0);
  const fresh = rows.reduce((n, r) => n + r.fresh.length, 0);
  const broke = rows.filter((r) => r.err);
  const stale = Object.entries(left).flatMap(([id, list]) => list.filter((q) => q.n > 0).map((q) => `${id} ${q.tag} ${q.text} ×${q.n}`));

  console.log(`Jessi 가 보는 창 ${VIEW_W}×${VIEW_H} — 화면 ${rows.length}장, 누르는 자리 ${taps}곳\n`);
  console.log("      화면  라우트                  누르는 자리  44px 미달");
  for (const r of rows) {
    const mark = r.err ? "  못 봄" : r.fresh.length ? "  새것" : r.queued.length ? "  큐  " : "  통과";
    const said = r.err
      ? r.err
      : r.fresh.length
        ? `▲ 새 미달 ${r.fresh.length}곳${r.queued.length ? ` (+ 큐 ${r.queued.length})` : ""}`
        : r.queued.length
          ? `${r.queued.length}곳 — ${QUEUED_WHY}`
          : "없음";
    console.log(`${mark}  ${r.id.padEnd(6)}${r.route.padEnd(24)}${String(r.taps).padStart(6)}       ${said}`);
  }

  const detail = (label: string, list: { id: string; hit: Hit }[]) => {
    if (!list.length) return;
    console.log(`\n${label}`);
    for (const { id, hit } of list)
      console.log(
        `  ${id.padEnd(6)}${hit.tag.padEnd(7)}${`「${hit.text}」`.padEnd(16)}상자 ${hit.w}×${hit.h}` +
          (hit.grew ? ` · 넓힌 뒤 ${hit.ew}×${hit.eh} (${hit.grew})` : " · 넓힌 자리 없음"),
      );
  };
  detail("▲ 새 미달 — 큐에 없는 것이다", rows.flatMap((r) => r.fresh.map((hit) => ({ id: r.id, hit }))));
  detail(`큐에 있는 미달 — ${QUEUED_WHY}`, rows.flatMap((r) => r.queued.map((hit) => ({ id: r.id, hit }))));

  console.log(
    `\n새 미달 ${fresh} · 큐에 있는 미달 ${queued} · 여백으로 넓혀서 통과 ${grew} / 누르는 자리 ${taps}곳` +
      ` · ${((Date.now() - started) / 1000).toFixed(1)}초`,
  );
  if (stale.length) {
    console.log(`\n큐에 적혀 있는데 안 나온 것 ${stale.length} — ${stale.join(" · ")}`);
    console.log("→ 고쳐졌으면 이 스크립트의 QUEUED 에서 지워라. 안 지우면 다음 미달이 이 이름을 쓰고 숨는다.");
  }
  if (broke.length) {
    console.log(`\n못 본 화면: ${broke.map((r) => r.id).join(" · ")} — 미리보기 서버가 떠 있나 (ANCHOR_DESIGN_PREVIEW=1)`);
    process.exit(1);
  }
  if (fresh) {
    console.log(`\n새 미달 ${fresh}곳. 큐에 있는 ${queued}곳과 다른 것이다 — 이건 지금 보는 것이다.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
