import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { withUser } from "@/lib/db";
import { getSettings, type Lang3 } from "@/lib/db/settings";
import { enabledLanguages } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Card, Label, Row, Grow, Button } from "@/components/ui";
import { LanguageRows } from "./language-rows";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";

/**
 * `/settings` — docs/FLOW.md 1′장. 라벨 "언어": 언어 행(켜짐/꺼짐, 탭하면 켜기·끄기) + "언어 추가" 행.
 * 라벨 "계정": 이메일, 로그아웃, 음성 보관 기간(기본 30일, 기준은 SPEC 6.6), 전체 내보내기, 계정 삭제(확인 1장).
 * 주 버튼 "홈으로". 이탈 없음(행이 전부 이동). 상단 라벨도 홈.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  let email = "jessi@example.com";
  let active: Lang3[] = ["ja"];
  let retention = 30;

  // 디자인 미리보기(로컬 pnpm design:check 전용). 다른 화면과 같은 규칙으로 예시 데이터를 쓴다.
  if (!isDesignPreview()) {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getSettings(user.id);
    active = enabledLanguages(settings);
    email = user.email;
    retention = await withUser(user.id, async (tx) => {
      const { rows } = await tx.query<{ voice_retention_days: number }>("SELECT voice_retention_days FROM users WHERE id = $1", [user.id]);
      return rows[0]?.voice_retention_days ?? 30;
    });
  }

  return (
    <Screen where="설정" up="/today" fixed={fixed === "1"}>
      <Space h={28} />
      <Title lg>설정</Title>
      <Space h={22} />
      <Card>
        <Label>언어</Label>
        <LanguageRows enabled={active} />
      </Card>
      <Space h={10} />
      <Card>
        <Label>계정</Label>
        <Row title={email} sub="Google 로그인 · 기본 비공개" />
        <form action={signOut}>
          <Row title="로그아웃" sub="이 기기에서만" submit />
        </form>
        <Row title="음성 보관 기간" sub={`녹음 원본은 ${retention}일 뒤 지움. 억양 곡선은 남아`} />
        <Row title="전체 내보내기" sub="내 데이터 전부를 JSON 파일 하나로" href="/api/export" plain />
        <Row title="계정 삭제" sub="데이터와 백업 사본까지. 되돌릴 수 없어" href="/settings/delete" />
      </Card>
      <Grow />
      <Button href="/today">홈으로</Button>
    </Screen>
  );
}
