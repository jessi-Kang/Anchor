import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getInput } from "@/lib/db/inputs";
import { judgeItems, nextKanji } from "@/lib/cards/judge-items";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Grow, Button, Ghost } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { inputName } from "@/lib/input-name";
import { NextKanjiButton } from "./next-button";

export const dynamic = "force-dynamic";

/**
 * `/inputs/[id]/no-card` — F04a 카드를 못 만든 자리. 뼈대·문구는 design/screens/F04a.html.
 *
 * **왜 F03 이 아니라 여기인가.** 처음엔 뽑기에 묶음 하나로 그렸는데(F03b, 지워졌다), 뽑기는
 * 문안을 만들지 않아서 **거기서는 못 만들 것을 알 수가 없다.** 알려면 그 화면의 한자 전부를
 * 미리 만들어 봐야 하고, 그러면 그때 한 번 흔들린 한자가 멀쩡한데도 갇힌다. F03 둘째 묶음은
 * 씨앗 값(부를 낱말이 없다)이라 뽑기에서 알고, 문안 실패는 **열어 봐야** 안다 — 모양이 같다고
 * 한 자리에 넣으면 **언제 정해지는 값인지**가 섞인다 (design/SCREENS.md "못 만들었을 때").
 *
 * 카드 행은 안 만들었으니 `/cards/[id]` 가 될 수 없어 자료 밑에 선다. 위로 가는 길도,
 * "나중에" 도 그 자료의 F03 이다.
 *
 * `failed` 는 이번에 못 만든 한자들이고 **주소로만 다닌다.** 저장하면 API 가 한 번 죽은 날의
 * 한자가 영영 갇힌다. 여기 쓰는 곳은 하나 — "다음 글자" 가 방금 못 만든 그 글자를 다시
 * 내밀지 않게 거른다.
 */
export default async function NoCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fixed?: string; failed?: string }>;
}) {
  const { id } = await params;
  const { fixed, failed } = await searchParams;
  const skip = (failed ?? "").split(",").filter(Boolean);
  const preview = isDesignPreview();

  let where = "아침 기사";
  let next: string | null = "開";

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const input = await getInput(user.id, id);
    if (!input) notFound();
    where = inputName(input);
    const { items } = await judgeItems(user.id, input.body);
    next = nextKanji(items, skip);
  }

  return (
    <Screen where={where} up={`/inputs/${id}`} aside={preview ? "점심 12:30" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Title lg>이 카드는 지금 못 만들었어.</Title>
      <Space h={6} />
      <Lead>다른 글자부터 볼래?</Lead>
      <Grow />
      {/* **다음 글자가 없으면 "자료로" 다** — 없는 길을 버튼으로 두지 않는다 (docs/FLOW.md 1′장). */}
      {next ? (
        <NextKanjiButton inputId={id} kanji={next} failed={skip} preview={preview} />
      ) : (
        <Button href={`/inputs/${id}`}>자료로</Button>
      )}
      <Ghost href={`/inputs/${id}`}>나중에</Ghost>
    </Screen>
  );
}
