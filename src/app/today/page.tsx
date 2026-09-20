import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";
import { getSettings } from "@/lib/db/settings";
import { listInputs } from "@/lib/db/inputs";
import { inputProgress, nextCandidates } from "@/lib/cards/progress";
import { enabledLanguages, homeRedirect, inputPath, LANG_LABEL } from "@/lib/languages";
import { eulReul } from "@/lib/ko";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Card, Label, Status, Grow, Button, Ghost } from "@/components/ui";
import { HomeRows } from "./home-rows";

export const dynamic = "force-dynamic";

/**
 * `/today` — F01 홈. 뼈대는 design/screens/F01.html, 규칙은 docs/FLOW.md 1′장:
 * 라벨 "오늘", 자료 행(제목 · "한자 4개 · 남은 카드 3", 시간 없음) + 다음 카드 이유 한 줄 + "자료 넣기" / 설정.
 * 남은 카드가 있는 행은 "이어서" 알약, 탭 → F04. 빈 상태는 "첫 자료 넣기" 버튼 하나. 리다이렉트는 켠 언어가 0개일 때뿐.
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
          <Label>오늘</Label>
          <HomeRows
            rows={[
              { id: "a", title: "日経 기사", sub: "한자 4개 · 남은 카드 3", next: "協" },
              { id: "b", title: "수업 슬라이드", sub: "어근 2개", next: null },
              { id: "c", title: "어제 못 한 말", sub: "1개", next: null },
            ]}
          />
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
        <Label>오늘</Label>
        <HomeRows
          rows={rows.map(({ input, kanji, remaining, next }) => ({
            id: input.id,
            title: input.title ?? input.body.slice(0, 20),
            sub:
              input.lang !== "ja"
                ? `${LANG_LABEL[input.lang]} · 뽑기는 다음 단계`
                : kanji === 0
                  ? "아직 안 뽑았어"
                  : remaining > 0
                    ? `한자 ${kanji}개 · 남은 카드 ${remaining}`
                    : `한자 ${kanji}개 · 다 봤어`,
            next: remaining > 0 ? (next?.kanji ?? null) : null,
          }))}
        />
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
