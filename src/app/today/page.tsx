import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";
import { finishOnboarding, getOnboardingState } from "@/lib/db/onboarding";
import { activeLanguages, pendingSteps, STEP_PATH, LANG_LABEL } from "@/lib/onboarding-flow";
import { Screen, Space, Title, Lead, Card, Label, Row, Pill, Grow, Button, Ghost } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * `/today` — F01 홈. 문구·뼈대는 design/screens/F01.html. 큐 데이터는 5·6단계(인풋 레이어)에서 붙는다.
 * 켠 언어에 필요한 온보딩 단계가 남아 있으면 그쪽으로 보낸다 (언어를 나중에 추가한 경우 포함).
 */
export default async function TodayPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  await ensureUser(user);

  const state = await getOnboardingState(user.id);
  const pending = pendingSteps(state.settings);
  if (pending.length) redirect(STEP_PATH[pending[0]]);
  if (!state.onboarded_at) await finishOnboarding(user.id);

  const langs = activeLanguages(state.settings);
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
        <Row
          title="아직 없어"
          sub={langs.map((l) => LANG_LABEL[l]).join(" · ")}
          right={<Pill>0분</Pill>}
        />
      </Card>
      <Grow />
      <Button href="/inputs/new">자료 넣기</Button>
      <Ghost href="/settings">설정</Ghost>
    </Screen>
  );
}
