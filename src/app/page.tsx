import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { Screen, Grow, Space, Card, LogoMark } from "@/components/ui";
import { GoogleSignIn } from "./google-sign-in";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

/** `/` — O01 로그인. design/screens/O01.html 을 그대로 옮김. `?fixed=1` 은 픽셀 비교용. */
export default async function Home({ searchParams }: { searchParams: Promise<{ fixed?: string; next?: string }> }) {
  const { fixed, next } = await searchParams;
  // 로그인 뒤 목적지. 같은 사이트 경로만 (열린 리다이렉트 방지)
  const to = next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";
  const user = await currentUser();
  if (user) redirect(to);

  return (
    <Screen where="시작" fixed={fixed === "1"}>
      <Grow />
      <div className={s.hero}>
        <LogoMark size={72} />
        <div className={s.wordmark}>Anchor</div>
        <div className={s.tagline}>
          내가 읽고 들은 것에서 시작하는
          <br />
          영어·일본어·스페인어
        </div>
      </div>
      <Grow />
      <Card tint style={{ padding: "16px 18px" }}>
        <div className={s.principles}>
          <div>
            <span className={s.principleKey}>내 데이터는 내 것</span>{" "}
             계정별로 분리되고 기본 비공개. 공개 프로필, 순위표 없음.
          </div>
          <div>
            <span className={s.principleKey}>사라지지 않음</span>{" "}
             매일 백업, 언제든 전체 내보내기.
          </div>
        </div>
      </Card>
      <Space h={12} />
      <GoogleSignIn callbackURL={to} />
    </Screen>
  );
}
