import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";
import { getSettings } from "@/lib/db/settings";
import { listInputs } from "@/lib/db/inputs";
import { countChunks } from "@/lib/db/chunks";
import { inputProgress, nextCandidates, KNEW_VERB } from "@/lib/cards/progress";
import { enabledLanguages, homeRedirect, inputPath, LANG_LABEL, LANG_START } from "@/lib/languages";
import { withParticle } from "@/lib/ko";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Card, Label, Grow, Button, Ghost } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { HomeRows, type HomeRow } from "./home-rows";

export const dynamic = "force-dynamic";

/**
 * `/today` — F01 홈. 뼈대는 design/screens/F01.html, 규칙은 docs/FLOW.md 1′장:
 * 라벨 "오늘", 자료 행(제목 · "한자 4개 · 남은 카드 3", 시간 없음) + 다음 카드 이유 한 줄 + "자료 넣기" / 설정.
 * 남은 카드가 있는 행은 "이어서" 알약, 탭 → F04. 빈 상태는 "첫 자료 넣기" 버튼 하나. 리다이렉트는 켠 언어가 0개일 때뿐.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  const now = nowKST();

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
              { id: "b", title: "수업 슬라이드", sub: "어근 2개 · 남은 카드 2", next: null },
              { id: "c", title: "어제 못 한 말", sub: "못 한 말 1개 · 남은 카드 1", next: null, href: "/talk" },
            ]}
          />
        </Card>
        <Space h={14} />
        <Lead>力을 아니까 助가 가장 가까워.</Lead>
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
    // 켠 언어가 하나면 버튼 하나로 충분하다. 둘 이상이면 행이 없으면 **첫 언어 말고는 들어갈 길이 없다** —
    // 이미 켠 언어는 O02a 가 통과시키지 않으므로 주소를 손으로 치는 수밖에 없었다. 1장 2 의
    // "나머지는 홈에서 이어서" 를 지키려면 여기서도 행을 그려야 한다 (docs/FLOW.md 1′장).
    // 자료가 생긴 뒤의 홈과 같은 뼈대다 — 주 버튼은 여전히 하나고 새 요소도 없다.
    const startRows: HomeRow[] = langs.map((l) => ({
      id: `lang-${l}`,
      title: `${LANG_LABEL[l]} 자료 넣기`,
      sub: LANG_START[l],
      next: null,
      href: inputPath(l),
    }));
    return (
      <Screen where="홈" aside={now}>
        <Space h={28} />
        <Title lg>오늘 만난 것</Title>
        <Space h={6} />
        <Lead>내가 읽고 들은 것에서만 뽑아. 커리큘럼은 없어.</Lead>
        <Space h={22} />
        {langs.length > 1 && (
          <Card>
            <Label>오늘</Label>
            <HomeRows rows={startRows} />
          </Card>
        )}
        <Grow />
        <Button href={inputPath(langs[0])}>{langs.length > 1 ? "자료 넣기" : "첫 자료 넣기"}</Button>
        <Ghost href="/settings">설정</Ghost>
      </Screen>
    );
  }

  // 홈의 두 번째 입구 (docs/FLOW.md 2장): 영어를 켰으면 "못 한 말" 행이 F13 으로 간다.
  // 빈 상태에는 넣지 않는다 — FLOW 1′장이 "자료 행 없이 버튼 하나" 로 못 박는다.
  const talkCount = langs.includes("en") ? await countChunks(user.id, "en") : 0;
  // 둘 이상 켰으면 나머지는 홈에서 이어서 (docs/FLOW.md 1장 2). 자료가 하나도 없는 언어는
  // 들어갈 길이 홈뿐이라, 그 언어의 자료 넣기 행을 둔다. 없으면 주소를 손으로 치는 수밖에 없다.
  const started = new Set(inputs.map((i) => i.lang));
  const notStartedRows: HomeRow[] = langs
    .filter((l) => !started.has(l))
    .map((l) => ({ id: `lang-${l}`, title: `${LANG_LABEL[l]} 자료 넣기`, sub: LANG_START[l], next: null, href: inputPath(l) }));

  const talkRows: HomeRow[] = langs.includes("en")
    ? [{ id: "talk", title: "못 한 말", sub: talkCount > 0 ? `못 한 말 ${talkCount}개` : "한 줄이면 돼", next: null, href: "/talk" }]
    : [];

  const rows = await Promise.all(
    inputs.map(async (input) => {
      if (input.lang !== "ja") return { input, kanji: 0, remaining: 0, total: 0, next: null as null | ReturnType<typeof nextCandidates>[number] };
      const prog = await inputProgress(user.id, input);
      const next = prog.remaining > 0 ? (nextCandidates(prog)[0] ?? null) : null;
      return { input, kanji: prog.nodes.length, remaining: prog.remaining, total: prog.total, next };
    }),
  );
  const nextRow = rows.find((r) => r.next);
  // 아는 것 → 다음 것, 한 문장. 아는 것을 앞에 둔다 (docs/FLOW.md 4장). 두 줄로 늘리지 않는다.
  // 주어 자리에는 **판정된** 것만 온다(`via`). 부를 발판이 없으면 억지로 붙이지 말고 자료를 댄다.
  // 괄호로 앵커 단어를 보여 주지 않는다 — 아직 안 푼 카드의 정답을 미리 까는 꼴이라 원칙 1 위반이다.
  const nx = nextRow?.next;
  const reason = nx
    ? nx.via
      ? `${withParticle({ text: nx.via.kanji, sound: nx.via.koSound }, "을를")} ${KNEW_VERB[nx.via.how]} ${withParticle({ text: nx.kanji, sound: nx.koSound }, "이가")} 가장 가까워.`
      : `다음은 ${nx.kanji}. ${nextRow.input.title?.slice(0, 12) ?? "자료"}에서.`
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
          rows={[...rows.map(({ input, kanji, remaining, next }) => ({
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
          })), ...notStartedRows, ...talkRows]}
        />
      </Card>
      {reason && (
        <>
          <Space h={14} />
          <Lead>{reason}</Lead>
        </>
      )}
      <Grow />
      <Button href={inputPath(langs[0])}>자료 넣기</Button>
      <Ghost href="/settings">설정</Ghost>
    </Screen>
  );
}
