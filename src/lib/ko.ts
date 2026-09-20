/**
 * 한국어 조사. **고르는 규칙은 이 파일의 `RULES` 표 하나다.**
 *
 * 화면에 보이는 글자가 한자면 받침을 셀 수 없다. 그때는 **그 한자를 읽는 한국 한자음**으로 센다
 * (`sound`). 十 을 글자로만 보면 "十를" 이 되지만 읽는 소리가 "십" 이라 "十을" 이 맞다.
 * 소리를 모르면 받침 없는 것으로 본다.
 *
 * 왜 한 표인가 (docs/FLOW.md 4장): 자리마다 따로 고르면 한 곳을 고쳐도 다른 곳에서 같은 것이
 * 또 난다 — 홈 · F11 본문 · 대체 텍스트 · Scene3 에서 **네 번** 났다. 한자 자리는 `withParticle`,
 * 순한국어 자리는 아래 이름 붙은 함수들이 부르지만, 둘 다 같은 표를 본다.
 */

const NONE = 0;
/** 종성 ㄹ. 로/으로가 이것 하나만 따로 본다. */
const RIEUL = 8;

/**
 * 끝 글자의 종성 번호. 0 이면 받침 없음, 8 이면 ㄹ. 한글이 아니면 null (= 받침 없는 것으로 본다).
 * 조사마다 보는 것이 달라서 참/거짓이 아니라 번호를 돌려준다 — 로/으로는 "받침 유무"로 안 갈린다.
 */
function jongseong(word: string): number | null {
  const ch = word[word.length - 1];
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  return (code - 0xac00) % 28;
}

/**
 * 조사 하나를 고르는 규칙. 받는 것은 종성 번호다.
 *  - 은는·이가·을를: 받침이 있으면 앞말.
 *  - 와과: 방향이 반대다 — 받침이 있으면 "과".
 *  - 로으로: **받침이 없거나 ㄹ 이면 "로"**. "서울로", "회의록으로", "아침 기사로".
 *    다른 넷과 규칙이 달라서 받침 유무만 보면 틀린다.
 */
const RULES = {
  은는: (j: number) => (j === NONE ? "는" : "은"),
  이가: (j: number) => (j === NONE ? "가" : "이"),
  을를: (j: number) => (j === NONE ? "를" : "을"),
  와과: (j: number) => (j === NONE ? "와" : "과"),
  로으로: (j: number) => (j === NONE || j === RIEUL ? "로" : "으로"),
} as const;

export type ParticleKind = keyof typeof RULES;

function pick(kind: ParticleKind, word: string): string {
  return RULES[kind](jongseong(word) ?? NONE);
}

// ── 순한국어 자리 ────────────────────────────────────────────────────────────
// 한자가 섞이지 않는 말에 쓴다. 한자가 섞이면 소리를 같이 넘겨야 하므로 `withParticle` 쪽이다.

export function eunNeun(word: string, sound?: string | null) {
  return pick("은는", sound || word);
}
export function iGa(word: string, sound?: string | null) {
  return pick("이가", sound || word);
}
export function eulReul(word: string, sound?: string | null) {
  return pick("을를", sound || word);
}
export function waGwa(word: string, sound?: string | null) {
  return pick("와과", sound || word);
}
export function ro(word: string, sound?: string | null) {
  return pick("로으로", sound || word);
}

/** 말 여럿을 "A와 B과 C" 로 잇는다. 이음말도 앞말의 받침을 따른다. */
export function joinWaGwa(words: string[]): string {
  return words.reduce((acc, w, i) => (i === 0 ? w : `${acc}${waGwa(acc)} ${w}`), "");
}

// ── 한자가 섞인 자리 ──────────────────────────────────────────────────────────

/** 한자 하나와 그 한국 한자음. 조사를 붙이려면 둘이 같이 다녀야 한다. */
export type Spoken = { text: string; sound: string | null };

/**
 * 한자(또는 한자가 섞인 말) 뒤에 조사를 붙이는 **유일한** 자리.
 * 조사는 보이는 글자가 아니라 읽는 소리(`sound`)가 정한다. 소리가 없으면 글자로 떨어진다.
 *
 * 한국어 단어를 같이 보여 주는 자리(예: "助(조력)가")는 마지막에 읽는 말이 그 단어이므로
 * `{ text: "助(조력)", sound: "조력" }` 처럼 **실제로 읽히는 끝말**을 sound 에 넣는다.
 */
export function withParticle(w: Spoken, kind: ParticleKind): string {
  return `${w.text}${pick(kind, w.sound || w.text)}`;
}
