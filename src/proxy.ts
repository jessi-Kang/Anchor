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

/**
 * 프록시를 태울 경로. **`matcher` 는 Next 이 정적으로 읽는 자리라 글자 그대로여야 한다** —
 * 상수로 빼서 `matcher: PROXY_MATCHER` 로 쓰면 빌드가 거부한다("needs to be a static string").
 * 그래서 한 군데서 `export` 하는 대신, 시험(`scripts/test/proxy-matcher.test.ts`)이 이 파일에서
 * 목록을 읽어 **Next 자신의 컴파일러**에 넣고 경로를 맞춰 본다. 손으로 쓴 정규식을 손으로 쓴
 * 정규식과 견주면 둘이 같은 말을 해서 아무것도 못 잡는다.
 *
 * `/api/` 줄의 부정 전방탐색은 **경로가 아니라 접두사**를 뺀다. 전에는 `(?!auth|health|cron)`
 * 이라서 `/api/cron-admin` · `/api/authorize-test` · `/api/healthz-internal` 처럼 **이름이 그렇게
 * 시작하기만 해도** 프록시를 안 탔다. 지금 그 이름의 라우트가 없어서 샌 적은 없고, API 라우트가
 * 각자 `requireUser()`(또는 크론은 `Bearer`)로 한 겹 더 막고 있다. 그래도 고치는 이유는 **걸리는
 * 날에 아무 소리도 안 나서**다 — 누가 `/api/cron-status` 를 만들면서 "프록시가 막아 주겠지" 하고
 * 둘째 겹을 빠뜨리면 그날 조용히 열린다.
 *
 * `(?:/|$)` 로 **딱 그 세 경로와 그 아래만** 뺀다. 새 이름에 대해서는 닫히는 쪽이다 — 양성
 * 목록으로 뒤집으면 반대로 목록에 안 올린 새 라우트가 조용히 프록시를 안 탄다.
 */
export const config = {
  matcher: [
    "/onboarding/:path*",
    "/today/:path*",
    "/inputs/:path*",
    "/cards/:path*",
    "/graph/:path*",
    "/talk/:path*",
    "/settings/:path*",
    "/api/((?!auth(?:/|$)|health(?:/|$)|cron(?:/|$)).*)",
  ],
};
