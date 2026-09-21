import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getCard } from "@/lib/db/cards";
import { judgedKanji } from "@/lib/db/kanji";
import { loadSpeakLoop, type SpeakLoopData } from "@/lib/speak-loop";
import { cardContext } from "@/lib/cards/progress";
import { landingWords } from "@/lib/cards/landing";
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
  // 루프가 받을 것(회차·마지막 곡선·겨눌 소리 유무)은 한 군데에서 푼다 (lib/speak-loop.ts).
  // 여기서 회차만 읽고 마지막 곡선을 두고 와서, 다시 열면 "나, 3회차" 라고 써 놓고 곡선이 없었다.
  let loop: SpeakLoopData = { startAttempt: 0, startPrev: null, targetVoice: true };

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const card = await getCard(user.id, id);
    if (!card) notFound();
    if (!card.revealed_at) redirect(`/cards/${id}/3`);
    /*
      **착지 안 한 카드는 들어올 때 막는다** — `graph/page.tsx` 가 이미 같은 줄을 갖고 있는데
      여기만 없었다. 그래서 주소를 직접 치거나 오래된 링크로 들어오면 **듣기·말하기를 다 한 뒤에**
      "됐어, 다음" 에서 그래프가 튕겨 Scene5 로 돌려보냈다. 자리에서 보면 "됐어를 눌렀는데 카드로
      돌아왔다" 이고, 카드를 끝낼 수 없는 것처럼 보인다.

      **들어올 때 막으면 될 것을 나갈 때 막고 있었다.** 정상 흐름(Scene5 의 `finishCard`)은 착지를
      시키고 넘기므로 이 줄에 안 걸린다.
    */
    if (!card.landed_at) redirect(`/cards/${id}/5`);
    const ctx = await cardContext(user.id, card);
    where = ctx.where;
    // 착지와 같은 함수로 고른다 — 안 만난 한자가 낀 낱말은 여기서 읽기까지 크게 띄우므로
    // 더 크게 샌다 (lib/cards/landing.ts).
    const w = landingWords(card.payload, await judgedKanji(user.id))[0];
    word = w.word;
    reading = w.reading;
    loop = await loadSpeakLoop(user.id, { card: card.id }, "ja");
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
      <SpeakLoop cardId={id} text={word} preview={preview} startAttempt={loop.startAttempt} startPrev={loop.startPrev} targetVoice={loop.targetVoice} />
    </Screen>
  );
}
