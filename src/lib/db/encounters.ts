import { withUser } from "@/lib/db";

/**
 * 재만남 기록 (encounters). **통과 기준 둘 중 하나가 이 표에서만 나온다** —
 * "2주 후 재만남 인식률 70%" (README·`docs/SPEC.md` 9장).
 *
 * 왜 여기서 적는가: 인식률의 정의가 "**새 자료**에 나왔을 때 그냥 읽히는가" 이고, F03 뽑기에서
 * 한자마다 누르는 「알아 / 몰라」가 바로 그 사건이다. 새 자료에서의 판정이라 다른 곳에서 만들 수 없다.
 *
 * 재만남(F12)에서는 적지 않는다 — 같은 자료를 다시 읽는 자리라 새 자료가 아니고, 넣으면 분모가
 * 흐려진다. "언제 처음 만났나" 는 `cards.landed_at` 이 이미 갖고 있으므로, 이 한 줄이면 분자와
 * 분모가 다 선다.
 *
 * **지나간 날은 나중에 채울 수 없다.** `user_node_state` 는 덮어써서 이력이 없다. 그래서 화면에
 * 아무것도 안 바뀌는 이 한 줄이 급했다.
 *
 * 자료 하나에 한 한자당 한 줄이다. 알아 → 몰라로 고쳐 누르면 그 줄의 값을 고친다. 누른 횟수가
 * 아니라 **그 자료에서 그 글자를 어떻게 만났는가**를 세는 표이기 때문이다. 처음 만난 시각
 * (`created_at`)은 고치지 않는다.
 */
export function recordEncounter(userId: string, nodeId: string, inputId: string, recognized: boolean) {
  return withUser(userId, async (tx) => {
    const { rowCount } = await tx.query(
      "UPDATE encounters SET recognized = $4 WHERE user_id = $1 AND node_id = $2 AND input_id = $3",
      [userId, nodeId, inputId, recognized],
    );
    if (!rowCount) {
      await tx.query("INSERT INTO encounters (user_id, node_id, input_id, recognized) VALUES ($1, $2, $3, $4)", [
        userId,
        nodeId,
        inputId,
        recognized,
      ]);
    }
  });
}
