import type { UserSettings } from "@/lib/db/settings";

/**
 * O03 가나 6개. 히라가나 4 + 가타카나 2, 행이 겹치지 않게.
 * `say` 는 마이크 인식 결과와 맞춰 볼 히라가나(가타카나는 히라가나로 정규화해서 비교).
 */
export const KANA_SET = [
  { glyph: "あ", say: "あ" },
  { glyph: "き", say: "き" },
  { glyph: "そ", say: "そ" },
  { glyph: "ヌ", say: "ぬ" },
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
