import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getOnboardingState } from "@/lib/db/onboarding";
import { KANA_SET } from "@/lib/onboarding-options";
import { activeLanguages, pendingSteps, nextPath, stepIndex, totalSteps } from "@/lib/onboarding-flow";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { KanaCheck } from "./kana-check";

export const dynamic = "force-dynamic";

/** `/onboarding/kana` — O03. 일본어를 켠 사용자만, 아직 안 읽었을 때만. */
export default async function KanaPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let where = "2 / 3";

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const state = await getOnboardingState(user.id);
    if (!pendingSteps(state.settings).includes("kana")) {
      redirect(nextPath(state.settings, "kana"));
    }
    const langs = activeLanguages(state.settings);
    where = `${stepIndex("kana", langs)} / ${totalSteps(langs)}`;
  }

  return (
    <Screen where={where} fixed={fixed === "1"}>
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
