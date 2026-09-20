import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSettings, type Purposes } from "@/lib/db/onboarding";
import { PURPOSE_OPTIONS } from "@/lib/onboarding-options";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { PurposeForm } from "./purpose-form";

export const dynamic = "force-dynamic";

const PREVIEW: Purposes = { en: ["회의", "학위 수업", "이메일"], ja: ["기사·뉴스"], es: ["릴스·노래"] };

/** `/onboarding/purpose` — O02 */
export default async function PurposePage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  let initial: Purposes = { en: [], ja: [], es: [] };

  if (isDesignPreview()) {
    initial = PREVIEW;
  } else {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getSettings(user.id);
    if (settings.purposes) initial = { ...initial, ...settings.purposes };
  }

  return (
    <Screen where="1 / 3" fixed={fixed === "1"}>
      <Space h={24} />
      <Title>어디서 쓰게 될까?</Title>
      <Space h={6} />
      <Lead>수준은 묻지 않아. 상황만 골라. 대화는 세 언어 다 기본이야.</Lead>
      <Space h={16} />
      <PurposeForm options={PURPOSE_OPTIONS} initial={initial} />
    </Screen>
  );
}
