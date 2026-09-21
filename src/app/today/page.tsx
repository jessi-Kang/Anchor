import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";
import { getSettings } from "@/lib/db/settings";
import { listInputs } from "@/lib/db/inputs";
import { countChunks } from "@/lib/db/chunks";
import { inputProgress, nextCandidates, KNEW_VERB } from "@/lib/cards/progress";
import { inputName, inputFrom } from "@/lib/input-name";
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
        {/* 주어 자리에는 판정된 것만 온다 (docs/FLOW.md 4장). 미리보기 데이터에는 알아/몰라로 고른
            것이 없으므로 "力을 아니까" 라고 부를 수 없다 — 발판이 없을 때 쓰는 갈래(130행)를 쓴다.
            이 한 줄만 규칙을 안 따라와서, 미리보기가 틀린 본을 보이고 있었다. */}
        <Lead>다음은 協. 日経 기사에서.</Lead>
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
    // 부제에 "못 한 말" 을 또 쓰지 않는다 — 제목이 이미 그 말이라 한 행에서 같은 낱말을 두 번 쓰게 된다.
    //
    // **덩어리가 있으면 목록(F18)으로, 없으면 쓰기(F13)로.** 늘 F13 으로 보내면 덩어리가 셋이어도
    // 빈 입력 칸에 떨어지고, 지난 덩어리로 돌아갈 길이 어디에도 없다 — 같은 말의 2회차가 안 생겨
    // 곡선 표본이 1회차짜리만 쌓인다 (docs/FLOW.md 1′장 F01 행).
    ? [
        {
          id: "talk",
          title: "못 한 말",
          sub: talkCount > 0 ? `${talkCount}개` : "한 줄이면 돼",
          next: null,
          href: talkCount > 0 ? "/talk/past" : "/talk",
        },
      ]
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
  // **여기서 하루 끝(F15)으로 보내지 않는다.** 보내면 다 본 다음 날부터 홈이 영영 하루 끝이 되고,
  // 그 화면의 나가는 길은 홈 하나뿐이라 홈 ↔ 하루 끝 고리에 갇힌다 — 자료 넣기·못 한 말·설정에
  // 들어갈 길이 통째로 사라진다. 하루 끝은 상태가 아니라 순간이고, 마지막 카드를 착지한 그 자리에서만
  // 뜬다 (docs/FLOW.md 4장). 끝난 것은 홈이 한 줄로 말한다.
  // 뽑지 않은 자료는 "다 본" 것이 아니다 — 한자가 0개면 남은 카드도 0이라 같은 수가 되므로 갈라 본다.
  const japanese = rows.filter((r) => r.input.lang === "ja");
  const allDone = japanese.length > 0 && japanese.every((r) => r.kanji > 0 && r.remaining === 0);
  // 아는 것 → 다음 것, 한 문장. 아는 것을 앞에 둔다 (docs/FLOW.md 4장). 두 줄로 늘리지 않는다.
  // 주어 자리에는 **판정된** 것만 온다(`via`). 부를 발판이 없으면 억지로 붙이지 말고 자료를 댄다.
  // 앵커 단어는 붙이지 않는다 — 판정하는 자리에서만 붙인다 (docs/FLOW.md 4장).
  const nx = nextRow?.next;
  const reason = nx
    ? nx.via
      ? `${withParticle({ text: nx.via.kanji, sound: nx.via.koSound }, "을를")} ${KNEW_VERB[nx.via.how]} ${withParticle({ text: nx.kanji, sound: nx.koSound }, "이가")} 가장 가까워.`
      : `다음은 ${nx.kanji}. ${inputFrom(nextRow.input)}.`
    : allDone
      ? "이 자료는 다 봤어. 내일 또 나오면 그때 만나."
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
            title: inputName(input),
            sub:
              input.lang !== "ja"
                ? `${LANG_LABEL[input.lang]} · 뽑기는 다음 단계`
                : kanji === 0
                  ? "아직 안 뽑았어"
                  : remaining > 0
                    ? `한자 ${kanji}개 · 남은 카드 ${remaining}`
                    : `한자 ${kanji}개 · 다 봤어`,
            next: remaining > 0 ? (next?.kanji ?? null) : null,
            // 자료 행 하나가 세 상태를 가른다 (docs/FLOW.md 4장): 안 뽑음 → 뽑기(F03),
            // 남은 카드 → 카드(F04, next 가 맡는다), 다 봄 → 재만남(F12).
            // 다 본 자료를 뽑기로 보내면 할 일이 없는 화면이 뜨고, 재만남에 들어갈 길이 어디에도 없다.
            href: input.lang === "ja" && kanji > 0 && remaining === 0 ? `/inputs/${input.id}/read` : undefined,
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
