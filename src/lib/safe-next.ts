/**
 * 로그인·가나 게이트를 지나 "원래 가려던 곳"으로 돌려보낼 때 쓰는 `next` 값 검사.
 * 같은 사이트 경로만 통과시킨다 (열린 리다이렉트 방지). 네 곳에 복사돼 있던 것을 여기 하나로 모았다.
 *
 * 막는 것 셋:
 *  - `//evil.com` — 프로토콜 상대 URL.
 *  - `/\evil.com` — 브라우저 URL 파서는 특수 스킴에서 백슬래시를 `/` 로 읽는다. `//evil.com` 과 같다.
 *  - `/<탭|줄바꿈>/evil.com` — URL 파서가 탭·줄바꿈을 먼저 떼어내므로 역시 `//evil.com` 이 된다.
 *    앞 두 개만 막고 이걸 두면 구멍이 그대로 남는다 (node 에서 확인).
 *
 * 통과 조건은 하나다: `/` 로 시작하고, 그다음 글자가 `/` 도 `\` 도 아니며, 제어 문자가 없다.
 */
const SAFE_PATH = /^\/[^/\\]/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export function safeNext(next: string | null | undefined, fallback = "/today"): string {
  if (!next || CONTROL.test(next)) return fallback;
  return SAFE_PATH.test(next) ? next : fallback;
}
