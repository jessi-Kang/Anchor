import type { NextConfig } from "next";

/**
 * 로컬 전용 시험 로그인(`src/app/api/test-login/route.dev.ts`)을 라우트로 만들지 말지.
 * 셋이 다 참일 때만 `dev.ts` 가 pageExtensions 에 들어가고, 그때만 그 파일이 라우트가 된다.
 * 프로덕션 빌드에서는 pageExtensions 에 `dev.ts` 가 없어 파일이 라우트로 잡히지 않는다 —
 * 조건부로 404 를 주는 라우트가 아니라, 라우트가 아예 없다. 자세한 건 src/lib/auth/test-login.ts.
 */
const testLoginBuild =
  process.env.NODE_ENV !== "production" && process.env.ANCHOR_TEST_LOGIN === "1" && process.env.VERCEL !== "1";

const nextConfig: NextConfig = {
  pageExtensions: testLoginBuild ? ["ts", "tsx", "dev.ts"] : ["ts", "tsx"],
  // next dev 가 CLAUDE.md 끝에 자기 규칙 블록을 덧붙이지 않게 한다.
  // CLAUDE.md 는 모든 세션이 읽는 지침이라, 화면을 한 번 띄웠다고 트리가 더러워지면 안 된다.
  agentRules: false,
  // dev 화면 구석의 Next 표시를 끈다. pnpm design:check 가 참고 화면과 픽셀 비교할 때 그 동그라미가 차이로 잡힌다.
  devIndicators: false,
};

export default nextConfig;
