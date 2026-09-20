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
 * 고를 낱말이 하나도 안 남으면 그 카드의 앵커 단어를 쓴다 — 후킹에 쓴 한국어 낱말(協 카드면 "협력")은
 * 사용자가 이미 아는 말임을 원칙 2 가 보장한다.
 */
export function landingWords(p: CardPayload, met: Set<string>): LandingWord[] {
  const known = new Set([...met, p.kanji]);
  const safe = p.landing.filter((w) => extractKanji(w.word).every((ch) => known.has(ch)));
  return safe.length ? safe : [{ word: p.kanji, reading: p.reading, ko: p.hook.word }];
}
