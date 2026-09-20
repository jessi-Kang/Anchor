import { createNeonAuth } from "@neondatabase/auth/next/server";
import { env } from "@/lib/env";

/**
 * 서버 측 인증 인스턴스. Route handler(`/api/auth/[...path]`), proxy(미들웨어),
 * 서버 컴포넌트·서버 액션·API 라우트에서 `auth.getSession()` 으로 쓴다.
 */
export const auth = createNeonAuth({
  baseUrl: env.NEON_AUTH_BASE_URL,
  cookies: {
    secret: env.NEON_AUTH_COOKIE_SECRET,
    // OAuth 콜백(Google → 우리 도메인)은 cross-site 내비게이션이라 strict 쿠키가 안 붙는다.
    sameSite: "lax",
  },
});

export type SessionUser = { id: string; email: string; name?: string | null };

/**
 * 현재 로그인 사용자. 없으면 null.
 * DB 접근은 반드시 이 값의 `id`를 `withUser()` 에 넘겨서 한다.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const { data } = await auth.getSession();
  const u = data?.user;
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name ?? null };
}

/** API 라우트용: 미로그인이면 401 Response를 던진다. */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw Response.json({ error: "unauthorized" }, { status: 401 });
  return u;
}
