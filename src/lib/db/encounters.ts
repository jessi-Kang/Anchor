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
 *
 * **덮어쓰지 않는다.** 같은 자료를 다시 읽으면 줄을 새로 쌓고, 첫 판정은 세는 쪽이 `created_at`
 * 으로 고른다 (MEASURE 0′). 고쳐 쓰면 첫 판정이 사라지는데 **그 오차는 한쪽으로만 난다** —
 * 다시 읽으면 알아볼 확률이 언제나 올라가니 인식률이 위로만 부푼다.
 */
export type EncounterRow = { nodeId: string; recognized: boolean };

export function recordEncounters(userId: string, inputId: string, rows: EncounterRow[]) {
  if (rows.length === 0) return Promise.resolve();
  return withUser(userId, async (tx) => {
    /*
      **그 자료가 내 것인지 먼저 본다** (보안 C13). RLS 는 `user_id` 만 보는데 이 함수는 `input_id`·
      `node_id` 를 밖에서 받는다 — 남의 자료 id 로도 내 이름의 행이 만들어질 수 있고, 그러면 남의
      자료를 읽었다는 기록이 내 인식률에 섞인다. `node_id` 는 공용 참조 노드라 주인이 없지만,
      아래 INSERT 는 외래키가 있는 값만 받으므로 없는 노드로는 행이 안 생긴다.
    */
    const { rowCount: mine } = await tx.query("SELECT 1 FROM inputs WHERE id = $1 AND user_id = $2", [inputId, userId]);
    if (!mine) throw new Error("그런 자료가 없다");
    for (const r of rows) {
      // 읽을 때마다 한 줄씩 쌓는다. "두 번째엔 안 열었다" 자체가 값이라 덮어쓰지 않는다.
      await tx.query("INSERT INTO encounters (user_id, node_id, input_id, recognized) VALUES ($1, $2, $3, $4)", [
        userId,
        r.nodeId,
        inputId,
        r.recognized,
      ]);
    }
  });
}
