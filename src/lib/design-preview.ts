/**
 * 디자인 미리보기 모드. `pnpm design:check` 가 로그인·DB 없이 화면을 찍을 수 있게
 * 참고 HTML 의 예시 데이터로 렌더한다. 배포 환경에서는 절대 켜지지 않는다:
 * 환경 변수 ANCHOR_DESIGN_PREVIEW=1 이 로컬에서 명시적으로 설정될 때만.
 */
export function isDesignPreview(): boolean {
  return process.env.ANCHOR_DESIGN_PREVIEW === "1" && process.env.VERCEL !== "1";
}
