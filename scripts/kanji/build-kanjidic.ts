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
  const directParts = (ch: string): string[] | null => {
    if (override[ch]) return Array.from(override[ch]);
    const seq = ids.get(ch);
    if (!seq) return null;
    const cs = Array.from(seq).filter((c) => !IDC.has(c));
    if (cs.some((c) => !isCjk(c))) return null;
    if (cs.length === 0 || (cs.length === 1 && cs[0] === ch)) return null;
    return cs;
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
    return out;
  };

  const chars = xml.split("<character>").slice(1);
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
  for (const it of items) for (const p of it.parts) if (!named.has(p)) unnamed.set(p, (unnamed.get(p) ?? 0) + 1);
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
