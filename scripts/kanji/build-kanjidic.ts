/**
 * KANJIDIC2 + CJKVI IDS → db/seed/kanji.json (상용한자 2,136자 최소 적재)
 *   pnpm kanji:build            (.cache/kanjidic2.xml, .cache/ids.txt 를 받거나 있으면 재사용)
 *
 * 한 글자에 남기는 것: 음독(히라가나), 훈독, 한국 한자음, 영어 뜻, 부품(IDS 를 이름 있는 부품까지 펼친 것), 학년·빈도·JLPT.
 * 부품 이름은 db/seed/parts-ko.json. 이름이 있는 부품에서 멈추고, 이름이 없는 중간 부품은
 * 그 아래 부품이 전부 이름이 있고 3개 이하일 때만 한 번 더 펼친다 (開 = 門 + 开 처럼 잘게 부서지지 않게).
 * 출처: KANJIDIC2 (EDRDG, CC BY-SA 4.0), CJKVI IDS (MIT 계열). 두 파일 모두 이 스크립트가 받는다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";

const CACHE = path.resolve(process.cwd(), ".cache");
const KANJIDIC_URL = "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz";
const IDS_URL = "https://raw.githubusercontent.com/cjkvi/cjkvi-ids/master/ids.txt";
const OUT = path.resolve(process.cwd(), "db/seed/kanji.json");
const PARTS = path.resolve(process.cwd(), "db/seed/parts-ko.json");

type KanjiOut = {
  kanji: string;
  grade: number;
  freq: number | null;
  jlpt: number | null;
  on: string[];
  kun: string[];
  ko: string | null;
  meanings: string[];
  parts: string[];
};

async function fetchCached(url: string, file: string, gz = false): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const p = path.join(CACHE, file);
  if (existsSync(p)) return readFileSync(p, "utf8");
  process.stdout.write(`받는 중 ${url} ... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = (gz ? gunzipSync(buf) : buf).toString("utf8");
  writeFileSync(p, text);
  console.log("완료");
  return text;
}

/** 가타카나 → 히라가나 */
const toHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const IDC = new Set("⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻");
function isCjk(c: string) {
  const o = c.codePointAt(0) ?? 0;
  return (o >= 0x2e80 && o <= 0x2fdf) || (o >= 0x31c0 && o <= 0x31ef) || (o >= 0x3400 && o <= 0x4dbf) || (o >= 0x4e00 && o <= 0x9fff) || (o >= 0xf900 && o <= 0xfaff) || (o >= 0x20000 && o <= 0x3134f);
}

async function main() {
  const xml = await fetchCached(KANJIDIC_URL, "kanjidic2.xml", true);
  const idsText = await fetchCached(IDS_URL, "ids.txt");
  const partsFile = JSON.parse(readFileSync(PARTS, "utf8")) as { parts: Record<string, string>; expand: Record<string, string> };
  const named = new Set(Object.keys(partsFile.parts));
  const override = partsFile.expand;

  // IDS: "U+5354\t協\t⿰十劦" (변형 표기 [GTJKV] 는 첫 후보만)
  const ids = new Map<string, string>();
  for (const line of idsText.split("\n")) {
    if (line.startsWith("#")) continue;
    const [, ch, seq] = line.split("\t");
    if (ch && seq) ids.set(ch, seq.replace(/\[[A-Za-z]+\]/g, ""));
  }
  /*
    **변형 문자는 정자로 되돌린다** (docs/FLOW.md 4장, 기획 결정).

    이유는 폰트가 아니라 **원칙 2(소리)** 다. `𧾷` 은 그려 줘도 한국 한자음이 없어 부를 이름이
    없고, 그래프에서 제 노드가 못 되며 다음 카드도 못 된다. `足`(족) 은 사용자가 이미 아는 소리이고
    제 노드가 있다. 路 = 足 + 各 가 원래 설명이기도 하다. 24자에서 발판 없던 자리에 발판이 생긴다.

    울타리 셋 — **손으로 확인한 목록만**(늘리려면 기획·PM 을 거친다), **자동 치환 금지**(모양이
    비슷하다고, 코드포인트가 가깝다고 바꾸지 않는다), **정자가 씨앗에 있고 한국 한자음을 가질 때만**.
    폰트가 그 글자를 그릴 수 있느냐와는 상관없이 적용한다.

    자리를 여기 둔 이유: `parts-ko.json` 은 부품 **이름 사전**이라 거기에 치환 규칙을 얹으면 한
    파일이 두 일을 하게 된다(`docs/TEAM.md` 10장). 그리고 산출물(`kanji.json`)만 고치면 다음
    빌드에 조용히 되돌아간다. 규칙은 만드는 자리에 있어야 살아남는다.
  */
  const UPRIGHT: Record<string, string> = { "\u{27FB7}": "足", "\u{2634C}": "羊", "\u{27607}": "衣" };

  const directParts = (ch: string): string[] | null => {
    if (override[ch]) return Array.from(override[ch]);
    const seq = ids.get(ch);
    if (!seq) return null;
    const cs = Array.from(seq).filter((c) => !IDC.has(c));
    if (cs.some((c) => !isCjk(c))) return null;
    if (cs.length === 0 || (cs.length === 1 && cs[0] === ch)) return null;
    // 쪼개자마자 되돌린다 — 뒤에서 하면 그 사이에 변형 문자가 이름·확장 판단을 한 번 거치게 되고,
    // 이름 사전에서 그 줄을 지우는 순간 결과가 달라진다.
    return cs.map((c) => UPRIGHT[c] ?? c);
  };
  /** 이름 있는 부품까지 펼친다 */
  const STROKES = new Set("一丨丿丶乀乚亅𠃌𠃊二");
  const parts = (ch: string): string[] => {
    const cs = directParts(ch);
    if (!cs) return [];
    // 획으로만 쪼개지는 이름 있는 글자(力·日·車·十)는 그림 하나로 본다. 부품 카드가 "삐침 별 + 갈고리 궐"이 되면 안 된다.
    if (named.has(ch) && cs.every((c) => STROKES.has(c))) return [];
    const out: string[] = [];
    for (const c of cs) {
      if (named.has(c) || override[c] === undefined && !ids.has(c)) {
        out.push(...(override[c] ? Array.from(override[c]) : [c]));
        continue;
      }
      if (override[c]) {
        out.push(...Array.from(override[c]));
        continue;
      }
      const sub = directParts(c);
      if (sub && sub.length <= 3 && sub.every((s) => named.has(s) || override[s])) {
        for (const s of sub) out.push(...(override[s] ? Array.from(override[s]) : [s]));
      } else {
        out.push(c);
      }
    }
    // 제 자신은 제 부품이 아니다. 衣 를 정자로 되돌리면 衣 = 亠 + 𧘇 → 亠 + 衣 가 되어 카드가
    // 자기 글자를 자기 부품으로 내보인다. 되돌리기가 만든 자리라 되돌린 뒤에 거른다.
    const kept = out.filter((c) => c !== ch && nameable(c));
    /*
      **걸러서 2개 미만이 되면 「부품 없음」으로 보낸다.**
      지금 부품이 1개인 한자는 사실상 없고(1자), 카드는 "부품 둘" 을 전제로 서 있다. 그냥 거르기만
      하면 아무도 설계한 적 없는 "부품 하나짜리" 화면이 199자에 생긴다. 「부품 없음」은 이미 146자가
      가는 길이다 — 한자를 통째로 세우고 "이 모양이면 무슨 뜻이 될까?" 로 묻는다. **새 화면 상태를
      만들지 않는다.** 이건 오늘 막는 것이고, 부품 하나짜리 문안이 정해지면 그 199자는 그쪽으로 간다.
    */
    return kept.length < 2 ? [] : kept;
  };

  const chars = xml.split("<character>").slice(1);
  /*
    **부를 이름이 있는 부품만 남긴다** (docs/FLOW.md, PM 결정).

    카드가 묻는 것은 "이 부품들이 모이면 무슨 뜻이 될까" 인데, 부를 이름이 없는 부품이 그 문장에
    서면 "𠂒와 어진사람이 모이면" 이 된다 — 사용자가 답할 수 없는 질문이다. **폰트가 그리느냐와
    상관없다**: 使 = 亻 + 吏, 足 = 龰 … 처럼 멀쩡히 그려지는 글자도 부를 이름이 없으면 같은 자리다.
    실제로 이름 없는 부품이 걸린 한자가 263자이고 그중 181자는 BMP 안이라 폰트로는 영영 안 고쳐진다.

    이름은 두 곳에서 온다: `parts-ko.json` 의 훈("열 십"), 아니면 **그 글자 자체의 한국 한자음**
    (부품이 그 자체로 한자면 사용자가 이미 아는 소리가 있다 — 원칙 2).
  */
  const koSound = new Map<string, string>();
  for (const c of chars) {
    const lit = /<literal>(.*?)<\/literal>/.exec(c)?.[1];
    const grade = Number(/<grade>(\d+)<\/grade>/.exec(c)?.[1] ?? 0);
    const ko = /<reading r_type="korean_h">(.*?)<\/reading>/.exec(c)?.[1];
    // **우리 씨앗에 든 한자의 소리만 센다.** KANJIDIC 에는 상용한자 밖 글자의 한국 한자음도 있지만,
    // 그 글자는 우리 그래프에 노드가 없어서 부를 수도 다음 카드가 될 수도 없다 — 이름이 있는 것과 다르다.
    if (lit && ko && grade >= 1 && grade <= 8) koSound.set(lit, ko);
  }
  /*
    **획 하나를 가리키는 부품은 이름이 있어도 뺀다** (기획 `75d3eb1`, 아홉 종).

    이름이 있어도 앵커가 못 된다 — "갈고리와 파임과 삐침이 모이면" 은 아무 발판도 안 준다. 그리고
    그래프에 **가짜 인접**을 만든다: 갈고리를 공유한다고 두 한자가 가까운 게 아니다.

    **이름 글자로 훑어 찾지 않는다.** 그렇게 하면 `隹`(새 추 — 새라는 뜻), `卜`(점 복 — 점치는 것),
    `俞`(점점 유)가 같이 걸린다. 가르는 기준은 이름이 아니라 **그게 획인가 물건인가**라, 손으로
    확인한 이 목록만 쓴다. 늘리려면 기획 확정을 거친다.

    `𠃊`(숨을 은)과 같은 꼴의 BMP 글자 `乚` 도 여기 든다(PM 판정). 이름이 붙어 있지만 열넷에서는
    글리프의 **아래 갈고리**일 뿐이다 — `化 = 亻(사람 인) + 乚(숨을 은)` 으로 "되다" 가 나오지 않는다.
    되는 것은 `亡` 하나뿐이고, 하나 때문에 열넷을 남기지 않는다. `亠` 가 같은 냄새가 나지만 목록을
    넓히는 것은 기획 몫이라 손대지 않는다 — 여기서 늘리기 시작하면 기준 없이 답부터 고르게 된다.
  */
  const STROKE_PARTS = new Set(Array.from("丨丶丿乀亅\u{200CC}\u{31C0}\u{31C7}\u{4E5B}\u{200CA}\u{4E5A}"));
  const nameable = (p: string) => (named.has(p) || koSound.has(p)) && !STROKE_PARTS.has(p);
  /** 부품을 부르는 이름. 사전의 훈이 먼저고, 없으면 그 글자 자체의 한국 한자음 (씨앗이 그렇게 채운다). */
  const partName = (p: string) => partsFile.parts[p] ?? koSound.get(p) ?? p;

  const items: KanjiOut[] = [];
  for (const c of chars) {
    const lit = /<literal>(.*?)<\/literal>/.exec(c)?.[1];
    const grade = Number(/<grade>(\d+)<\/grade>/.exec(c)?.[1] ?? 0);
    if (!lit || !grade || grade > 8) continue; // 상용한자(1~8)만
    const freq = /<freq>(\d+)<\/freq>/.exec(c)?.[1];
    const jlpt = /<jlpt>(\d+)<\/jlpt>/.exec(c)?.[1];
    const on = [...c.matchAll(/<reading r_type="ja_on">(.*?)<\/reading>/g)].map((m) => toHira(m[1]));
    const kun = [...c.matchAll(/<reading r_type="ja_kun">(.*?)<\/reading>/g)].map((m) => m[1]);
    const ko = /<reading r_type="korean_h">(.*?)<\/reading>/.exec(c)?.[1] ?? null;
    const meanings = [...c.matchAll(/<meaning>(.*?)<\/meaning>/g)].map((m) => m[1]);
    items.push({ kanji: lit, grade, freq: freq ? Number(freq) : null, jlpt: jlpt ? Number(jlpt) : null, on, kun, ko, meanings, parts: parts(lit) });
  }
  /*
    **질문이 겹치면 둘 다 「부품 없음」으로 보낸다** (PM 판정, 기획 확정).

    `上` = ⺊(점 복) + 一(한 일), `下` = 一(한 일) + 卜(점 복). 글자는 다른데 **이름이 같아서** 둘 다
    "점과 한이 모이면 무슨 뜻이 될까?" 가 되고 답은 정반대다. **한 질문에 답이 둘이면 그건 질문이
    아니다.** 부품에 이름이 다 있어서 위 규칙 어디에도 안 걸리는 자리다.

    판정 기준은 **이름 묶음이 같은가** 하나다. 손 목록도 키워드도 없이 계산으로 나온다. 그리고
    위 규칙들을 **적용한 뒤에** 본다 — 순서가 바뀌면 겹침 집합이 달라진다.
  */
  const byNames = new Map<string, string[]>();
  for (const it of items) {
    if (it.parts.length < 2) continue;
    const key = it.parts.map(partName).sort().join("\u0000");
    (byNames.get(key) ?? byNames.set(key, []).get(key)!).push(it.kanji);
  }
  const clashed = new Set([...byNames.values()].filter((g) => g.length > 1).flat());
  for (const it of items) if (clashed.has(it.kanji)) it.parts = [];

  items.sort((a, b) => (a.freq ?? 9999) - (b.freq ?? 9999) || a.grade - b.grade);
  const unnamed = new Map<string, number>();
  for (const it of items) for (const p of it.parts) if (!nameable(p)) unnamed.set(p, (unnamed.get(p) ?? 0) + 1);
  const out = {
    _comment: "scripts/kanji/build-kanjidic.ts 가 KANJIDIC2 + CJKVI IDS 에서 만든다. 손으로 고치지 말 것. 상용한자 2,136자: 음독(히라가나)·훈독·한국 한자음·영어 뜻·부품. 한국어 앵커 단어는 kanji-ko.json, 카드 문안은 kanji-cards.json.",
    source: { kanjidic2: KANJIDIC_URL, ids: IDS_URL, built_at: new Date().toISOString().slice(0, 10) },
    items,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\},\{"kanji"/g, "},\n{\"kanji\"") + "\n");
  // 제외 규칙이 실제로 몇 자를 옮겼는지 매 빌드가 스스로 말한다. 숫자를 눈으로 세면 다음 사람이 못 센다.
  const none = items.filter((it) => it.parts.length === 0).length;
  const one = items.filter((it) => it.parts.length === 1).length;
  console.log(`kanji.json: ${items.length}자, 이름 없는 부품 ${unnamed.size}종 (많은 순: ${[...unnamed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => `${k}${n}`).join(" ")})`);
  console.log(`「부품 없음」 ${none}자 · 부품 1개짜리 ${one}자 · 이름이 겹쳐 뺀 것 ${clashed.size}자 (${[...byNames.values()].filter((g) => g.length > 1).length}묶음)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
