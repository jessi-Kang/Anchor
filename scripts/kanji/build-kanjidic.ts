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
  const nameable = (p: string) => named.has(p) || koSound.has(p);

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
  items.sort((a, b) => (a.freq ?? 9999) - (b.freq ?? 9999) || a.grade - b.grade);
  const unnamed = new Map<string, number>();
  for (const it of items) for (const p of it.parts) if (!nameable(p)) unnamed.set(p, (unnamed.get(p) ?? 0) + 1);
  const out = {
    _comment: "scripts/kanji/build-kanjidic.ts 가 KANJIDIC2 + CJKVI IDS 에서 만든다. 손으로 고치지 말 것. 상용한자 2,136자: 음독(히라가나)·훈독·한국 한자음·영어 뜻·부품. 한국어 앵커 단어는 kanji-ko.json, 카드 문안은 kanji-cards.json.",
    source: { kanjidic2: KANJIDIC_URL, ids: IDS_URL, built_at: new Date().toISOString().slice(0, 10) },
    items,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\},\{"kanji"/g, "},\n{\"kanji\"") + "\n");
  console.log(`kanji.json: ${items.length}자, 이름 없는 부품 ${unnamed.size}종 (많은 순: ${[...unnamed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => `${k}${n}`).join(" ")})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
