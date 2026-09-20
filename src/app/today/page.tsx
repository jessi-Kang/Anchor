import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";
import { finishOnboarding, getOnboardingState } from "@/lib/db/onboarding";
import { enabledLanguages, homeRedirect, LANGS, LANG_LABEL, STEP_LABEL, resumePath, unfinishedSteps } from "@/lib/onboarding-flow";
import { Screen, Space, Title, Lead, Card, Label, Row, Pill, Grow, Button, Ghost } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * `/today` — F01 홈. 문구·뼈대는 design/screens/F01.html. 큐 데이터는 5·6단계(인풋 레이어)에서 붙는다.
 * 리다이렉트는 켠 언어가 0개일 때 한 번뿐 (→ 언어 고르기). 남은 온보딩 단계는 막지 않고 "언어" 카드의 행으로 보여 준다.
 */
export default async function TodayPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  await ensureUser(user);

  const { settings, onboarded_at } = await getOnboardingState(user.id);
  const home = homeRedirect(settings);
  if (home) redirect(home);
  if (!onboarded_at) await finishOnboarding(user.id);

  const langs = enabledLanguages(settings);
  // 이어서 할 게 있는 언어 + 아직 안 켠 언어. 둘 다 없으면 카드 생략.
  const rows = LANGS.flatMap((l) => {
    if (!langs.includes(l)) {
      return [{ key: l, href: `/onboarding/purpose?lang=${l}`, title: LANG_LABEL[l], sub: "아직 안 켰어", on: false, pill: "시작하기" }];
    }
    const left = unfinishedSteps(settings, l);
    const href = resumePath(settings, l);
    if (left.length === 0 || !href) return [];
    return [{ key: l, href, title: LANG_LABEL[l], sub: `${left.map((st) => STEP_LABEL[st]).join(" · ")} 남음`, on: true, pill: "이어서" }];
  });
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
      {rows.length > 0 && (
        <>
          <Space h={10} />
          <Card>
            <Label>언어</Label>
            {rows.map((r) => (
              <Row key={r.key} href={r.href} title={r.title} sub={r.sub} right={<Pill on={r.on}>{r.pill}</Pill>} />
            ))}
          </Card>
        </>
      )}
      <Grow />
      <Button href="/inputs/new">자료 넣기</Button>
      <Ghost href="/settings">설정</Ghost>
    </Screen>
  );
}
