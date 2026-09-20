import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { ensureUser } from "@/lib/db/users";
import { getSettings, type Lang3 } from "@/lib/db/settings";
import { enabledLanguages } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead } from "@/components/ui";
import { LanguagePicker } from "./language-picker";

export const dynamic = "force-dynamic";

/**
 * `/onboarding/languages` — O02a. 첫 방문의 두 번째 화면: 어떤 언어부터 할지 고른다 (여러 개 가능).
 * 이 페이지는 절대 리다이렉트하지 않는다 (홈이 "켠 언어 0개"일 때 여기로 보내는 유일한 곳이라 루프를 막기 위해).
 * 언어를 나중에 추가할 때도 홈·설정에서 같은 화면으로 온다. 이미 켠 언어는 "켜짐"으로 고정.
 * 상단 라벨: 첫 방문엔 위가 없고(뒤로 갈 곳이 로그인뿐), 추가 모드에선 홈.
 */
export default async function LanguagesPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  let enabled: Lang3[] = [];
  let initial: Lang3[] = [];

  if (isDesignPreview()) {
    initial = ["ja", "es"];
  } else {
    const user = await currentUser();
    if (!user) redirect("/");
    await ensureUser(user);
    const { settings } = await getSettings(user.id);
    enabled = enabledLanguages(settings);
  }

  return (
    <Screen where="언어" up={enabled.length > 0 ? "/today" : undefined} fixed={fixed === "1"}>
      <Space h={24} />
      <Title>어떤 언어부터 할까?</Title>
      <Space h={6} />
      <Lead>여러 개 골라도 돼. 하나씩 차례로 할 거야. 나머지는 나중에 켜도 돼.</Lead>
      <Space h={16} />
      <LanguagePicker enabled={enabled} initial={initial} />
    </Screen>
  );
}
