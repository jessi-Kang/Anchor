import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";
import { getSettings } from "@/lib/db/settings";
import { listInputs } from "@/lib/db/inputs";
import { inputProgress, nextCandidates } from "@/lib/cards/progress";
import { enabledLanguages, homeRedirect, inputPath, LANG_LABEL } from "@/lib/languages";
import { eulReul } from "@/lib/ko";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Card, Label, Row, Pill, Status, Grow, Button, Ghost } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * `/today` — F01 홈. 문구·뼈대는 design/screens/F01.html. docs/FLOW.md 1장 9:
 * 자료 행(한자 n개 · 남은 카드) + 다음 카드 이유 한 줄 + "자료 넣기" / 설정.
 * 빈 상태는 "첫 자료 넣기" 버튼 하나. 리다이렉트는 켠 언어가 0개일 때뿐 (→ 언어 고르기).
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  const now = new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });

  if (isDesignPreview()) {
    return (
      <Screen where="홈" aside="오전 8:40" fixed={fixed === "1"}>
        <Space h={28} />
        <Title lg>오늘 만난 것</Title>
        <Space h={6} />
        <Lead>내가 읽고 들은 것에서만 뽑아. 커리큘럼은 없어.</Lead>
        <Space h={22} />
        <Card>
          <Label>인풋</Label>
          <Row title="日経 기사" sub="한자 4개" right={<Pill on>15분</Pill>} />
          <Row title="수업 슬라이드" sub="어근 2개" right={<Pill>6분</Pill>} />
          <Row title="어제 못 한 말" sub="1개" right={<Pill>5분</Pill>} />
        </Card>
        <Grow />
        <Button href="/inputs/new">자료 넣기</Button>
        <Ghost href="/settings">설정</Ghost>
      </Screen>
    );
  }

  const user = await currentUser();
  if (!user) redirect("/");
  await ensureUser(user);
  const { settings } = await getSettings(user.id);
  const home = homeRedirect(settings);
  if (home) redirect(home);
  const langs = enabledLanguages(settings);
  const inputs = await listInputs(user.id, 10);

  if (inputs.length === 0) {
    return (
      <Screen where="홈" aside={now}>
        <Space h={28} />
        <Title lg>오늘 만난 것</Title>
        <Space h={6} />
        <Lead>내가 읽고 들은 것에서만 뽑아. 커리큘럼은 없어.</Lead>
        <Space h={22} />
        <Card>
          <Label>인풋</Label>
          <Row title="아직 없어" sub={`${langs.map((l) => LANG_LABEL[l]).join(" · ")} 자료를 넣으면 여기서 시작돼`} />
        </Card>
        <Grow />
        <Button href={inputPath(langs[0])}>첫 자료 넣기</Button>
        <Ghost href="/settings">설정</Ghost>
      </Screen>
    );
  }

  const rows = await Promise.all(
    inputs.map(async (input) => {
      if (input.lang !== "ja") return { input, kanji: 0, remaining: 0, total: 0, next: null as null | ReturnType<typeof nextCandidates>[number] };
      const prog = await inputProgress(user.id, input);
      const next = prog.remaining > 0 ? (nextCandidates(prog)[0] ?? null) : null;
      return { input, kanji: prog.nodes.length, remaining: prog.remaining, total: prog.total, next };
    }),
  );
  const nextRow = rows.find((r) => r.next);
  const reason = nextRow?.next
    ? nextRow.next.shared.length
      ? `다음은 ${nextRow.next.kanji}. ${nextRow.next.shared[0]}${eulReul(nextRow.next.shared[0])} 아니까 가장 가까워.`
      : `다음은 ${nextRow.next.kanji}${nextRow.next.koWord ? ` (${nextRow.next.koWord})` : ""}. ${nextRow.input.title ?? "자료"}에서.`
    : null;

  return (
    <Screen where="홈" aside={now}>
      <Space h={28} />
      <Title lg>오늘 만난 것</Title>
      <Space h={6} />
      <Lead>내가 읽고 들은 것에서만 뽑아. 커리큘럼은 없어.</Lead>
      <Space h={22} />
      <Card>
        <Label>인풋</Label>
        {rows.map(({ input, kanji, remaining, next }) => {
          const sub =
            input.lang !== "ja"
              ? `${LANG_LABEL[input.lang]} · 뽑기는 다음 단계`
              : kanji === 0
                ? "아직 안 뽑았어"
                : remaining > 0
                  ? `한자 ${kanji}개 · 남은 카드 ${remaining}`
                  : `한자 ${kanji}개 · 다 봤어`;
          return (
            <Row
              key={input.id}
              href={`/inputs/${input.id}`}
              title={input.title ?? input.body.slice(0, 20)}
              sub={sub}
              right={remaining > 0 ? <Pill on>{next ? "이어서" : "이어서"}</Pill> : undefined}
            />
          );
        })}
      </Card>
      {reason && (
        <>
          <Space h={10} />
          <Status dot="on">{reason}</Status>
        </>
      )}
      <Grow />
      <Button href={inputPath(langs[0])}>자료 넣기</Button>
      <Ghost href="/settings">설정</Ghost>
    </Screen>
  );
}
