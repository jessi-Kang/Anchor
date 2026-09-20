import { withUser } from "@/lib/db";
import { judgedKanji } from "@/lib/db/kanji";
import { landingWords } from "@/lib/cards/landing";
import type { CardPayload } from "@/lib/db/cards";

/**
 * 하루 끝(F15)이 세는 것. **"오늘" 은 한국 시각의 하루다** — 사용자가 사는 날짜로 세야
 * "오늘 켜진 것" 이 맞는 말이 된다. UTC 로 세면 한국 시각 아침 9시 전이 어제로 잡힌다.
 *
 * 세는 것은 **일어난 일**이지 화면 상태가 아니다. 다시 열어도 같은 수가 나온다.
 */

const KST = "Asia/Seoul";

/** 오늘 카드를 끝내 켜진 한자 (나온 순서). */
export async function litToday(userId: string): Promise<string[]> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ key: string }>(
      `SELECT n.key FROM cards c JOIN nodes n ON n.id = c.node_id
        WHERE c.user_id = $1 AND c.landed_at IS NOT NULL
          AND (c.landed_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
        ORDER BY c.landed_at`,
      [userId, KST],
    );
    return rows.map((r) => r.key);
  });
}

/**
 * 오늘 소리 내어 말해 본 것 (나온 순서). 녹음이 한 번이라도 붙었으면 말해 본 것이다.
 *
 * **경로도 언어도 가리지 않는다** (docs/FLOW.md 1′장 F15 행). F10 에서 소리 낸 한자 낱말(協力)과
 * F14 의 영어 덩어리(push this to)가 같은 줄에 선다. 세는 기준은 무엇으로 만들어졌나가 아니라
 * **내가 소리 내어 말했나**다 — 덩어리만 세면 원칙 0("모든 학습 항목은 말하기로 끝난다")이 한
 * 언어에서만 참이 되고, 스페인어를 켜는 날 같은 물음이 또 온다.
 *
 * 카드 쪽 이름은 F10 이 실제로 띄운 낱말이어야 한다. 그래서 씨앗의 `landing[0]` 을 그냥 쓰지 않고
 * `landingWords` 를 거친다 — 거르지 않으면 아직 안 만난 한자가 든 낱말이 하루 끝에 떠서, 카드에서
 * 막은 유출이 여기로 새어 나온다 (lib/cards/landing.ts).
 */
export async function spokenToday(userId: string): Promise<string[]> {
  const rows = await withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ chunk_text: string | null; card_payload: CardPayload | null }>(
      `SELECT t.chunk_text, t.card_payload FROM (
         SELECT DISTINCT ON (coalesce(r.chunk_id, r.card_id))
                coalesce(ch.meta->>'chunk', ch.text) AS chunk_text,
                c.payload AS card_payload,
                r.created_at
           FROM recordings r
           LEFT JOIN chunks ch ON ch.id = r.chunk_id
           LEFT JOIN cards c ON c.id = r.card_id
          WHERE r.user_id = $1
            AND (r.created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
          ORDER BY coalesce(r.chunk_id, r.card_id), r.created_at
       ) t ORDER BY t.created_at`,
      [userId, KST],
    );
    return rows;
  });

  // 카드 녹음이 하나도 없으면 판정된 한자를 읽을 이유가 없다.
  const met = rows.some((r) => r.card_payload) ? await judgedKanji(userId) : new Set<string>();
  return rows.map((r) => r.chunk_text ?? landingWords(r.card_payload as CardPayload, met)[0].word);
}
