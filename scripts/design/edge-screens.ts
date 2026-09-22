/**
 * **붙어 있는 동안 버튼의 둘레가 보이는가.**
 *   pnpm design:edge                      — http://localhost:3000
 *   pnpm design:edge http://localhost:4000
 *
 * 주 버튼을 창 바닥에 붙이면서(`61f838d`) 버튼 줄이 흰 카드 **안쪽**에 서는 자리가 생겼다.
 * F14(`/talk/x`) 의 `듣기` 는 **흰 배경 + `#E6E7EA` 테두리**이고 뒤의 카드도 **흰 배경 + 같은
 * 테두리색**이라, 버튼이 어디서 끝나고 카드가 어디서 시작하는지 **볼 근거가 화면에 없었다.**
 *
 * **왜 다른 자로는 안 걸렸나.** 그날 이 건은 초록 둘을 근거로 한 번 닫혔다 —
 * `design:fold` 25/25(접히나) 와 가림 0(글자를 덮나·비치나). **둘 다 「경계가 보이나」를 묻지 않는다.**
 * 가리지도 비치지도 않으면서 경계만 사라지는 것이 정확히 이 결함이라 두 자 모두 통과를 냈다.
 * `design:diff` 도 못 잡는다 — 참고 HTML 은 390×844 라 버튼이 애초에 안 붙는다.
 *
 * **그래서 이 자는 계산된 스타일을 안 본다.** 화면을 찍어서 **칠해진 픽셀**을 읽는다.
 * 겹침·`z-index`·가짜 요소·투명도가 섞이면 스타일 값과 실제로 칠해진 색이 갈리는데, 사람 눈에
 * 닿는 것은 칠해진 쪽이다.
 *
 * **재는 법.** 붙는 요소(`position: sticky|fixed`) 안의 버튼·링크마다, 테두리 상자 **바깥 4px**
 * 로 나가 그 픽셀을 읽는다. 그 색이 **버튼 제 배경색과 같으면 결함**이다 — 경계가 아니라
 * 같은 색의 연속이라는 뜻이다. 네 변을 다 보고 **한 변이라도 같으면** 건다.
 *
 * **바깥 4px 인 이유.** 고침(`06a140a`)이 깐 띠가 위아래 8px 이라 그 안쪽을 읽어야 띠를 읽는다.
 * 1px 로 잡으면 테두리 반픽셀이 섞이고, 8px 을 넘기면 띠 밖으로 나가 카드를 읽어 **고쳤는데도
 * 결함으로 나온다.**
 *
 * **자가 제 일을 하는지 재는 길을 같이 둔다.**
 *   pnpm design:edge http://localhost:3000 --prove
 * 이러면 **붙는 요소가 까는 띠(가짜 요소)만** 끄고 잰다 — 즉 `06a140a` **이전 상태**로 만든다.
 * 화면의 가짜 요소를 통째로 끄면 그건 「고치기 전」이 아니라 **다른 화면**이라 답이 뜻을 잃는다.
 * 이 갈래에서 **F14 가 빨갛게 나와야** 위의 25/25 가 뜻을 갖는다. 초록만 보고 자를 믿으면,
 * 아무것도 안 재는 자도 25/25 를 낸다 (`docs/TEAM.md` 10장).
 */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
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
 * 재는 조각. **화살표 함수가 아니라 문자열이다** — `tsx` 가 `__name` 을 끼워 넣는데 브라우저에
 * 그 함수가 없어 `evaluate` 가 죽는다 (`fold-screens.ts` 와 같은 이유).
 *
 * **상자라고 말하는 것만 잰다.** 두 가지를 건너뛴다.
 *   ① 제 배경이 비치는 것(이탈 링크) — 둘레가 아니라 글자색으로 읽히는 자리다.
 *   ② 제 배경이 **화면 배경과 같은 것**(`됐어`·`설정`·`나중에`) — 채워 놓고도 상자로 안 보이려는
 *      자리라, 둘레가 안 보이는 것이 **의도**다. 이걸 안 빼면 스물다섯 중 일곱이 빨갛게 뜨는데
 *      전부 결함이 아니다. 그 자리들의 눈에 띔은 `design:fold` 의 (나) 가 본다.
 * **①②를 뺐다고 구멍이 생기지는 않는다** — 화면색 버튼이 흰 카드 위에 서면 바깥이 흰색이라
 * 제 배경과 안 같고, 그래서 이 자는 그때 그냥 통과를 낸다(둘레가 실제로 보이니까).
 */
const PROBE = `(function () {
  var out = [];
  var pageBg = getComputedStyle(document.body).backgroundColor;
  var all = Array.prototype.slice.call(document.querySelectorAll("button, a"));
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    var stuck = false;
    for (var p = e; p && p !== document.body; p = p.parentElement) {
      var pos = getComputedStyle(p).position;
      if (pos === "sticky" || pos === "fixed") { stuck = true; break; }
    }
    if (!stuck) continue;
    var cs = getComputedStyle(e), r = e.getBoundingClientRect();
    var m = cs.backgroundColor.match(/[\\d.]+/g);
    if (!m) continue;
    if (m.length > 3 && parseFloat(m[3]) < 1) continue;
    if (cs.backgroundColor === pageBg) continue;
    out.push({
      text: (e.innerText || "").trim().slice(0, 12),
      fill: "rgb(" + m[0] + "," + m[1] + "," + m[2] + ")",
      x: r.x, y: r.y, w: r.width, h: r.height
    });
  }
  return out;
})()`;

type Ctl = { text: string; fill: string; x: number; y: number; w: number; h: number };
type Row = { id: string; route: string; verdict: string; ok: boolean };

/** 테두리 상자 바깥 4px. 띠(위아래 8px) 안쪽이라 띠를 읽고, 테두리 반픽셀은 안 섞인다 */
const OUT = 4;

async function main() {
  const args = process.argv.slice(2);
  const prove = args.includes("--prove");
  const base = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000").replace(/\/$/, "");
  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const rows: Row[] = [];

  for (const [id, route] of Object.entries(ROUTES)) {
    let ctls: Ctl[];
    let png: PNG;
    try {
      await page.goto(base + route, { waitUntil: "networkidle", timeout: 20000 });
      await page.evaluate("document.fonts.ready");
      // 자를 증명하는 갈래 — 띠를 끄면 고치기 전 화면이 된다. 위 머리말 참고.
      //
      // **붙는 요소의 가짜 요소만 끈다.** 처음엔 `*::before, *::after` 로 통째로 껐는데, 그러면
      // 화면 어디에 있든 가짜 요소가 다 사라져 **「고치기 전」이 아니라 「다른 화면」**이 된다.
      // 개발이 두 자를 합칠지 보다가 이걸 짚었다 — `design:fold` 의 (다) 는 **바로 그 가짜 요소가
      // 칠하는 띠**를 읽어 가림을 재니, 같은 깃발이 한쪽에서는 「되돌려라」, 다른 쪽에서는
      // 「내가 볼 것을 없애라」가 된다. 자는 안 합치기로 했지만 **넓게 끄는 것 자체가 틀렸다** —
      // 머리말이 「붙는 요소가 까는 띠를 끈다」고 말하는데 코드가 더 많이 끄고 있었다.
      if (prove) {
        await page.evaluate(`(function () {
          var all = document.querySelectorAll("*");
          for (var i = 0; i < all.length; i++) {
            var pos = getComputedStyle(all[i]).position;
            if (pos === "sticky" || pos === "fixed") all[i].setAttribute("data-prove-off", "");
          }
        })()`);
        await page.addStyleTag({
          content: `[data-prove-off]::before, [data-prove-off]::after { content: none !important; }`,
        });
      }
      // **바닥까지 내린 뒤에 잰다.** 붙는 요소는 넘치는 화면에서만 겹쳐 서고, 겹치지 않으면
      // 둘레가 어차피 화면 배경이라 이 자가 볼 것이 없다.
      await page.evaluate("window.scrollTo(0, document.scrollingElement.scrollHeight)");
      await page.waitForTimeout(250);
      ctls = (await page.evaluate(PROBE)) as Ctl[];
      png = PNG.sync.read(await page.screenshot());
    } catch {
      rows.push({ id, route, verdict: "못 열었다", ok: false });
      continue;
    }

    const at = (x: number, y: number) => {
      const cx = Math.round(x), cy = Math.round(y);
      if (cx < 0 || cy < 0 || cx >= png.width || cy >= png.height) return null;
      const i = (png.width * cy + cx) << 2;
      return `rgb(${png.data[i]},${png.data[i + 1]},${png.data[i + 2]})`;
    };

    const bad: string[] = [];
    for (const c of ctls) {
      const mx = c.x + c.w / 2, my = c.y + c.h / 2;
      const sides: [string, number, number][] = [
        ["위", mx, c.y - OUT],
        ["아래", mx, c.y + c.h + OUT],
        ["왼", c.x - OUT, my],
        ["오른", c.x + c.w + OUT, my],
      ];
      for (const [name, px, py] of sides) {
        const got = at(px, py);
        if (got && got === c.fill) bad.push(`${c.text || "(글자 없음)"} ${name} ${got}`);
      }
    }

    const ok = bad.length === 0;
    rows.push({
      id, route, ok,
      verdict: ctls.length === 0 ? "붙는 버튼 없음" : ok ? `둘레 보임 (${ctls.length}개)` : bad.join(" · "),
    });
  }

  await browser.close();

  const w1 = Math.max(...rows.map((r) => r.id.length), 2);
  const w2 = Math.max(...rows.map((r) => r.route.length), 4);
  console.log(`\n붙은 버튼의 둘레 — ${VIEW_W}×${VIEW_H}, 바닥까지 내린 뒤${prove ? "  [--prove: 띠 끔 = 고치기 전]" : ""}\n`);
  for (const r of rows)
    console.log(`${r.ok ? "  " : "✗ "}${r.id.padEnd(w1)}  ${r.route.padEnd(w2)}  ${r.verdict}`);
  const bad = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - bad.length}/${rows.length} 통과`);
  if (prove) {
    console.log("\n`--prove` 는 **빨간 줄이 나와야 맞는 실행**이다. 여기서 25/25 가 나오면 자를 고쳐라.");
    process.exitCode = 0;
    return;
  }
  if (bad.length) {
    console.log("\n칠해진 바깥 색이 버튼 제 배경색과 같다 — 경계가 아니라 같은 색의 연속이다.");
    console.log("고칠 곳은 버튼이 아니라 **뒤에 무엇이 오는가** 다. 띠를 깔거나 뒤 상자를 비킨다.");
    process.exitCode = 1;
  }
}

main();
