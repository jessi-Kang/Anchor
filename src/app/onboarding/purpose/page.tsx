import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getOnboardingState, type Purposes } from "@/lib/db/onboarding";
import { PURPOSE_OPTIONS } from "@/lib/onboarding-options";
import { activeLanguages, totalSteps } from "@/lib/onboarding-flow";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { PurposeForm } from "./purpose-form";

export const dynamic = "force-dynamic";

const PREVIEW: Purposes = { en: ["회의", "학위 수업", "이메일"], ja: ["기사·뉴스"], es: ["릴스·노래"] };

/**
 * `/onboarding/purpose` — O02. 언어는 세트가 아니라 하나씩 켠다.
 * 상황을 하나라도 고른 언어가 "켜진" 언어. 나중에 /settings 에서 다시 들어와 언어를 추가할 수 있다.
 */
export default async function PurposePage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  let initial: Purposes = { en: [], ja: [], es: [] };
  let returning = false;

  if (isDesignPreview()) {
    initial = PREVIEW;
  } else {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings, onboarded_at } = await getOnboardingState(user.id);
    if (settings.purposes) initial = { ...initial, ...settings.purposes };
    returning = Boolean(onboarded_at);
  }

  const active = activeLanguages({ purposes: initial });
  const where = returning ? "언어" : active.length ? `1 / ${totalSteps(active)}` : "1 / 3";

  return (
    <Screen where={where} fixed={fixed === "1"}>
      <Space h={24} />
      <Title>어디서 쓰게 될까?</Title>
      <Space h={6} />
      <Lead>수준은 묻지 않아. 지금 쓸 언어의 상황만 골라. 나머지 언어는 나중에 켜도 돼.</Lead>
      <Space h={16} />
      <PurposeForm options={PURPOSE_OPTIONS} initial={initial} returning={returning} />
    </Screen>
  );
}
