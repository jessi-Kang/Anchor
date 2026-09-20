import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isDesignPreview } from "@/lib/design-preview";

/**
 * 라우트 보호. 로그인 화면(`/`)과 인증 API, 공개 정적 자원을 제외한 모든 경로는 세션이 필요하다.
 * 언어는 라우트가 아니라 데이터 속성이므로 여기서 언어 분기는 하지 않는다.
 */
const protect = auth.middleware({ loginUrl: "/" });

export default async function proxy(...args: Parameters<typeof protect>) {
  // 디자인 미리보기(로컬 pnpm design:check 전용)에서는 세션 없이 화면을 찍는다. 배포에서는 켜지지 않는다.
  if (isDesignPreview()) return NextResponse.next();

  // 로컬 전용 시험 로그인 (src/lib/auth/test-login.ts). 프로덕션 빌드에서는 이 조건이 빌드 시점에
  // false 로 접혀 블록째 사라진다. 시험 세션 쿠키가 있으면 통과시키고, 쿠키를 심는 라우트는 지나가게 둔다.
  if (process.env.NODE_ENV !== "production") {
    const req0 = args[0];
    const { testUserFromRequest, testLoginEnabled } = await import("@/lib/auth/test-login");
    if (testLoginEnabled() && req0) {
      if (req0.nextUrl.pathname === "/api/test-login") return NextResponse.next();
      if (await testUserFromRequest(req0)) return NextResponse.next();
    }
  }
  const res = await protect(...args);
  // 로그인 뒤 원래 가려던 곳으로 (FLOW 6장). 로그인 화면으로 보내는 응답에만 next 를 붙인다.
  const location = res.headers.get("location");
  const req = args[0];
  if (location && req && req.method === "GET" && !req.nextUrl.pathname.startsWith("/api/")) {
    const to = new URL(location, req.url);
    if (to.origin === req.nextUrl.origin && to.pathname === "/" && !to.searchParams.has("next")) {
      to.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
      res.headers.set("location", to.toString());
    }
  }
  return res;
}

export const config = {
  matcher: [
    "/onboarding/:path*",
    "/today/:path*",
    "/inputs/:path*",
    "/cards/:path*",
    "/graph/:path*",
    "/talk/:path*",
    "/settings/:path*",
    "/api/((?!auth|health|cron).*)",
  ],
};
