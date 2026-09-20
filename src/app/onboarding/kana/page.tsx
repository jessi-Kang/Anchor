import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSettings } from "@/lib/db/settings";
import { KANA_SET, kanaGate } from "@/lib/kana";
import { enabledLanguages, homeRedirect } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Grow, Button, Ghost } from "@/components/ui";
import { KanaCheck } from "./kana-check";

export const dynamic = "force-dynamic";

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";
}

/**
 * `/onboarding/kana?next=` — O03 가나 30초. 일본어 첫 카드 직전에 한 번만 (docs/FLOW.md 1장 4′).
 * - 이미 확인했으면(passed, 또는 recheck 한 지 하루 안) 묻지 않고 next 로.
 * - "못 읽겠어"(locked)면 가나 모듈(v2) 예고 1장. 한자 카드는 잠긴다. retry=1 로 다시 읽어볼 수 있다.
 * - 마이크는 "읽기 시작"을 누른 뒤에만 켠다 (kana-check.tsx).
 */
export default async function KanaPage({ searchParams }: { searchParams: Promise<{ fixed?: string; next?: string; retry?: string }> }) {
  const { fixed, next: rawNext, retry } = await searchParams;
  const preview = isDesignPreview();
  const next = safeNext(rawNext);

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getSettings(user.id);
    const home = homeRedirect(settings);
    if (home) redirect(home);
    if (!enabledLanguages(settings).includes("ja")) redirect("/today");
    const gate = kanaGate(settings);
    if (gate === "pass") redirect(next);
    if (gate === "locked" && retry !== "1") {
      return (
        <Screen where="가나 읽기" up="/today">
          <Grow />
          <Title>가나부터 시작할 차례야</Title>
          <Space h={6} />
          <Lead>가나 모듈은 다음 판에 와. 그때까지 한자 카드는 잠겨 있어. 자료는 그대로 남아.</Lead>
          <Grow />
          <Button href="/today">홈으로</Button>
          <Ghost href={`/onboarding/kana?retry=1&next=${encodeURIComponent(next)}`}>다시 읽어볼래</Ghost>
        </Screen>
      );
    }
  }

  return (
    <Screen where="가나 읽기" up="/today" fixed={fixed === "1"}>
      <Space h={24} />
      <Title>
        이 여섯 개를
        <br />
        소리 내서 읽어봐
      </Title>
      <Space h={6} />
      <Lead>읽을 수 있냐고 묻는 대신 그냥 읽어. 마이크가 듣고 판단해.</Lead>
      <Space h={20} />
      <KanaCheck kana={KANA_SET} preview={preview} next={next} />
    </Screen>
  );
}
