/**
 * 배관 확인용 합성 데이터를 가르는 경계. **표시 열이 아니라 계정이다.**
 *
 * `pnpm measure:fixture` 는 이 접두사로 시작하는 계정만 만들고 지우고, `pnpm measure` 는 인자로
 * 받은 계정이 이걸로 시작하면 출력 머리말에 합성이라고 말한다. 두 스크립트가 같은 문자열을 봐야
 * 해서 한 곳에 둔다 — 한쪽만 고치면 시드가 만든 계정을 세는 쪽이 실데이터로 읽는다.
 *
 * 표식 열(`meta.synthetic`)을 안 두는 이유: 거르는 일은 언제나 계정 인자가 한다. 열이 있으면
 * 다음 사람이 `WHERE meta->>'synthetic' IS NULL` 로 거르기 시작하고, 그게 계정 인자를 대신하다가
 * 언젠가 빠진다. 거르지 않는 열은 언젠가 거르는 데 쓰인다.
 */
export const FIXTURE_PREFIX = "fixture-";

/** 이 계정의 행은 사람이 만든 것이 아니다. */
export const isFixtureUser = (userId: string) => userId.startsWith(FIXTURE_PREFIX);
