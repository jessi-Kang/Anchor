import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSettings } from "@/lib/db/settings";
import { KANA_SET, kanaGate } from "@/lib/kana";
import { enabledLanguages, homeRedirect } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { KanaCheck } from "./kana-check";

export const dynamic = "force-dynamic";

/** `/onboarding/kana` — O03. 일본어 첫 카드 직전 1회. 이미 확인했으면 다시 묻지 않는다 (kanaGate). */
export default async function KanaPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  const preview = isDesignPreview();

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getSettings(user.id);
    const home = homeRedirect(settings);
    if (home) redirect(home);
    if (!enabledLanguages(settings).includes("ja")) redirect("/today");
    if (kanaGate(settings) !== "ask") redirect("/today");
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
      <KanaCheck kana={KANA_SET} preview={preview} />
    </Screen>
  );
}
