import { extractKanji } from "@/lib/kanji/extract";
import type { LandingWord } from "@/lib/db/kanji";
import type { CardPayload } from "@/lib/db/cards";

/**
 * 착지(Scene5)와 말하기(F10)가 낼 낱말. **이미 만난 글자로만 고른다** (docs/FLOW.md 4장).
 *
 * 정답이 나온 뒤라 그 카드의 한자는 열어 보여 주지만, 그게 다른 안 만난 한자의 읽기까지 열어도 된다는
 * 뜻은 아니다. 妥協 를 協 카드의 착지에 내면 아직 안 푼 妥 의 읽기(だ)와 한국어 앵커(타협)를 같이
 * 주게 된다 — 같은 낱말을 재만남(F12)은 가리는데 착지는 여는 꼴이라, 원칙 1 이 한 화면에서만 참이 된다.
 *
 * 두 화면이 같은 함수를 부른다. F10 은 착지 낱말의 첫 번째를 크게 띄우고 읽기까지 내므로, 거르는
 * 자리를 화면마다 두면 한쪽만 고쳐지고 더 크게 새는 쪽이 남는다.
 *
 * **고를 낱말이 하나도 안 남으면 마지막 수단은 소리다** — 그 카드의 한자 하나에 한국 한자음을 붙인다.
 * 전에는 후킹에 쓴 한국어 낱말을 댔는데, 그 자리에 **앱이 고른 낱말**이 서면 안 되는 카드가 있다
 * (`条` 에 "조건" 을 대면 아직 안 만난 `件` 의 앵커를 미리 주는 것이다 — 거르개가 막으려던 바로 그것).
 * 소리는 앱이 고른 것이 아니라 원칙 2 가 사용자의 것이라고 보장한 값이라 안 뒤집힌다
 * (design/SCREENS.md "착지에 낱말을 끌어다 쓰지 않는다").
 */
export type Landing = {
  /** 화면에 낼 낱말. 언제나 한 장 이상이다. */
  words: LandingWord[];
  /**
   * **안전한 착지 낱말이 하나라도 남았나.** Scene5 의 머리줄이 이 축으로 갈린다 — 낱말이 남으면
   * "이미 아는 단어에 協이 들어 있어" 그대로고, 하나도 없을 때만 소리 쪽으로 간다.
   * **「앵커 낱말이 있나」가 아니다**: 앵커가 없다는 건 *시작할 때* 부를 낱말이 없다는 뜻이지
   * *끝에 앉을* 낱말이 없다는 뜻이 아니고(`件` 을 만났으면 `条件` 이 뜨는 게 맞다), 거꾸로 앵커가
   * 있어도 안 만난 글자 때문에 다 걸러질 수 있다 (design/SCREENS.md "Scene5 는 낱말을 대야 한다").
   */
  landed: boolean;
};

export function landingWords(p: CardPayload, met: Set<string>): Landing {
  const known = new Set([...met, p.kanji]);
  const safe = p.landing.filter((w) => extractKanji(w.word).every((ch) => known.has(ch)));
  if (safe.length) return { words: safe, landed: true };
  return { words: [{ word: p.kanji, reading: p.reading, ko: p.sound }], landed: false };
}
