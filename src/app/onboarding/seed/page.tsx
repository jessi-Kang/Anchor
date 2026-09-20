import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getOnboardingState, getSeedDeck, type Lang3, type SeedNode } from "@/lib/db/onboarding";
import { enabledLanguages, homeRedirect, isLang, nextPath, stepHeader, stepState, stepsFor } from "@/lib/onboarding-flow";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { SeedDeck } from "@/components/onboarding/seed-deck";
import { SkipLink } from "@/components/onboarding/skip-link";
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
 * `/onboarding/seed?lang=en|es` — O04 영어 씨앗. 영어 또는 스페인어를 켠 사용자만. 두 언어가 같은 40장을 공유한다.
 * 스페인어는 영어 라틴 어근 위에 선다(SPEC 6). 스페인어를 켰으면 뒤집었을 때 스페인어 대응을 함께 보인다.
 * 이미 마쳤으면(done) 다음으로, 건너뛴 것은 다시 할 수 있다.
 */
export default async function SeedPage({ searchParams }: { searchParams: Promise<{ fixed?: string; lang?: string }> }) {
  const { fixed, lang: rawLang } = await searchParams;
  let lang: Lang3 = "en";
  let deck: SeedNode[];
  let judged: Record<string, boolean> = {};
  let where = "영어 2 / 2";
  const preview = isDesignPreview();

  if (preview) {
    deck = PREVIEW_DECK;
    // 참고 화면: 12 / 40 · 떠오름 9 → 11장 판정(9 떠오름), 12번째 카드 표시
    for (let i = 0; i < 11; i++) judged[`preview-${i}`] = i < 9;
  } else {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getOnboardingState(user.id);
    const home = homeRedirect(settings);
    if (home) redirect(home);
    const langs = enabledLanguages(settings);
    // lang 이 없거나 이 단계가 없는 언어면, seed 를 요구하는 첫 켠 언어로
    const owner = isLang(rawLang) && langs.includes(rawLang) && stepsFor(settings, rawLang).includes("seed")
      ? rawLang
      : langs.find((l) => stepsFor(settings, l).includes("seed"));
    if (!owner) redirect("/today");
    lang = owner;
    if (stepState(settings, lang, "seed") === "done") redirect(nextPath(settings, lang, "seed"));
    where = stepHeader(settings, lang, "seed");
    ({ deck, judged } = await getSeedDeck(user.id, "en-onboarding", { showEs: langs.includes("es") }));
  }

  return (
    <Screen where={where} aside={!preview && <SkipLink step="seed" lang={lang} />} fixed={fixed === "1"}>
      <Space h={24} />
      <Title>
        뜻을 먼저 떠올리고
        <br />
        뒤집어봐
      </Title>
      <Space h={6} />
      <Lead>
        {lang === "es"
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
        finish={finishSeed.bind(null, lang)}
      />
    </Screen>
  );
}
