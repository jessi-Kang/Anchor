/**
 * 한국어 조사: 받침 유무로 은/는, 이/가, 을/를 을 고른다.
 *
 * 화면에 보이는 글자가 한자면 받침을 셀 수 없다. 그때는 **그 한자를 읽는 한국 한자음**으로 센다
 * (`sound`). 十 을 글자로만 보면 "十를" 이 되지만 읽는 소리가 "십" 이라 "十을" 이 맞다.
 * 소리를 모르면 받침 없는 것으로 본다.
 *
 * **한자 뒤 조사를 고르는 자리는 `withParticle` 하나다** (docs/FLOW.md 4장). 자리마다 따로 고르면
 * 한 곳을 고쳐도 다른 곳에서 같은 것이 또 난다 — 실제로 두 번 났다. 아래 세 함수는 순한국어 전용이고,
 * 한자가 섞인 자리에서는 부르지 않는다.
 */
function hasBatchim(word: string): boolean {
  const ch = word[word.length - 1];
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

export function eunNeun(word: string, sound?: string | null) {
  return hasBatchim(sound || word) ? "은" : "는";
}
export function iGa(word: string, sound?: string | null) {
  return hasBatchim(sound || word) ? "이" : "가";
}
export function eulReul(word: string, sound?: string | null) {
  return hasBatchim(sound || word) ? "을" : "를";
}
/** 와/과 는 방향이 반대다 — 받침이 있으면 "과", 없으면 "와". */
export function waGwa(word: string, sound?: string | null) {
  return hasBatchim(sound || word) ? "과" : "와";
}

/** 말 여럿을 "A와 B과 C" 로 잇는다. 이음말도 앞말의 받침을 따른다. */
export function joinWaGwa(words: string[]): string {
  return words.reduce((acc, w, i) => (i === 0 ? w : `${acc}${waGwa(acc)} ${w}`), "");
}

/** 한자 하나와 그 한국 한자음. 조사를 붙이려면 둘이 같이 다녀야 한다. */
export type Spoken = { text: string; sound: string | null };

const PARTICLES = { 은는: ["은", "는"], 이가: ["이", "가"], 을를: ["을", "를"], 와과: ["과", "와"] } as const;

/**
 * 한자(또는 한자가 섞인 말) 뒤에 조사를 붙이는 **유일한** 자리.
 * 조사는 보이는 글자가 아니라 읽는 소리(`sound`)가 정한다. 소리가 없으면 글자로 떨어진다.
 *
 * 한국어 단어를 같이 보여 주는 자리(예: "助(조력)가")는 마지막에 읽는 말이 그 단어이므로
 * `{ text: "助(조력)", sound: "조력" }` 처럼 **실제로 읽히는 끝말**을 sound 에 넣는다.
 */
export function withParticle(w: Spoken, kind: keyof typeof PARTICLES): string {
  const [withB, without] = PARTICLES[kind];
  return `${w.text}${hasBatchim(w.sound || w.text) ? withB : without}`;
}
