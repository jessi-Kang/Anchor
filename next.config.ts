import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev 가 CLAUDE.md 끝에 자기 규칙 블록을 덧붙이지 않게 한다.
  // CLAUDE.md 는 모든 세션이 읽는 지침이라, 화면을 한 번 띄웠다고 트리가 더러워지면 안 된다.
  agentRules: false,
  // dev 화면 구석의 Next 표시를 끈다. pnpm design:check 가 참고 화면과 픽셀 비교할 때 그 동그라미가 차이로 잡힌다.
  devIndicators: false,
};

export default nextConfig;
