/**
 * 내보내기가 도는 표 목록. **손으로 적은 목록이라 스키마에서 샐 수 있다.**
 *
 * `user_id` 를 가진 표를 새로 만들고 여기 안 넣으면 `/api/export` 가 그 표를 **조용히 빠뜨린다.**
 * 그런데 파일은 여전히 `format: "anchor-export"` 라고 말하고, 받는 사람은 그게 전부인 줄 안다.
 * `CLAUDE.md` 의 "전체 내보내기(JSON) 언제든" 이 그 자리에서 거짓이 되는데 **티가 안 난다.**
 *
 * 그래서 목록을 코드에 두고 **`pnpm test:db` 가 스키마와 견준다**
 * (`scripts/test/export-tables.test.ts`). 차이가 있으면 **아래에 선언된 차이여야 한다.**
 * 조용한 차이는 없다.
 */
export const USER_TABLES = [
  "users",
  "inputs",
  "nodes",
  "edges",
  "user_node_state",
  "cards",
  "chunks",
  "recordings",
  "encounters",
] as const;

/**
 * **선언된 차이.** `user_id` 칼럼의 유무와 이 목록이 어긋나는 자리는 여기뿐이고, 각각 이유가 있다.
 *
 * 전에 이 규칙이 "개인 소유(user_id 있음)만 포함한다" 한 줄로 적혀 있었는데 **목록과 안 맞았다** —
 * `users` 는 `user_id` 가 없고(키가 `id` 다), `account_deletions` 는 `user_id` 가 있는데 안 들어간다.
 * 목록이 맞고 적힌 규칙이 틀린 쪽이었다. 둘이 같은 말을 하게 고친다.
 */
export const EXPORT_EXCEPTIONS: Record<string, string> = {
  // 넣지만 `user_id` 칼럼은 없다 — 이 표에서는 `id` 가 곧 그 사람이다.
  users: "키가 user_id 가 아니라 id 다. 내 프로필·설정이라 당연히 들어간다",
  // `user_id` 가 있지만 안 넣는다.
  account_deletions:
    "삭제 원장. 학습 기록이 아니라 백업 사본을 지웠는지 확인하는 장부이고, " +
    "앱 역할은 INSERT 권한만 있어(0001 의 GRANT) 넣으면 질의가 터진다",
};
