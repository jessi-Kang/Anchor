import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";
import { getSettings } from "@/lib/db/settings";
import { enabledLanguages, homeRedirect, inputPath, LANG_LABEL } from "@/lib/languages";
import { Screen, Space, Title, Lead, Card, Label, Row, Pill, Grow, Button, Ghost } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * `/today` — F01 홈. 문구·뼈대는 design/screens/F01.html.
 * 리다이렉트는 켠 언어가 0개일 때 한 번뿐 (→ 언어 고르기). 준비 단계는 없다 (docs/FLOW.md).
 */
export default async function TodayPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  await ensureUser(user);

  const { settings } = await getSettings(user.id);
  const home = homeRedirect(settings);
  if (home) redirect(home);

  const langs = enabledLanguages(settings);
  const now = new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });

  return (
    <Screen where="홈" aside={now}>
      <Space h={28} />
      <Title lg>오늘 만난 것</Title>
      <Space h={6} />
      <Lead>내가 읽고 들은 것에서만 뽑아. 커리큘럼은 없어.</Lead>
      <Space h={22} />
      <Card>
        <Label>인풋</Label>
        <Row title="아직 없어" sub={langs.map((l) => LANG_LABEL[l]).join(" · ")} right={<Pill>0분</Pill>} />
      </Card>
      <Grow />
      <Button href={inputPath(langs[0])}>자료 넣기</Button>
      <Ghost href="/settings">설정</Ghost>
    </Screen>
  );
}
