/**
 * 자료에서 한자를 뽑는다. 나온 순서대로, 한 번씩.
 * 한자 범위: CJK 통합 한자 + 확장 A + 호환 한자. 가나·숫자·기호는 제외.
 */
export function extractKanji(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of Array.from(text)) {
    const o = ch.codePointAt(0) ?? 0;
    const isKanji = (o >= 0x4e00 && o <= 0x9fff) || (o >= 0x3400 && o <= 0x4dbf) || (o >= 0xf900 && o <= 0xfaff);
    if (!isKanji || seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
  return out;
}

/** 이 한자가 든 단어(연속 한자 덩어리)를 자료에서 찾는다. F04 "자료 문장에서 그 한자가 든 단어 강조"용. */
export function findWordWith(text: string, kanji: string): { word: string; sentence: string } | null {
  const idx = text.indexOf(kanji);
  if (idx < 0) return null;
  const isKanji = (c: string) => {
    const o = c.codePointAt(0) ?? 0;
    return (o >= 0x4e00 && o <= 0x9fff) || (o >= 0x3400 && o <= 0x4dbf) || (o >= 0xf900 && o <= 0xfaff);
  };
  const chars = Array.from(text);
  // 문자열 인덱스 → 코드포인트 인덱스
  let cp = 0;
  for (let i = 0; i < idx; ) {
    const c = String.fromCodePoint(text.codePointAt(i) ?? 0);
    i += c.length;
    cp++;
  }
  let a = cp;
  let b = cp;
  while (a > 0 && isKanji(chars[a - 1])) a--;
  while (b + 1 < chars.length && isKanji(chars[b + 1])) b++;
  const word = chars.slice(a, b + 1).join("");
  // 문장: 앞뒤 구두점(。、\n)까지
  const stops = new Set(["。", "\n", "\r"]);
  let sa = a;
  let sb = b;
  while (sa > 0 && !stops.has(chars[sa - 1]) && chars[sa - 1] !== "、") sa--;
  while (sb + 1 < chars.length && !stops.has(chars[sb + 1]) && chars[sb + 1] !== "、") sb++;
  return { word, sentence: chars.slice(sa, sb + 1).join("") };
}

/**
 * 문장을 이어진 한자 덩어리로 자른다 (よみがな 를 다는 단위).
 * 글자 하나가 아니라 덩어리다 — 世代 는 せ + だい 로 쪼갤 수 없고 せだい 하나로 읽는다.
 * 위치는 코드포인트 기준이라 렌더링 쪽에서 [...sentence] 와 그대로 맞는다.
 */
export type KanjiRun = { text: string; start: number; end: number };

export function kanjiRuns(text: string): KanjiRun[] {
  const chars = Array.from(text);
  const isKanji = (c: string) => {
    const o = c.codePointAt(0) ?? 0;
    return (o >= 0x4e00 && o <= 0x9fff) || (o >= 0x3400 && o <= 0x4dbf) || (o >= 0xf900 && o <= 0xfaff);
  };
  const out: KanjiRun[] = [];
  let i = 0;
  while (i < chars.length) {
    if (!isKanji(chars[i])) {
      i++;
      continue;
    }
    const start = i;
    while (i < chars.length && isKanji(chars[i])) i++;
    out.push({ text: chars.slice(start, i).join(""), start, end: i });
  }
  return out;
}
