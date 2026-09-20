import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSettings } from "@/lib/db/settings";
import { enabledLanguages, LANGS, LANG_LABEL, LANG_START } from "@/lib/languages";
import { Screen, Space, Title, Card, Label, Row, Pill, Grow, Button, Ghost } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * `/settings` — SITEMAP: 홈으로, 언어 추가·끄기, 로그아웃, 계정, 전체 내보내기(JSON), 계정 삭제,
 * 음성 보관 기간, 항목별 공개, 목소리 선택. 지금은 언어와 내보내기만. 나머지는 해당 기능이 생길 때 붙인다.
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
        {LANGS.map((l) => {
          const on = active.includes(l);
          return <Row key={l} title={LANG_LABEL[l]} sub={LANG_START[l]} right={<Pill on={on}>{on ? "켜짐" : "꺼짐"}</Pill>} />;
        })}
      </Card>
      <Space h={10} />
      <Card>
        <Label>계정</Label>
        <Row title={user.email} sub="Google 로그인 · 기본 비공개" />
      </Card>
      <Grow />
      <Button href="/onboarding/languages">언어 추가</Button>
      <Ghost href="/api/export">전체 내보내기 (JSON)</Ghost>
    </Screen>
  );
}
