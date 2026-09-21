import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSituation } from "@/lib/db/chunks";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Card, Label, Grow, uiStyles as s } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { GuessForm } from "./guess-form";
import { RetryButton } from "./retry-button";

export const dynamic = "force-dynamic";

/**
 * `/talk/[id]/guess` — F17 추측. 뼈대·문구는 design/screens/F17.html.
 * F13 과 F14 사이. 상단 라벨 → F13.
 *
 * **이 화면에는 답이 한 글자도 없다** (원칙 1, design/SCREENS.md). 영어 문장도 힌트도 첫 글자도 없다.
 * 두 겹으로 막는다:
 *  1. 이 시점에는 영어 문장이 **아직 만들어지지도 않았다** (`submitMissed` 주석). 샐 것이 없다.
 *  2. 그래도 이 화면은 `getSituation` 으로 **situation 한 칸만** 읽는다. 나중에 행에 무엇이 붙든
 *     이 페이지의 렌더 트리에 들어올 수 없다.
 *
 * 맨 위 "내가 하려던 말" 은 답이 아니라 **출발점**이라 남긴다 — 없으면 무엇을 옮기려는지 잃는다.
 */
export default async function GuessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fixed?: string }>;
}) {
  const { id } = await params;
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let situation = "이건 다음 스프린트로 미루죠";
  // 추측이 이미 있으면 **못 만든 상태**다 (F17a). 위에서 문장이 있는 줄은 이미 나갔다.
  let guess: string | null = null;

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const row = await getSituation(user.id, id);
    if (!row) notFound();
    // **영어 문장이 있을 때만** 여기서 나간다. 추측만 있고 문장이 없는 줄은 이 화면에 머문다 —
    // 문안을 못 만든 상태이고, 다시 만들 수 있는 자리가 여기뿐이다 (design/screens/F17a.html).
    if (row.done) redirect(`/talk/${id}`);
    situation = row.situation;
    guess = row.guess;
  }

  return (
    <Screen where="못 한 말" up="/talk" aside={preview ? "오후 7:11" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Card>
        <Label>내가 하려던 말</Label>
        <div className={s.talkSituation}>{situation}</div>
      </Card>
      <Space h={22} />
      {guess === null ? (
        <>
          <Title lg>
            영어로 뭐라고
            <br />할 것 같아?
          </Title>
          <Space h={6} />
          <Lead>틀려도 돼. 떠오르는 대로.</Lead>
          <Grow />
          <GuessForm chunkId={id} preview={preview} />
        </>
      ) : (
        /*
          **F17a — 문장을 못 만든 자리.** 쓴 줄은 **입력 칸이 아니라 카드로** 보여 준다
          (design/screens/F17a.html, F14 의 "내가 쓴 것" 과 같은 꼴).

          칸으로 두면 두 가지가 깨진다. 하나는 모양이 거짓말을 하는 것 — 칸은 "여기 쓰라" 는
          모양인데 못 쓰게 막아 두면 그렇다. 다른 하나는 **버튼의 뜻**이다. 칸이 있으면 다시
          누르는 것이 "새 추측" 으로 읽히고, 그 줄이 첫 추측을 덮을 길이 생긴다(유실).
          칸이 없으면 그 버튼의 뜻이 "문장을 다시 만들어 보기" 하나로 좁혀진다.
        */
        <>
          <Title lg>
            지금은 영어를
            <br />못 만들었어.
          </Title>
          <Space h={6} />
          <Lead>쓴 건 저장했어.</Lead>
          <Space h={18} />
          <Card>
            <div className={s.talkPair}>
              <Label>내가 쓴 것</Label>
              <p className={s.talkLine} lang="en">
                {guess}
              </p>
            </div>
          </Card>
          <Grow />
          <RetryButton chunkId={id} preview={preview} />
        </>
      )}
    </Screen>
  );
}
