/**
 * 한 글자의 한국 한자음을 **여럿 중 하나 고르는** 규칙.
 *
 * KANJIDIC2 는 한 글자에 한국 한자음을 여러 개 싣는다(`金` = 김·금, `不` = 부·불). 예전 빌드는
 * 첫 값을 집었다. 그래서 `金` 이 「김」이 됐다 — 1학년·빈도 53 이고, F03 과 Scene1 이 앵커 낱말이
 * 없는 글자에 이 소리를 그대로 세운다. **앱의 전제가 그 줄에서 끊긴다**: きん 은 금에서 오지
 * 김에서 안 온다. 첫 값은 사전이 정렬한 결과일 뿐 한국어가 그 글자를 쓰는 자리가 아니다.
 *
 * 그래서 고르는 근거를 **앵커 낱말**(`db/seed/kanji-ko.json`)에 둔다. 앵커는 "한국어 화자가 이미
 * 소리로 아는 낱말"이라 그 안의 음절이 곧 한국어가 그 글자에 쓰는 소리다(원칙 2). 앵커가 없으면
 * 바꿀 근거가 없으므로 첫 값을 그대로 둔다 — 여기서 손으로 고르기 시작하면 기준 없이 답부터 고르게 된다.
 *
 * 값은 **언제나 KANJIDIC2 목록 안에서만** 고른다. 이 파일은 소리를 만들지 않는다.
 */

/** 두음법칙이 ㅇ 으로 보내는 중성(ㅑㅒㅕㅖㅛㅠㅣ) */
const I_VOWEL = new Set([2, 3, 6, 7, 12, 17, 20]);

/**
 * 낱말 첫머리 꼴(두음법칙). 량 → 양, 래 → 내, 녀 → 여. 그 밖에는 그대로.
 *
 * 사전은 `両` 을 「량」으로 싣는데 한국어 낱말은 「양」으로 부른다. 접지 않으면 그런 앵커가 제 글자의
 * 소리를 못 찾아 멀쩡한 값이 틀린 것으로 잡힌다(처음 세었을 때 서른 자 중 열넷이 이 자리였다).
 *
 * **지금 표에는 접어야 닿는 앵커가 없다 — 641개 중 0개다.** 앵커 규칙 3(`anchor-shape.test.ts`)이
 * 바뀐 소리를 아예 안 받게 되면서 `両` 도 「차량」으로 옮겨 갔고, 접든 안 접든 고르는 값이 같다(세어 봤다).
 * **그래도 지운 목록과 달리 이 함수는 둔다.** 목록은 「지금 어긋난 줄」이라 비면 거짓말이 되지만,
 * 이것은 한국어가 낱말 첫머리를 어떻게 부르는지에 대한 규칙이라 표가 쓰든 안 쓰든 참이다.
 * 규칙 3 이 느슨해지는 날 다시 일하게 된다.
 */
export function headSound(syllable: string): string {
  const o = (syllable.codePointAt(0) ?? 0) - 0xac00;
  if (o < 0 || o > 11171) return syllable;
  const cho = Math.floor(o / 588);
  const jung = Math.floor((o % 588) / 28);
  const jong = o % 28;
  let next = cho;
  if (cho === 5) next = I_VOWEL.has(jung) ? 11 : 2; // ㄹ → ㅇ / ㄴ
  else if (cho === 2 && I_VOWEL.has(jung)) next = 11; // ㄴ → ㅇ
  return next === cho ? syllable : String.fromCodePoint(0xac00 + next * 588 + jung * 28 + jong);
}

/**
 * 앵커 낱말 안에서 이 글자의 소리로 쓰인 값들. 없으면 빈 배열.
 *
 * **두음법칙은 낱말 첫머리에서만 편다.** 전부 접으면 `肉`(육·유)이 「육류」의 「류」에도 걸려
 * 두 값이 잡힌다 — 둘째 음절은 접히지 않으니 「류」는 「유」가 아니다.
 */
export function anchorHits(list: readonly string[], anchor: string): string[] {
  const hits = new Set<string>();
  Array.from(anchor).forEach((syllable, i) => {
    const hit = list.find((k) => k === syllable || (i === 0 && headSound(k) === syllable));
    if (hit) hits.add(hit);
  });
  return [...hits];
}

/**
 * 고른 값 하나. 목록이 비면 `null`.
 *
 * 앵커가 **딱 하나**를 가리킬 때만 앵커가 정한다. 둘이 걸리면(`食`/식사 — 식도 사도 이 글자
 * 소리다) 앵커가 고른 게 아니므로 첫 값으로 떨어진다. 0개일 때도 같다 — 그 자리는 **앵커가
 * 틀렸다는 신호**지 값을 지어낼 자리가 아니라, 빌드는 조용히 첫 값을 두고 테스트가 빨개진다.
 */
export function pickKoSound(list: readonly string[], anchor?: string | null): string | null {
  if (list.length === 0) return null;
  if (anchor) {
    const hits = anchorHits(list, anchor);
    if (hits.length === 1) return hits[0];
  }
  return list[0];
}
