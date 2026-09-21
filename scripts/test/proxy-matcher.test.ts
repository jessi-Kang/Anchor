/**
 * 프록시 `matcher` 가 **어느 경로를 태우는지** 붙든다.
 *   pnpm test:db
 *
 * 이 시험의 본체는 목록이 아니라 **누가 컴파일하나**다. 손으로 쓴 정규식을 손으로 쓴 정규식과
 * 견주면 둘이 같은 말을 해서 아무것도 못 잡는다. 그래서 `src/proxy.ts` 의 글자를 그대로 읽어
 * **Next 자신의** `getMiddlewareMatchers` 에 넣고, 역시 Next 자신의 `getMiddlewareRouteMatcher`
 * 로 맞춰 본다 — 배포가 도는 것과 같은 길이다(빌드 산출물
 * `.next/server/functions-config-manifest.json` 의 `regexp` 와 같은 값이 나온다).
 *
 * **`matcher` 를 상수로 빼서 `import` 할 수는 없다.** Next 이 이 자리를 정적으로 읽어서
 * 변수 참조면 빌드가 거부한다. `src/proxy.ts` 를 통째로 `import` 하는 것도 안 된다 —
 * 모듈을 읽는 순간 `auth` 가 환경변수로 만들어진다. 그래서 파일을 글자로 읽는다.
 *
 * 붙드는 것: **부정 전방탐색이 경로가 아니라 접두사를 빼던 것.** `(?!auth|health|cron)` 은
 * `/api/cron-admin` 을 크론으로 보고 프록시에서 빼 버린다. DB 를 안 쓴다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { ProxyMatcher } from "next/dist/build/analysis/get-page-static-info";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";

/*
  `getMiddlewareMatchers` 는 런타임에는 있는데 Next 의 `.d.ts` 가 안 내놓는다(내부 함수다).
  그래서 `require` 로 가져오고 받는 쪽 모양만 우리가 적는다 — 다른 이름으로 바꾸거나 없애면
  아래 첫 시험이 빈 목록으로 먼저 터진다. 타입을 억지로 넓히지 않고 여기 한 줄로 가둬 둔다.
*/
const getMiddlewareMatchers = createRequire(import.meta.url)("next/dist/build/analysis/get-page-static-info")
  .getMiddlewareMatchers as (matcher: string[], nextConfig: Record<string, unknown>) => ProxyMatcher[];

/** `src/proxy.ts` 의 `config.matcher` 를 글자 그대로 읽는다. */
function readMatcher(): string[] {
  const src = readFileSync(path.resolve(process.cwd(), "src/proxy.ts"), "utf8");
  const open = src.indexOf("matcher: [");
  const close = src.indexOf("]", open);
  assert.ok(open > 0 && close > open, "src/proxy.ts 에서 config.matcher 배열을 못 찾았다");
  return [...src.slice(open, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const MATCHER = readMatcher();

/*
  **모양이 바뀌면 조용히 통과하지 않게** 먼저 붙든다. 글자로 읽는 방식이라, 목록을 옮기거나
  따옴표를 바꾸면 빈 배열이 나오고 아래 시험이 전부 "안 탄다" 로 통과해 버린다. 틀린 통과는
  틀린 경보보다 나쁘다.
*/
test("목록을 읽었고 API 줄이 하나 있다 — 빈 배열로 조용히 통과하지 않게", () => {
  assert.ok(MATCHER.length >= 8, `matcher 를 ${MATCHER.length}줄 읽었다 — 파일 모양이 바뀐 것 같다`);
  assert.equal(MATCHER.filter((m) => m.startsWith("/api/")).length, 1);
});

const match = getMiddlewareRouteMatcher(getMiddlewareMatchers(MATCHER, {}));
const on = (p: string) => match(p, {} as never, {});

/*
  **프록시를 타야 하는 것.** 뺀 세 경로와 이름만 닮은 것들이 여기 있다 — `/api/cron-admin`,
  `/api/authorize-test`, `/api/healthz-internal`, `/api/auth-nope`. 전에는 넷 다 빠졌다.
*/
test("안 뺀 API 는 전부 프록시를 탄다 — 이름만 닮은 것 넷 포함", () => {
  for (const p of [
    "/api/definitely-not-a-route",
    "/api/authorize-test",
    "/api/cron-admin",
    "/api/healthz-internal",
    "/api/auth-nope",
    "/api/export",
    "/api/tts",
    "/api/account/delete",
    "/api/recordings",
    "/api/test-login",
  ]) {
    assert.ok(on(p), `${p} 는 프록시를 타야 한다`);
  }
});

/*
  **뺀 셋.** 인증 API 는 로그인 자체를 하는 자리라 세션을 요구할 수 없고, 헬스체크와 크론은
  사람 세션이 없다(크론은 `Bearer CRON_SECRET` 으로 스스로 막는다).
*/
test("뺀 세 경로와 그 아래는 프록시를 안 탄다", () => {
  for (const p of ["/api/auth/callback", "/api/health", "/api/health/", "/api/cron/backup", "/api/cron/voice"]) {
    assert.ok(!on(p), `${p} 는 프록시를 안 타야 한다`);
  }
});

/*
  **화면 쪽도 같이 본다.** API 줄만 고치다가 위 일곱 줄을 건드리면 로그인 없이 홈이 열린다 —
  그건 새는 쪽이고, 여기서 소리가 나야 한다.
*/
test("보호하는 화면은 그대로 프록시를 탄다", () => {
  for (const p of ["/today", "/inputs/abc", "/cards/abc/1", "/graph", "/talk/abc", "/settings/delete", "/onboarding/kana"]) {
    assert.ok(on(p), `${p} 는 프록시를 타야 한다`);
  }
});
