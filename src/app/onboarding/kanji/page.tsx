import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getOnboardingState, getSeedDeck, type SeedNode } from "@/lib/db/onboarding";
import { enabledLanguages, homeRedirect, nextPath, stepHeader, stepState } from "@/lib/onboarding-flow";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { SeedDeck } from "@/components/onboarding/seed-deck";
import { SkipLink } from "@/components/onboarding/skip-link";
import { judgeKanji, finishKanji } from "./actions";

export const dynamic = "force-dynamic";

const PREVIEW_DECK: SeedNode[] = Array.from({ length: 40 }, (_, i) => ({
  id: `preview-${i}`,
  display: i === 11 ? "協" : "字",
  lang: "ja",
  main: "きょう",
  ruby: { base: "協力", rt: "きょうりょく" },
}));

/**
 * `/onboarding/kanji` — O05 한자 씨앗 40장. 일본어를 켠 사용자만, 가나 뒤. 이미 마쳤으면(done) 다음으로, 건너뛴 것은 다시 할 수 있다.
 * 영어 씨앗과 같은 구조: 한자 하나를 보고 일본어 읽기가 떠오르는지 → 뒤집어 읽기·예시 단어 확인 → 판정.
 * 한국어는 화면에 나오지 않는다. 한국어 한자어 소리는 이미 아는 것이라 묻지 않고, 발견 카드의 후킹에서만 쓴다.
 * 그래프의 첫 "아는 한자" 노드를 심는다. 이게 없으면 첫 한자 카드가 "아는 것 + 1"로 시작할 발판이 없다.
 */
export default async function KanjiPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  let deck: SeedNode[];
  let judged: Record<string, boolean> = {};
  let where = "일본어 3 / 3";
  const preview = isDesignPreview();

  if (preview) {
    deck = PREVIEW_DECK;
    for (let i = 0; i < 11; i++) judged[`preview-${i}`] = i < 9;
  } else {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getOnboardingState(user.id);
    const home = homeRedirect(settings);
    if (home) redirect(home);
    if (!enabledLanguages(settings).includes("ja")) redirect("/today");
    if (stepState(settings, "ja", "kanji") === "done") redirect(nextPath(settings, "ja", "kanji"));
    where = stepHeader(settings, "ja", "kanji");
    ({ deck, judged } = await getSeedDeck(user.id, "ja-onboarding"));
  }

  return (
    <Screen where={where} aside={!preview && <SkipLink step="kanji" lang="ja" />} fixed={fixed === "1"}>
      <Space h={24} />
      <Title>
        읽기를 먼저 떠올리고
        <br />
        뒤집어봐
      </Title>
      <Space h={6} />
      <Lead>3분. 한자 하나를 보고 일본어 읽기가 떠오르는지만 봐. 틀려도 아무 일 없어.</Lead>
      <Space h={20} />
      <SeedDeck
        deck={deck}
        judged={judged}
        preview={preview}
        outboxKey="anchor.outbox.kanji"
        hint="읽기가 떠올랐으면 탭해서 뒤집기"
        judge={judgeKanji}
        finish={finishKanji}
      />
    </Screen>
  );
}
