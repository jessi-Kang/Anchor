import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";
import { getSettings, type Lang3 } from "@/lib/db/settings";
import { hasInputs } from "@/lib/db/inputs";
import { EXAMPLE_INPUT, exampleLabel } from "@/lib/example-input";
import { enabledLanguages, homeRedirect, isLang, LANG_LABEL } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Status } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
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
    // 상단 오른쪽은 어느 화면에서나 시각이다. 화면이 무엇에 대한 것인지는 왼쪽 라벨이 진다.
    <Screen where={`${LANG_LABEL[lang]} 자료 넣기`} up="/today" aside={isDesignPreview() ? "오전 8:40" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Title lg>무엇이든 붙여넣어</Title>
      <Space h={6} />
      {/* 공유 버튼 이야기는 뺐다 — 공유 타깃(manifest 의 share_target)이 아직 없어서,
          첫 방문 세 번째 화면에서 읽은 사람이 기사 앱의 공유 시트를 열었다가 빈손으로 돌아온다.
          실제로 생기는 날 되살린다. */}
      <Lead>기사 링크, 이메일, 슬라이드, 릴스.</Lead>
      <Space h={22} />
      {esOnly && (
        <>
          <Status dot="off">스페인어는 영어 어근 위에 서. 영어 기초는 읽을 수 있어야 해.</Status>
          <Space h={10} />
        </>
      )}
      <PasteForm lang={lang} example={{ ...EXAMPLE_INPUT[lang], label: exampleLabel(lang) }} firstVisit={firstVisit} />
    </Screen>
  );
}
