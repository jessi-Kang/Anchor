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

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const row = await getSituation(user.id, id);
    if (!row) notFound();
    // 이미 추측을 보낸 줄이면 여기 다시 서지 않는다. 빈 칸을 또 내밀면 덮어쓰게 되고,
    // 덮어쓰기는 유실이다 (CLAUDE.md 데이터 원칙: "추측 한 번도 유실 없음").
    if (row.done) redirect(`/talk/${id}`);
    situation = row.situation;
  }

  return (
    <Screen where="못 한 말" up="/talk" aside={preview ? "오후 7:11" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Card>
        <Label>내가 하려던 말</Label>
        <div className={s.talkSituation}>{situation}</div>
      </Card>
      <Space h={22} />
      <Title lg>
        영어로 뭐라고
        <br />할 것 같아?
      </Title>
      <Space h={6} />
      <Lead>틀려도 돼. 떠오르는 대로.</Lead>
      <Grow />
      <GuessForm chunkId={id} preview={preview} />
    </Screen>
  );
}
