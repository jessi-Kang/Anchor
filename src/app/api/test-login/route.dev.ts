/**
 * `GET /api/test-login` — 로컬 전용 시험 로그인. QA 가 Google 계정 없이 실제 계정으로 경로를 돈다.
 *
 * **이 파일은 이름이 `route.dev.ts` 라서 보통은 라우트가 아니다.** `next.config.ts` 가
 * `dev.ts` 를 pageExtensions 에 넣을 때만 라우트가 되고, 그 조건은
 * NODE_ENV !== production && ANCHOR_TEST_LOGIN=1 && VERCEL 아님 이다.
 * 프로덕션 빌드에는 이 경로가 아예 만들어지지 않는다(조건부 404 가 아니다).
 *
 *   /api/test-login              → 쿠키를 심고 /today 로
 *   /api/test-login?next=/경로   → 같은 사이트 경로로
 *   /api/test-login?logout=1     → 쿠키를 지우고 / 로
 */
import { NextResponse, type NextRequest } from "next/server";
import { TEST_COOKIE, COOKIE_OPTIONS, issueCookieValue, testLoginEnabled } from "@/lib/auth/test-login";
import { safeNext } from "@/lib/safe-next";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 빌드가 이 라우트를 만들었더라도 런타임 조건을 다시 본다.
  if (!testLoginEnabled()) return new NextResponse("not found", { status: 404 });

  const url = new URL(req.url);
  if (url.searchParams.get("logout") === "1") {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set(TEST_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
    return res;
  }

  // 같은 사이트 경로만 (열린 리다이렉트 방지). 다른 세 곳과 같은 가드를 쓴다 — 복사본을 두지 않는다.
  const to = safeNext(url.searchParams.get("next"));

  const res = NextResponse.redirect(new URL(to, req.url));
  res.cookies.set(TEST_COOKIE, await issueCookieValue(), COOKIE_OPTIONS);
  return res;
}
