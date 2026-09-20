/**
 * 서버 전용 환경 변수. 빠진 값은 첫 사용 시점에 명확한 에러로 알린다.
 * 클라이언트 번들에 절대 import 하지 않는다.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경 변수 ${name} 가 설정되지 않았다 (.env.example 참고)`);
  return v;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get NEON_AUTH_BASE_URL() {
    return required("NEON_AUTH_BASE_URL");
  },
  get NEON_AUTH_COOKIE_SECRET() {
    const s = required("NEON_AUTH_COOKIE_SECRET");
    if (s.length < 32) throw new Error("NEON_AUTH_COOKIE_SECRET 는 32자 이상이어야 한다");
    return s;
  },
};
