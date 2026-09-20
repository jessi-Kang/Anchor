import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSettings } from "@/lib/db/settings";
import { KANA_SET, kanaGate } from "@/lib/kana";
import { enabledLanguages, homeRedirect } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { safeNext } from "@/lib/safe-next";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { KanaCheck } from "./kana-check";

export const dynamic = "force-dynamic";

/**
 * `/onboarding/kana?next=` — O03 가나 30초. 일본어 첫 카드 직전에 한 번만 (docs/FLOW.md 1장 4′). 문구는 O03.html.
 * 이미 확인했으면(passed·module, 또는 recheck 한 지 하루 안) 묻지 않고 next 로.
 * 마이크는 "읽기 시작"을 누른 뒤에만 켠다 (O03 → O03a, kana-check.tsx). retry=1 은 다시 읽어보기.
 */
export default async function KanaPage({ searchParams }: { searchParams: Promise<{ fixed?: string; next?: string; from?: string; retry?: string }> }) {
  const { fixed, next: rawNext, from: rawFrom, retry } = await searchParams;
  const preview = isDesignPreview();
  const next = safeNext(rawNext);
  // 상단 라벨은 한 단계 위로 간다. O03 위는 뽑기(F03)이고, 그 자료를 모르면 홈이다.
  const up = safeNext(rawFrom);

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getSettings(user.id);
    const home = homeRedirect(settings);
    if (home) redirect(home);
    if (!enabledLanguages(settings).includes("ja")) redirect("/today");
    if (kanaGate(settings) === "pass" && retry !== "1") redirect(next);
  }

  return (
    <Screen where="가나" up={up} aside={preview ? "오전 8:43" : nowKST()} fixed={fixed === "1"}>
      <Space h={24} />
      <Title>
        이 여섯 개를
        <br />
        소리 내서 읽어봐
      </Title>
      <Space h={6} />
      <Lead>읽을 수 있냐고 묻는 대신 그냥 읽어. 마이크가 듣고 판단해.</Lead>
      <Space h={20} />
      <KanaCheck kana={KANA_SET} preview={preview} next={next} from={up} />
    </Screen>
  );
}
