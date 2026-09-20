import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getOnboardingState } from "@/lib/db/onboarding";
import { KANA_SET } from "@/lib/onboarding-options";
import { enabledLanguages, homeRedirect, nextPath, stepHeader, stepState } from "@/lib/onboarding-flow";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { SkipLink } from "@/components/onboarding/skip-link";
import { KanaCheck } from "./kana-check";

export const dynamic = "force-dynamic";

/** `/onboarding/kana` — O03. 일본어를 켠 사용자만. 이미 마쳤으면(done) 다음으로, 건너뛴 것(skipped)은 다시 할 수 있다. */
export default async function KanaPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let where = "일본어 2 / 3";

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getOnboardingState(user.id);
    const home = homeRedirect(settings);
    if (home) redirect(home);
    if (!enabledLanguages(settings).includes("ja")) redirect("/today");
    if (stepState(settings, "ja", "kana") === "done") redirect(nextPath(settings, "ja", "kana"));
    where = stepHeader(settings, "ja", "kana");
  }

  return (
    <Screen where={where} aside={!preview && <SkipLink step="kana" lang="ja" />} fixed={fixed === "1"}>
      <Space h={24} />
      <Title>
        이 여섯 개를
        <br />
        소리 내서 읽어봐
      </Title>
      <Space h={6} />
      <Lead>읽을 수 있냐고 묻는 대신 그냥 읽어. 마이크가 듣고 판단해.</Lead>
      <Space h={20} />
      <KanaCheck kana={KANA_SET} preview={preview} />
    </Screen>
  );
}
