/**
 * 한국어 조사: 받침 유무로 은/는, 이/가, 을/를 을 고른다.
 *
 * 화면에 보이는 글자가 한자면 받침을 셀 수 없다. 그때는 **그 한자를 읽는 한국 한자음**으로 센다
 * (`sound`). 力 을 글자로만 보면 "力를" 이 되지만 읽는 소리가 "력" 이라 "力을" 이 맞다
 * (docs/FLOW.md 4장의 예문도 "力을 아니까 助가 가장 가까워"). 소리를 모르면 받침 없는 것으로 본다.
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
