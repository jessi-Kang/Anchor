import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSituation } from "@/lib/db/chunks";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Card, Label, Grow, uiStyles as s } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { GuessForm } from "./guess-form";

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
        </>
      ) : (
        /*
          **F17a — 문장을 못 만든 자리.** 기획 문구가 아직 안 와서 참고 화면(`F17a.html`)이 그린
          `___` 를 그대로 둔다. **없는 말을 내가 짓지 않는다.** 문구가 오면 이 두 줄만 바뀐다.

          자리가 안 바뀌는 것이 이 화면의 일이다 — 낸 추측이 그대로 있으면 "없어졌다" 도
          "답이 비었다" 도 아니고 **"아직 확인 중"** 으로 읽힌다.
        */
        <>
          <Title lg>___</Title>
          <Space h={6} />
          <Lead>___</Lead>
        </>
      )}
      <Grow />
      <GuessForm chunkId={id} preview={preview} saved={guess} />
    </Screen>
  );
}
