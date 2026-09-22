/**
 * 문서가 남의 문서를 **이름으로** 가리킬 때, 그 이름이 실제로 거기 있는지 본다.
 *   pnpm docs:names
 *
 * **왜 생겼나.** 2026-09-22 에 줄 번호 인용 열넷을 이름으로 바꿨다. 번호는 파일이 늘면
 * 밀려서 언젠가 눈에 띄는데, **틀린 이름은 안 밀린다** — 그 자리에서 영원히 그럴듯하다.
 * 같은 날 `docs/STATUS.md` 에 "O05 는 FLOW 의 안 만드는 것 절에 있고" 라고 적혀 있었다.
 * `O05` 는 레포 어디에도 없고 FLOW 에 그런 절도 없는데, **둘 다 그럴듯해서 아무도 안 열었다.** 번호를 이름으로 바꾼 일이 이 구멍을 넓혔으니 자도 같이 넓힌다.
 *
 * **못 잡는 것: 있는 이름이 엉뚱한 절을 가리키는 것.** 대상 파일에 그 문장이 있기만 하면
 * 통과다. 같은 날 「통과 기준 70%」 판정을 `docs/MEASURE.md` 의 이웃 절 이름으로 가리킨
 * 것이 그 꼴이고, 이 자는 그걸 초록으로 지나간다. 그래서 **출력에 그 한계를 같이 찍는다** —
 * 안 재는 것과 재서 통과한 것이 같은 얼굴로 보이면 안 된다.
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
      if (!targets.get(key)!.includes(plain(name))) bad.push(`${p}:${idx + 1} → ${key} 「${name}」`);
    }
  });
}

console.log(`이름 인용 ${checked} · 대상에 없는 것 ${bad.length}`);
for (const line of bad) console.log(`  ✗ ${line}`);
console.log("이 자는 없는 이름만 잡는다. 있는 이름이 엉뚱한 절을 가리키는 것은 못 잡는다.");
