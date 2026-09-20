import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isDesignPreview } from "@/lib/design-preview";

/**
 * 라우트 보호. 로그인 화면(`/`)과 인증 API, 공개 정적 자원을 제외한 모든 경로는 세션이 필요하다.
 * 언어는 라우트가 아니라 데이터 속성이므로 여기서 언어 분기는 하지 않는다.
 */
const protect = auth.middleware({ loginUrl: "/" });

export default function proxy(...args: Parameters<typeof protect>) {
  // 디자인 미리보기(로컬 pnpm design:check 전용)에서는 세션 없이 화면을 찍는다. 배포에서는 켜지지 않는다.
  if (isDesignPreview()) return NextResponse.next();
  return protect(...args);
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
    "/api/((?!auth|health).*)",
  ],
};
