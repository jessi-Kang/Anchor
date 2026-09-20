import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getOnboardingState, getSeedDeck, type SeedNode } from "@/lib/db/onboarding";
import { activeLanguages, pendingSteps, nextPath, stepIndex, totalSteps } from "@/lib/onboarding-flow";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { SeedDeck } from "@/components/onboarding/seed-deck";
import { judgeKanji, finishKanji } from "./actions";

export const dynamic = "force-dynamic";

const PREVIEW_DECK: SeedNode[] = Array.from({ length: 40 }, (_, i) => ({
  id: `preview-${i}`,
  display: i === 11 ? "協" : "字",
  lang: "ja",
  main: "きょう",
  ruby: { base: "協力", rt: "きょうりょく" },
  anchor: "협력의 협",
}));

/**
 * `/onboarding/kanji` — O05 한자 씨앗 40장. 일본어를 켠 사용자만, 가나 확인 뒤.
 * 영어 씨앗과 같은 구조: 한자 하나를 보고 소리가 떠오르는지 → 뒤집어 음독·예시 단어(よみがな)·한국어 한자어 앵커 확인 → 판정.
 * 그래프의 첫 "아는 한자" 노드를 심는다. 이게 없으면 첫 한자 카드가 "아는 것 + 1"로 시작할 발판이 없다.
 */
export default async function KanjiPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  let deck: SeedNode[];
  let judged: Record<string, boolean> = {};
  let where = "3 / 4";
  const preview = isDesignPreview();

  if (preview) {
    deck = PREVIEW_DECK;
    for (let i = 0; i < 11; i++) judged[`preview-${i}`] = i < 9;
  } else {
    const user = await currentUser();
    if (!user) redirect("/");
    const state = await getOnboardingState(user.id);
    const langs = activeLanguages(state.settings);
    if (!pendingSteps(state.settings).includes("kanji")) {
      redirect(nextPath(state.settings, "kanji"));
    }
    where = `${stepIndex("kanji", langs)} / ${totalSteps(langs)}`;
    ({ deck, judged } = await getSeedDeck(user.id, "ja-onboarding"));
  }

  return (
    <Screen where={where} fixed={fixed === "1"}>
      <Space h={24} />
      <Title>
        소리를 먼저 떠올리고
        <br />
        뒤집어봐
      </Title>
      <Space h={6} />
      <Lead>3분. 한자 하나를 보고 아는 소리가 떠오르는지만 봐. 뜻은 안 물어. 틀려도 아무 일 없어.</Lead>
      <Space h={20} />
      <SeedDeck
        deck={deck}
        judged={judged}
        preview={preview}
        outboxKey="anchor.outbox.kanji"
        hint="떠올렸으면 탭해서 뒤집기"
        judge={judgeKanji}
        finish={finishKanji}
      />
    </Screen>
  );
}
