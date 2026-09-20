/**
 * 로컬 전용 시험 로그인. QA 가 Google 계정 없이 첫 방문 경로를 실제 계정으로 끝까지 돌기 위한 것.
 *
 * 이 모듈은 프로덕션 번들에 들어가지 않는다. 부르는 쪽(`currentUser`·proxy)이 전부
 * `process.env.NODE_ENV !== "production"` 안에서 동적 import 하고, 프로덕션 빌드에서는 그 조건이
 * 빌드 시점에 false 로 접혀 블록째 사라진다. 라우트(`/api/test-login`)는 파일 이름이 `route.dev.ts`
 * 라서 `next.config.ts` 가 `dev.ts` 를 pageExtensions 에 넣을 때만 라우트가 된다. 조건부 404 가 아니라
 * 라우트 자체가 없는 것이다.
 *
 * 켜지는 조건 (하나라도 빠지면 문이 없다):
 *  - NODE_ENV 가 production 이 아니다
 *  - ANCHOR_TEST_LOGIN=1
 *  - VERCEL 이 아니다
 *  - ANCHOR_TEST_USER_ID 에 시험 계정 id 가 있다
 *
 * 고정 비밀번호도, 기본값도 없다. 사용자 id 는 언제나 환경 변수에서 오고, 쿠키는 그 id 를
 * NEON_AUTH_COOKIE_SECRET 으로 서명한 값이라 손으로 지어낼 수 없다. 쿠키에 적힌 id 가
 * 환경 변수와 다르면 거부하므로, 쿠키로 다른 계정을 고를 수도 없다.
 */
import type { SessionUser } from "@/lib/auth/server";

export const TEST_COOKIE = "anchor_test_session";

/** 쿠키 수명. QA 한 라운드보다 길고, 잊고 켜 둔 채로 며칠 가지는 않을 만큼. */
const MAX_AGE_SECONDS = 12 * 60 * 60;

/** 시험 계정 id. 환경 변수에만 있고 기본값이 없다. */
function testUserId(): string | null {
  const id = process.env.ANCHOR_TEST_USER_ID;
  return id && id.trim() ? id.trim() : null;
}

export function testLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ANCHOR_TEST_LOGIN === "1" &&
    process.env.VERCEL !== "1" &&
    testUserId() !== null
  );
}

function secret(): string {
  const s = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!s || s.length < 32) throw new Error("시험 로그인: NEON_AUTH_COOKIE_SECRET (32자 이상) 이 필요하다");
  return s;
}

function b64url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Web Crypto 로 서명한다. 노드 런타임과 미들웨어(edge) 양쪽에서 같은 코드가 돈다. */
async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

/** 길이가 같을 때 값이 같은지를 시간차 없이 본다. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueCookieValue(): Promise<string> {
  const id = testUserId();
  if (!id) throw new Error("시험 로그인: ANCHOR_TEST_USER_ID 가 없다");
  const payload = `${id}.${Date.now()}`;
  return `${payload}.${await sign(payload)}`;
}

/** 쿠키 값을 검증해 시험 계정을 돌려준다. 하나라도 어긋나면 null. */
export async function verifyCookieValue(value: string | undefined): Promise<SessionUser | null> {
  if (!testLoginEnabled() || !value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [id, issuedAt, signature] = parts;

  // 쿠키가 계정을 고르지 못하게: id 는 언제나 환경 변수의 것과 같아야 한다.
  if (id !== testUserId()) return null;

  const ts = Number(issuedAt);
  if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_SECONDS * 1000) return null;

  if (!timingSafeEqual(await sign(`${id}.${issuedAt}`), signature)) return null;

  return { id, email: `${id}@anchor.test`, name: null };
}

/** 서버 컴포넌트·서버 액션·API 라우트용. */
export async function testUser(): Promise<SessionUser | null> {
  if (!testLoginEnabled()) return null;
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return verifyCookieValue(jar.get(TEST_COOKIE)?.value);
}

/** 미들웨어용. NextRequest 의 쿠키를 그대로 본다. */
export async function testUserFromRequest(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): Promise<SessionUser | null> {
  if (!testLoginEnabled()) return null;
  return verifyCookieValue(req.cookies.get(TEST_COOKIE)?.value);
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
