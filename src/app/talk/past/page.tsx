import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSettings } from "@/lib/db/settings";
import { enabledLanguages } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { pastChunks, type PastChunk } from "@/lib/db/chunks";
import { Screen, Space, Title, Lead, Card, Label, Row, Pill, Grow, Button } from "@/components/ui";
import { nowKST } from "@/components/card-bits";

export const dynamic = "force-dynamic";

const PREVIEW: PastChunk[] = [
  { id: "p1", situation: "확인해 보고 알려드릴게요", chunk: "I'll get back to", done: true },
  { id: "p2", situation: "그럼 목요일로 할까요?", chunk: "does that work for", done: true },
  { id: "p3", situation: "이건 다음 스프린트로 미루죠", chunk: "push this to", done: true },
];

/**
 * `/talk/past` — F18 전에 못 했던 말. 뼈대·문구는 design/screens/F18.html.
 *
 * **영어 축의 두 번째 만남이 들어오는 자리다.** 이 화면이 없으면 지난 덩어리로 돌아갈 길이 없어
 * 같은 말의 2회차가 안 생기고, 곡선 통과 기준("같은 덩어리 5회차 곡선 일치도가 오른다",
 * `docs/SPEC.md` 9장)의 표본이 **1회차짜리만 쌓인다.** 편의 기능이 아니라 측정 전제다.
 *
 * 행 하나 = 덩어리 하나. 제목은 덩어리, 부제는 **그때 쓴 한국어 한 줄 그대로**다 — 그 줄이 어떤
 * 말이었는지 가리키는 이름표라 다시 쓰지 않고, 넘치면 넘치는 만큼만 가린다(`Row` 가 한다).
 * 행 모양은 홈의 자료 행 그대로다. 두 목록이 같은 행을 쓰면 사용자가 한 번만 배운다.
 *
 * **탭 → F14 로 바로 간다. F17 을 안 거친다** — 추측은 처음 한 번이고, 이미 한 추측은 F14 맨 위에 있다.
 *
 * **아직 덩어리가 안 된 줄도 여기 선다** — F13 에 한 줄 쓰고 F17 에서 그만둔 것 (`docs/FLOW.md`
 * 1′장 F18 행). 그 행이 없으면 **그 줄은 어느 화면에도 문이 없다**: 홈도 목록도 F13 도 모르고,
 * 같은 말을 다시 써도 새 행이 된다. F17 은 이 축에서 제일 어려운 화면이라(답을 안 보여 주고 먼저
 * 추측하게 한다) 거기서 그만두는 것은 드문 일이 아니다.
 *
 * 그 행은 **제목 자리에 그때 쓴 한국어 한 줄**이 서고(놓을 덩어리가 없다), 탭하면 **F14 가 아니라
 * F17** 로 간다 — F14 는 문장도 곡선도 없는 껍데기다. **부제는 빈다**: 빠뜨린 게 아니라 아직 영어가
 * 없다는 사실이다. 갈 곳이 다르다는 것은 **알약 "이어서" 하나로** 말한다(어휘 셋 중 하나).
 *
 * **묶음을 쪼개지 않는다.** 한 목록이라 라벨 "오래된 것부터" 가 두 종류에 걸쳐 그대로 뜻이 있고,
 * 묶음을 세우면 알약 하나로 될 일에 카드가 하나 더 선다. (참고 `F18a.html` 은 묶음 둘로 그려져
 * 있는데 그건 접힌 안이다 — 기획이 `docs/FLOW.md` 로 정한 쪽이 이 모양이다.)
 *
 * **회차를 행에 안 쓴다** (알약으로도 부제로도). "3회" 가 뜨면 5를 채우는 게임이 되고 스트리크 금지에
 * 걸린다. 회차는 F14 안 범례에만 산다. 순서는 카드 라벨 "오래된 것부터" 한 줄이 말한다.
 */
export default async function PastTalkPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let rows = PREVIEW;

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getSettings(user.id);
    if (!enabledLanguages(settings).includes("en")) redirect("/today");
    rows = await pastChunks(user.id, "en");
  }

  return (
    <Screen where="지난 것" up="/today" aside={preview ? "오후 7:14" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Title lg>전에 못 했던 말</Title>
      <Space h={22} />
      {/*
        **빈 상태에 화면을 따로 만들지 않는다.** 행 없이 한 줄이다 — 홈의 못 한 말 행은 이 상태에서
        F13 으로 가므로 주소로 들어왔을 때만 본다. 달라지는 게 한 줄뿐인 자리를 화면으로 나누기
        시작하면 목록이 있는 모든 화면이 두 장이 된다 (design/SCREENS.md F18).
      */}
      {rows.length === 0 ? (
        <Lead>아직 없어.</Lead>
      ) : (
        <Card>
          {/* 숫자 없이 순서를 말할 수 있는 유일한 자리다. 회차를 행에 안 쓰기로 한 결정이 이 라벨로 지탱된다. */}
          <Label>오래된 것부터</Label>
          {rows.map((r) =>
            r.done ? (
              <Row key={r.id} href={`/talk/${r.id}`} title={<span lang="en">{r.chunk}</span>} sub={r.situation} />
            ) : (
              // 한국어 줄이 제목 자리에 서므로 `lang="en"` 을 안 붙인다. 부제는 없다.
              <Row key={r.id} href={`/talk/${r.id}/guess`} title={r.situation} right={<Pill>이어서</Pill>} />
            ),
          )}
        </Card>
      )}
      <Grow />
      <Button href="/talk">못 한 말 쓰기</Button>
    </Screen>
  );
}
