import { auth } from "@/lib/auth/server";

/**
 * 라우트 보호. 로그인 화면(`/`)과 인증 API, 공개 정적 자원을 제외한 모든 경로는 세션이 필요하다.
 * 언어는 라우트가 아니라 데이터 속성이므로 여기서 언어 분기는 하지 않는다.
 */
export default auth.middleware({ loginUrl: "/" });

export const config = {
  matcher: [
    "/onboarding/:path*",
    "/today/:path*",
    "/inputs/:path*",
    "/cards/:path*",
    "/graph/:path*",
    "/talk/:path*",
    "/settings/:path*",
    "/api/((?!auth|health).*)",
  ],
};
