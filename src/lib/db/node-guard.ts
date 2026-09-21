/**
 * **공용 노드를 지우기 전에 무엇을 확인해야 하는가.**
 *
 * 씨앗(`scripts/seed.ts`)은 「맞춘다, 쌓지 않는다」로 돈다 — 파일에서 없어진 것은 DB 에서도
 * 없앤다. 엣지는 딸린 게 없어 그냥 지우면 되지만 **노드는 다르다**: `nodes(id)` 를 가리키는
 * FK 가 일곱이고 그중 **여섯이 `ON DELETE CASCADE`** 다. 공용 노드 하나를 지우면 **사용자 행이
 * 조용히 같이 죽는다.**
 *
 * 그중 `encounters` 는 `docs/MEASURE.md` 의 분자·분모이고 **다시 만들 수 없는 유일한 표**다.
 * `node_cards` 는 **다시 만들려면 Claude 키가 있어야 하는 값**이라, 키가 없는 날엔 못 되살린다.
 *
 * **그래서 목록과 가드를 한 곳에 둔다.** 시험은 「선언했나」를 보고 씨앗은 「막나」를 하는데,
 * 둘이 다른 곳에 적히면 **선언만 하고 안 막는 상태가 조용히 생긴다.** 여기 한 곳이면 목록에
 * 더하는 일이 곧 가드가 늘어나는 일이다 (`export-tables.test.ts` 가 세운 자와 같다 —
 * "목록을 여기 베껴 쓰지 않는다, 앱이 실제로 쓰는 값을 그대로 불러 견준다").
 */

/**
 * 이 표에 행이 있으면 그 노드는 **안 지운다.** 넷 다 칸 이름이 `node_id` 이고,
 * 그것까지 `scripts/test/node-guard.test.ts` 가 견준다 — 칸 이름이 다르면 아래 SQL 이 거짓말이 된다.
 */
export const NODE_GUARD_TABLES = ["user_node_state", "cards", "encounters", "node_cards"] as const;

/**
 * **선언된 차이.** `nodes` 를 가리키는 FK 중 가드에 안 드는 것, 그리고 각각의 이유.
 * 새 표가 생기면 시험이 「목록에도 예외에도 없다」로 빨개진다 — **스키마가 자라는 쪽에 대고는
 * 손 목록이 늘 진다**(실제로 `0006_node_cards.sql` 이 한 파일만 본 목록을 조용히 모자라게 했다).
 */
export const NODE_GUARD_EXCEPT: Record<string, string> = {
  edges: "노드가 가면 그 노드의 엣지도 간다 — 같이 지워지는 게 맞다",
  chunks:
    "SET NULL 이라 행이 안 죽는다. **「안 지워지니 안전」이 아니라 「규칙이 다르다」** 다 — " +
    "`delete-paths.ts` 의 'FK 가 있다는 것과 지워지는 것은 다르다' 와 같은 자리다",
};

/**
 * 위 목록에서 `WHERE` 절을 만든다. 노드 별칭 하나를 받아 `AND NOT EXISTS …` 를 이어 붙인다.
 * **손으로 적지 않는다** — 목록과 가드가 갈리는 순간이 이 파일이 막으려는 바로 그 상태다.
 */
export function nodeGuardSql(nodeAlias: string): string {
  return NODE_GUARD_TABLES.map(
    (t) => `AND NOT EXISTS (SELECT 1 FROM ${t} g WHERE g.node_id = ${nodeAlias}.id)`,
  ).join("\n        ");
}

/**
 * **고아가 된 공용 소리 노드를 지우는 문장.** 씨앗과 시험이 **같은 글자**를 쓰라고 여기 둔다 —
 * 시험이 사본을 시험하면 씨앗이 실제로 무엇을 지우는지는 아무도 안 잰다.
 *
 * 범위는 `lang='ko' AND kind='sound'` 로 못 박혀 있다. **여기를 넓히면 `encounters` 가 같이
 * 지워진다** — 넓히기 전에 이 파일 머리말을 읽는다.
 */
export const ORPHAN_SOUND_DELETE = `DELETE FROM nodes AS n
        WHERE n.user_id IS NULL AND n.lang = 'ko' AND n.kind = 'sound'
          AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.src = n.id OR e.dst = n.id)
          ${nodeGuardSql("n")}`;
