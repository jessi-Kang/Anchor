/** 한국어 조사: 받침 유무로 은/는, 이/가, 을/를 을 고른다. 한자·라틴 글자는 받침 없는 것으로 본다. */
function hasBatchim(word: string): boolean {
  const ch = word[word.length - 1];
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

export function eunNeun(word: string) {
  return hasBatchim(word) ? "은" : "는";
}
export function iGa(word: string) {
  return hasBatchim(word) ? "이" : "가";
}
export function eulReul(word: string) {
  return hasBatchim(word) ? "을" : "를";
}
