import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getOnboardingState, type Lang3 } from "@/lib/db/onboarding";
import { PURPOSE_OPTIONS } from "@/lib/onboarding-options";
import { LANG_LABEL, homeRedirect, isLang, purposesOf, setupQueue, stepHeader, stepPath } from "@/lib/onboarding-flow";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { PurposeForm } from "./purpose-form";

export const dynamic = "force-dynamic";

/**
 * `/onboarding/purpose?lang=X` — O02b. 한 언어의 "어디서 쓰나". 수준은 묻지 않는다.
 * 새로 켠 언어면 상단에 "일본어 1 / 3", 이미 고친 언어를 다시 왔으면 언어 이름만.
 * lang 이 없거나 잘못됐으면 상황을 아직 안 고른 첫 언어로, 그것도 없으면 홈으로.
 */
export default async function PurposePage({ searchParams }: { searchParams: Promise<{ fixed?: string; lang?: string }> }) {
  const { fixed, lang: rawLang } = await searchParams;
  let lang: Lang3 = "ja";
  let initial: string[] = [];
  let editing = false;
  let where = "일본어 1 / 3";

  if (isDesignPreview()) {
    initial = ["기사·뉴스"];
  } else {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getOnboardingState(user.id);
    if (!isLang(rawLang)) {
      const queue = setupQueue(settings);
      redirect(queue.length ? stepPath("purpose", queue[0]) : (homeRedirect(settings) ?? "/today"));
    }
    lang = rawLang;
    initial = purposesOf(settings, lang);
    editing = initial.length > 0;
    where = editing ? LANG_LABEL[lang] : stepHeader(settings, lang, "purpose");
  }

  return (
    <Screen where={where} fixed={fixed === "1"}>
      <Space h={24} />
      <Title>{LANG_LABEL[lang]}, 어디서 쓰게 될까?</Title>
      <Space h={6} />
      <Lead>수준은 묻지 않아. 지금 쓸 상황만 골라.</Lead>
      <Space h={16} />
      <PurposeForm lang={lang} options={PURPOSE_OPTIONS[lang]} initial={initial} editing={editing} />
    </Screen>
  );
}
