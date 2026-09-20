import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { SignInButton } from "./sign-in-button";

export const dynamic = "force-dynamic";

/**
 * `/` — O01 로그인. 1단계에서는 인증 배선 확인용 최소 구성.
 * 2단계에서 design/screens/O01.html 을 픽셀 수준으로 재현한다. 문구는 O01 그대로.
 */
export default async function Home() {
  const user = await currentUser();
  if (user) redirect("/today");

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        padding: "56px 20px 24px",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text3)" }}>시작</div>
      <div style={{ flexGrow: 1 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center" }}>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.02em" }}>Anchor</div>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text2)" }}>
          내가 읽고 들은 것에서 시작하는
          <br />
          영어·일본어·스페인어
        </div>
      </div>
      <div style={{ flexGrow: 1 }} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: "16px 18px",
          borderRadius: 18,
          background: "var(--tint2)",
          border: "1px solid var(--line)",
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--text2)",
        }}
      >
        <div>모든 기록은 내 계정에만 저장되고, 기본은 비공개.</div>
        <div>언제든 전체를 내려받고, 삭제하면 백업까지 지워진다.</div>
      </div>
      <div style={{ height: 14 }} />
      <SignInButton />
    </main>
  );
}
