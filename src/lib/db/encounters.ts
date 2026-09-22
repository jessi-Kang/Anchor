import { withUser } from "@/lib/db";

/**
 * 재만남 기록 (encounters). **통과 기준 둘 중 하나가 이 표에서만 나온다** —
 * "2주 후 **자료** 재만남 인식률 70%" (`docs/MEASURE.md` 1장 · 「자료 재만남과 예문 재만남을
 * 하나의 비율로 합치지 않는다」). **예문 재만남도 이 표에 적히지만 통과선은 자료 쪽에만 건다** —
 * 예문은 우리가 고르는 것이라 쉬운 것을 고르면 비율이 오른다.
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
/**
 * `recognized` 는 셋이다. **`null` 은 "안 적음" 이 아니라 "판정할 자리가 아니었다" 다**
 * (`docs/MEASURE.md` 0′장). 아예 안 적으면 분모가 왜 작은지를 못 가른다 — 자료에 안 나와서 작은
 * 것과, 안 만난 글자가 섞인 덩어리에 갇혀서 작은 것은 손쓸 방법이 다르다.
 */
export type EncounterRow = { nodeId: string; recognized: boolean | null };

export function recordEncounters(userId: string, inputId: string, rows: EncounterRow[]) {
  if (rows.length === 0) return Promise.resolve();
  return withUser(userId, async (tx) => {
    /*
      **그 자료가 내 것인지 먼저 본다** (보안 C13). RLS 는 `user_id` 만 보는데 이 함수는 `input_id`·
      `node_id` 를 밖에서 받는다 — 남의 자료 id 로도 내 이름의 행이 만들어질 수 있고, 그러면 남의
      자료를 읽었다는 기록이 내 인식률에 섞인다. `node_id` 도 같다 — 아래에서 같이 거른다.
    */
    const { rowCount: mine } = await tx.query("SELECT 1 FROM inputs WHERE id = $1 AND user_id = $2", [inputId, userId]);
    if (!mine) throw new Error("그런 자료가 없다");
    /*
      **`node_id` 도 같은 확인이 필요하다.** 외래키는 "그 노드가 있는가" 만 보는데, `nodes.user_id`
      는 NULL(공용 참조)일 수도 있고 **남의 개인 노드**일 수도 있다 (0001 의 `nodes_user_key_uq`).
      남의 노드 id 로 내 이름의 줄이 생기면 내 인식률의 분모가 내가 만난 적 없는 글자로 채워진다.
      녹음에서 정확히 같은 자리가 걸렸고(보안 C13) 거기서는 DB 가 돌려준 id 만 쓰게 고쳤다.
      한 번에 걸러 INSERT 를 배치마다 한 질의 더 늘리지 않는다.
    */
    const { rows: owned } = await tx.query<{ id: string }>(
      "SELECT id FROM nodes WHERE id = ANY($1::uuid[]) AND (user_id IS NULL OR user_id = $2)",
      [rows.map((r) => r.nodeId), userId],
    );
    const allowed = new Set(owned.map((r) => r.id));
    for (const r of rows) {
      // 내 것도 공용도 아닌 노드는 적지 않는다. 화면이 보낼 수 있는 값이 아니라, 여기까지 왔으면
      // 어딘가 틀린 것이다 — 줄을 버리되 나머지 판정은 살린다. 읽기는 이미 끝났다.
      if (!allowed.has(r.nodeId)) {
        console.error("[encounters] 내 것도 공용도 아닌 노드라 건너뛴다", { nodeId: r.nodeId });
        continue;
      }
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
