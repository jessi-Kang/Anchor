import type { UserSettings } from "@/lib/db/settings";

/**
 * O03 가나 6개. 히라가나 4 + 가타카나 2, 행이 겹치지 않게(あ·か·さ·な·は·ん).
 * `say` 는 마이크 인식 결과와 맞춰 볼 히라가나(가타카나는 히라가나로 정규화해서 비교).
 *
 * **모양이 헷갈리는 글자는 안 쓴다.** 여기서 재는 것은 "가나를 읽을 수 있나" 하나이고,
 * 못 읽은 것이 **모르는 글자여서인지 닮은 글자여서인지**를 이 화면은 구별하지 못한다.
 * 그래서 닮은 글자를 넣으면 읽을 줄 아는 사람도 떨어지고, 그 판정이 그대로 첫 카드를 막는다.
 * 자기 보고로 수준을 묻지 않기로 한 화면이 **틀린 판정으로 같은 일을 하게 된다**(`CLAUDE.md` 하지 않는 것).
 *
 * な행을 ヌ 에서 ナ 로 바꿨다(2026-09-21). ヌ 는 ス·又 와 거의 같은 모양이라 Jessi 가 첫 사용에서
 * **"글자가 깨진 줄 알았다"** 고 했다 — 모르겠다가 아니라 잘못 그려졌다고 읽은 것이다. 글꼴은
 * 멀쩡했다(경로 다섯을 다 확인했다: `AnchorParts` 의 `unicode-range` 는 BMP 밖 네 자뿐이고,
 * 배포 CSS 는 가나 범위를 덮고, 참고 화면 서브셋에도 여섯 자가 다 있고, `--font-jp` 도 걸려 있다).
 * **글꼴이 아니라 고른 글자가 문제였다.** ナ 는 나머지 다섯(あ き そ ホ ん) 어느 것과도 안 닮는다.
 */
export const KANA_SET = [
  { glyph: "あ", say: "あ" },
  { glyph: "き", say: "き" },
  { glyph: "そ", say: "そ" },
  { glyph: "ナ", say: "な" },
  { glyph: "ホ", say: "ほ" },
  { glyph: "ん", say: "ん" },
];

/** 가나 통과 기준: 6개 중 4개 이상 인식 */
export const KANA_PASS = 4;

/** "다음에 다시 확인"(recheck)은 하루 지나면 다시 묻는다. 카드마다 묻지는 않는다. */
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * 일본어 첫 카드 직전 게이트 (docs/FLOW.md 1장 4′).
 *  ask   아직 확인 안 했거나, recheck 뒤 하루가 지났다 → O03 으로
 *  pass  통과했거나, "못 읽겠어"(module: 예고 1장을 이미 봤다), recheck 한 지 하루 안 → 카드로
 * 가나를 못 읽어도 카드를 잠그지 않는다: 읽기는 F10 에서 소리로 들려준다 (FLOW 4장).
 */
export function kanaGate(s: UserSettings, now = Date.now()): "ask" | "pass" {
  const k = s.kana;
  if (!k) return "ask";
  if (k.status === "passed" || k.status === "module") return "pass";
  return now - Date.parse(k.checked_at) > RECHECK_AFTER_MS ? "ask" : "pass";
}
