import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";
import { getSettings, type Lang3 } from "@/lib/db/settings";
import { hasInputs } from "@/lib/db/inputs";
import { EXAMPLE_INPUT } from "@/lib/example-input";
import { enabledLanguages, homeRedirect, isLang, LANG_LABEL } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Status } from "@/components/ui";
import { PasteForm } from "./paste-form";

export const dynamic = "force-dynamic";

/**
 * `/inputs/new?lang=` — F02 자료 넣기. 문구·뼈대는 design/screens/F02.html.
 * 언어를 켠 직후 오는 첫 화면이자 매일의 입구. 상단 라벨은 홈으로.
 * lang 이 없거나 안 켠 언어면 첫 번째 켠 언어로. 켠 언어가 없으면 언어 고르기로.
 */
export default async function NewInputPage({ searchParams }: { searchParams: Promise<{ lang?: string; fixed?: string }> }) {
  const { lang: rawLang, fixed } = await searchParams;
  let lang: Lang3 = "ja";
  let firstVisit = true;
  let esOnly = false;

  if (!isDesignPreview()) {
    const user = await currentUser();
    if (!user) redirect("/");
    await ensureUser(user);
    const { settings } = await getSettings(user.id);
    const home = homeRedirect(settings);
    if (home) redirect(home);
    const langs = enabledLanguages(settings);
    lang = isLang(rawLang) && langs.includes(rawLang) ? rawLang : langs[0];
    firstVisit = !(await hasInputs(user.id, lang));
    esOnly = lang === "es" && !langs.includes("en");
  }

  return (
    <Screen where="자료 넣기" up="/today" aside={LANG_LABEL[lang]} fixed={fixed === "1"}>
      <Space h={28} />
      <Title lg>무엇이든 붙여넣어</Title>
      <Space h={6} />
      <Lead>{lang === "ja" ? "기사, 문장, 한국어 한자어 한 단어도 돼." : "이메일, 슬라이드, 회의에서 들은 문장 한 줄도 돼."}</Lead>
      <Space h={22} />
      {esOnly && (
        <>
          <Status dot="off">스페인어는 영어 어근 위에 서. 영어 기초는 읽을 수 있어야 해.</Status>
          <Space h={10} />
        </>
      )}
      <PasteForm lang={lang} example={EXAMPLE_INPUT[lang]} firstVisit={firstVisit} />
    </Screen>
  );
}
