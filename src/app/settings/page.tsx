import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSettings } from "@/lib/db/settings";
import { enabledLanguages } from "@/lib/languages";
import { Screen, Space, Title, Card, Label, Row, Grow, Button, Ghost } from "@/components/ui";
import { LanguageRows } from "./language-rows";
import { DeleteAccountRow } from "./delete-account";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";

/**
 * `/settings` — docs/FLOW.md 4장: 홈으로 가는 길(상단 라벨), 언어 추가·끄기, 로그아웃, 전체 내보내기, 계정 삭제.
 * 음성 보관 기간·항목별 공개·목소리 선택은 해당 기능이 생길 때 붙인다.
 */
export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  const { settings } = await getSettings(user.id);
  const active = enabledLanguages(settings);

  return (
    <Screen where="설정" up="/today">
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
        <Row title={user.email} sub="Google 로그인 · 기본 비공개" />
        <Row title="전체 내보내기" sub="내 데이터 전부를 JSON 파일 하나로" href="/api/export" plain />
        <form action={signOut}>
          <Row title="로그아웃" sub="이 기기에서만" submit />
        </form>
        <DeleteAccountRow />
      </Card>
      <Grow />
      <Button href="/onboarding/languages">언어 추가</Button>
      <Ghost href="/today">홈으로</Ghost>
    </Screen>
  );
}
