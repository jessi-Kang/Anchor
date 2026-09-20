import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSeedDeck, type SeedNode } from "@/lib/db/onboarding";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { SeedDeck } from "./seed-deck";

export const dynamic = "force-dynamic";

const PREVIEW_DECK: SeedNode[] = Array.from({ length: 40 }, (_, i) => ({
  id: `preview-${i}`,
  key: i === 11 ? "retro-" : `w${i}`,
  display: i === 11 ? "retro-" : `w${i}`,
  definition: "back, or to a time before now",
  example: "a retrospective looks back at what happened",
}));

/** `/onboarding/seed` — O04 */
export default async function SeedPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  let deck: SeedNode[];
  let judged: Record<string, boolean> = {};
  const preview = isDesignPreview();

  if (preview) {
    deck = PREVIEW_DECK;
    // 참고 화면: 12 / 40 · 떠오름 9 → 11장 판정(9 떠오름), 12번째 카드 표시
    for (let i = 0; i < 11; i++) judged[`preview-${i}`] = i < 9;
  } else {
    const user = await currentUser();
    if (!user) redirect("/");
    ({ deck, judged } = await getSeedDeck(user.id));
  }

  return (
    <Screen where="3 / 3" fixed={fixed === "1"}>
      <Space h={24} />
      <Title>
        뜻을 먼저 떠올리고
        <br />
        뒤집어봐
      </Title>
      <Space h={6} />
      <Lead>3분. 아는지 묻는 게 아니라 떠올랐는지 보는 거야. 틀려도 아무 일 없어.</Lead>
      <Space h={20} />
      <SeedDeck deck={deck} judged={judged} preview={preview} />
    </Screen>
  );
}
