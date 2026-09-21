import { withUser } from "@/lib/db";

/**
 * 재만남 기록 (encounters). **통과 기준 둘 중 하나가 이 표에서만 나온다** —
 * "2주 후 재만남 인식률 70%" (`docs/MEASURE.md` 1장).
 *
 * 무엇을 적는가: **재만남 그 순간의 행동 하나**다. 읽기를 가린 새 자료에서 그 덩어리의 읽기를
 * 열지 않고 지나갔으면 `recognized = true`, 열었으면 `false`. 표의 원래 주석("하이라이트를 클릭
 * 없이 지나갔으면 true")이 정확히 그 뜻이다.
 *
 * **뽑기의 알아/몰라로 적지 않는다.** 그건 2주 전에 우리가 `user_node_state` 에 써 넣은 값을
 * 되읽는 것이라 비율이 앱이 무슨 일을 했든 100% 에 가깝게 나오고, 탭이 있어야 줄이 생기니
 * 자기 보고다. 숫자가 없는 것보다 나쁜 숫자가 된다 (MEASURE 0장).
 *
 * **자격은 여기서 걸지 않는다.** "카드 착지 +3일", "글자마다 첫 재만남 한 번" 같은 것은 세는
 * 쪽(`pnpm measure`)이 판단한다. 쓸 때 걸러 버리면 나중에 3일을 5일로 바꿀 때 다시 못 센다.
 * 여기는 **일어난 일을 그대로** 적는 자리다.
 */
export type EncounterRow = { nodeId: string; recognized: boolean };

export function recordEncounters(userId: string, inputId: string, rows: EncounterRow[]) {
  if (rows.length === 0) return Promise.resolve();
  return withUser(userId, async (tx) => {
    for (const r of rows) {
      // 자료 하나에 한 글자당 한 줄. 같은 자료를 다시 읽으면 그 줄의 값을 고친다 — 읽은 횟수가
      // 아니라 **그 자료에서 그 글자를 어떻게 만났는가**를 세는 표다. 처음 만난 시각은 그대로 둔다.
      const { rowCount } = await tx.query(
        "UPDATE encounters SET recognized = $4 WHERE user_id = $1 AND node_id = $2 AND input_id = $3",
        [userId, r.nodeId, inputId, r.recognized],
      );
      if (!rowCount) {
        await tx.query("INSERT INTO encounters (user_id, node_id, input_id, recognized) VALUES ($1, $2, $3, $4)", [
          userId,
          r.nodeId,
          inputId,
          r.recognized,
        ]);
      }
    }
  });
}
