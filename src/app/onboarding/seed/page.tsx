import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getOnboardingState, getSeedDeck, type SeedNode } from "@/lib/db/onboarding";
import { activeLanguages, pendingSteps, nextPath, stepIndex, totalSteps } from "@/lib/onboarding-flow";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { SeedDeck } from "@/components/onboarding/seed-deck";
import { judgeSeed, finishSeed } from "./actions";

export const dynamic = "force-dynamic";

const PREVIEW_DECK: SeedNode[] = Array.from({ length: 40 }, (_, i) => ({
  id: `preview-${i}`,
  display: i === 11 ? "retro-" : `w${i}`,
  lang: "en",
  main: "back, or to a time before now",
  sub: "a retrospective looks back at what happened",
}));

/**
 * `/onboarding/seed` — O04 영어 씨앗. 영어 또는 스페인어를 켠 사용자만.
 * 스페인어는 영어 라틴 어근 위에 선다(SPEC 6). 스페인어를 켰으면 뒤집었을 때 스페인어 대응을 함께 보인다.
 */
export default async function SeedPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  let deck: SeedNode[];
  let judged: Record<string, boolean> = {};
  let where = "3 / 3";
  let esOnly = false;
  const preview = isDesignPreview();

  if (preview) {
    deck = PREVIEW_DECK;
    // 참고 화면: 12 / 40 · 떠오름 9 → 11장 판정(9 떠오름), 12번째 카드 표시
    for (let i = 0; i < 11; i++) judged[`preview-${i}`] = i < 9;
  } else {
    const user = await currentUser();
    if (!user) redirect("/");
    const state = await getOnboardingState(user.id);
    const langs = activeLanguages(state.settings);
    if (!pendingSteps(state.settings).includes("seed")) {
      redirect(nextPath(state.settings, "seed"));
    }
    where = `${stepIndex("seed", langs)} / ${totalSteps(langs)}`;
    esOnly = langs.includes("es") && !langs.includes("en");
    ({ deck, judged } = await getSeedDeck(user.id, "en-onboarding", { showEs: langs.includes("es") }));
  }

  return (
    <Screen where={where} fixed={fixed === "1"}>
      <Space h={24} />
      <Title>
        뜻을 먼저 떠올리고
        <br />
        뒤집어봐
      </Title>
      <Space h={6} />
      <Lead>
        {esOnly
          ? "3분. 스페인어는 영어 어근 위에 올라가. 영어 부품을 보고 떠오르는지만 봐. 틀려도 아무 일 없어."
          : "3분. 아는지 묻는 게 아니라 떠올랐는지 보는 거야. 틀려도 아무 일 없어."}
      </Lead>
      <Space h={20} />
      <SeedDeck
        deck={deck}
        judged={judged}
        preview={preview}
        outboxKey="anchor.outbox.seed"
        hint="떠올렸으면 탭해서 뒤집기"
        judge={judgeSeed}
        finish={finishSeed}
      />
    </Screen>
  );
}
