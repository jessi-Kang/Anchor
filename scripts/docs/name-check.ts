/**
 * 문서가 남의 문서를 **이름으로** 가리킬 때, 그 이름이 실제로 거기 있는지 본다.
 *   pnpm docs:names
 *
 * **왜 생겼나.** 2026-09-22 에 줄 번호 인용 열넷을 이름으로 바꿨다. 번호는 파일이 늘면
 * 밀려서 언젠가 눈에 띄는데, **틀린 이름은 안 밀린다** — 그 자리에서 영원히 그럴듯하다.
 * 같은 날 `docs/STATUS.md` 에 "O05 는 FLOW 의 안 만드는 것 절에 있고" 라고 적혀 있었다.
 * `O05` 는 레포 어디에도 없고 FLOW 에 그런 절도 없는데, **둘 다 그럴듯해서 아무도 안 열었다.** 번호를 이름으로 바꾼 일이 이 구멍을 넓혔으니 자도 같이 넓힌다.
 *
 * **구멍이 둘인데 하나만 닫힌다.** ⒜ 이름이 대상에 여러 곳 있어 **어느 자리인지 안 정해지는
 * 것** — 이건 잰다. 제목이거나 「」로 묶인 자리를 세서 하나로 안 떨어지면 찍는다(PM 축이
 * 열아홉을 손으로 열어 세어 넘겼다: 서로 다른 이름 열넷 중 맨살로 두 곳 이상이 넷이고,
 * `docs/QA.md` 의 한 이름은 **여덟 곳**이다. 오늘은 넷 다 제목·「」로 떨어져 0 이지만,
 * 그 문서에 제목이 하나 더 서는 날 조용히 안 떨어진다). ⒝ **이름은 한 곳뿐인데 가리키려던
 * 자리가 아닌 것** — 이건 못 잰다. 같은 날 「통과 기준 70%」 판정을 `docs/MEASURE.md` 의
 * 이웃 절 이름으로 가리킨 것이 그 꼴이고, 대상에 정확히 한 곳 있으니 어떤 셈으로도 초록이다.
 *
 * **그래서 출력이 둘을 갈라 말한다.** 닫힌 절반이 열린 절반을 가리면 안 된다 — 안 재는 것과
 * 재서 통과한 것이 같은 얼굴로 보이면 안 된다는 것이 이 자가 생긴 까닭 그 자체다.
 *
 * **막지 않는다.** 언제나 0 으로 끝난다. 열둘 중 열하나가 헛것이던 첫 판을 그대로 붙였으면
 * 멀쩡한 밀기가 막혔을 거고, 그러면 사람이 `push.sh` 를 안 쓴다(그 파일 ①′ 의 까닭과 같다).
 * 지금은 파일 이름 **바로 곁**의 「…」만 인용으로 세서 헛것이 0 이다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SKIP = new Set([".git", "node_modules", ".next", ".vercel"]);
const SCAN = [".md", ".ts", ".tsx", ".html", ".css"];

/** 강조 기호를 떼고 맞춘다. 안 떼면 `**굵은 제목**` 을 가리킨 멀쩡한 인용이 전부 걸린다. */
const plain = (s: string) => s.replace(/[*`]/g, "").trim();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(".").map((p) => relative(".", p));
const targets = new Map<string, string>();
for (const p of files) if (p.endsWith(".md")) targets.set(p, plain(readFileSync(p, "utf8")));

/**
 * 파일 이름과 「…」 사이에 **조사와 장 표시만** 올 때 인용으로 본다.
 * 느슨하게 잡으면(앞 60자 아무거나) 제 문장을 강조한 「…」이 전부 걸린다 — 첫 판이 그랬고
 * 열둘 중 열하나가 헛것이었다.
 */
const CITE =
  /(?<![\w/.])((?:[\w.-]+\/)*[A-Za-z][\w.-]*\.md)`?[`\s]*(?:의)?[`\s]*(?:[0-9０-９]+[′'’]?\s*[장절]\s*)?(?:의\s*)?「([^」\n]{4,60})」/gu;

let checked = 0;
const bad: string[] = [];
const vague: string[] = [];

/**
 * 그 이름이 대상에서 **어느 한 자리로 떨어지는가**. 제목 줄이거나 「」로 묶인 자리를 센다 —
 * 지나가는 말로 같은 낱말이 몇 번 나오는 것은 가리키는 자리가 아니다.
 * 0 이면 맨살로 몇 번 나오는지로 본다.
 */
function anchors(body: string, name: string): number {
  const marked =
    body.split("\n").filter((l) => l.trimStart().startsWith("#") && l.includes(name)).length +
    [...body.matchAll(/「([^」\n]+)」/gu)].filter((m) => m[1].trim() === name).length;
  if (marked > 0) return marked;
  return body.split(name).length - 1;
}

for (const p of files) {
  if (!SCAN.some((ext) => p.endsWith(ext))) continue;
  const lines = readFileSync(p, "utf8").split("\n");
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(CITE)) {
      const [, raw, name] = m;
      // `README.md` 는 루트에도 `db/` 에도 있다. 꼬리만 보면 엉뚱한 파일을 고치게 만든다.
      const key = [raw, `docs/${raw}`].find((k) => targets.has(k));
      if (!key || resolve(key) === resolve(p)) continue;
      checked += 1;
      const body = targets.get(key)!;
      const want = plain(name);
      if (!body.includes(want)) {
        bad.push(`${p}:${idx + 1} → ${key} 「${name}」`);
      } else if (anchors(body, want) !== 1) {
        vague.push(`${p}:${idx + 1} → ${key} 「${name}」 (${anchors(body, want)}곳)`);
      }
    }
  });
}

console.log(`이름 인용 ${checked} · 대상에 없는 것 ${bad.length} · 한 자리로 안 떨어지는 것 ${vague.length}`);
for (const line of bad) console.log(`  ✗ ${line}`);
for (const line of vague) console.log(`  ? ${line}`);
console.log("재는 것: 그 이름이 대상에 있나 · 대상에서 한 자리로 떨어지나.");
console.log("안 재는 것: 그게 **가리키려던** 자리인가. 있는 이름을 엉뚱하게 고른 것은 여기서 초록이다.");
