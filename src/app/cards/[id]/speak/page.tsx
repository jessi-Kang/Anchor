import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getCard } from "@/lib/db/cards";
import { cardContext } from "@/lib/cards/progress";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Card, uiStyles as s } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { SpeakLoop } from "./speak-loop";

export const dynamic = "force-dynamic";

/**
 * `/cards/[id]/speak` — F10 말하기. 착지 단어(協力 きょうりょく)를 듣고 따라 말한다. 뼈대는 F10.html.
 * 상단 라벨 → 카드 출처(F04). 이탈은 "됐어, 다음" 하나 (→ F11).
 */
export default async function SpeakPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fixed?: string }> }) {
  const { id } = await params;
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let where = "카드 1 / 4";
  let word = "協力";
  let reading = "きょうりょく";

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const card = await getCard(user.id, id);
    if (!card) notFound();
    if (!card.revealed_at) redirect(`/cards/${id}/3`);
    const ctx = await cardContext(user.id, card);
    where = ctx.where;
    const w = card.payload.landing[0];
    word = w?.word ?? card.payload.kanji;
    reading = w?.reading ?? card.payload.reading;
  }

  return (
    <Screen where={where} up={`/cards/${id}`} aside={nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Card style={{ padding: "26px 20px" }}>
        <div className={s.speakWord}>
          <h1 className={s.speakBig} lang="ja">
            {word}
          </h1>
          <div className={s.speakReading} lang="ja">
            {reading}
          </div>
        </div>
      </Card>
      <Space h={16} />
      <SpeakLoop cardId={id} text={word} preview={preview} />
    </Screen>
  );
}
