import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";

export const dynamic = "force-dynamic";

/**
 * `/today` — F01 홈. 1단계에서는 로그인 → users 행 생성 → 세션 확인까지만.
 * 온보딩(O02~O04)이 3단계에서 붙으면 onboarded_at 이 없을 때 /onboarding/purpose 로 보낸다.
 */
export default async function TodayPage() {
  const user = await currentUser();
  if (!user) redirect("/");

  const row = await ensureUser(user);

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", padding: "56px 20px 24px" }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text3)" }}>홈</div>
      <div style={{ height: 18 }} />
      <section
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text3)" }}>로그인됨</div>
        <div style={{ fontSize: 18 }}>{user.email}</div>
        <div style={{ fontSize: 13, color: "var(--text2)" }}>
          계정 생성 {new Date(row.created_at).toLocaleDateString("ko-KR")}
        </div>
      </section>
      <div style={{ height: 10 }} />
      <section
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontSize: 15,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text3)" }}>데이터</div>
        <a href="/api/export" style={{ color: "var(--accent-dark)" }}>
          전체 내보내기 (JSON)
        </a>
      </section>
    </main>
  );
}
