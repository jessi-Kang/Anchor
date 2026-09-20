import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSettings } from "@/lib/db/settings";
import { enabledLanguages } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Grow } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { MissedForm } from "./missed-form";

export const dynamic = "force-dynamic";

/**
 * `/talk` — F13 못 한 말. 뼈대·문구는 design/screens/F13.html.
 * 홈의 두 번째 입구(docs/FLOW.md 2장). 영어 대화 루프의 출발점이고, 묻는 것은 한국어 한 줄 하나다.
 * 원칙 0: 말할 상황에서 출발한다. 여기서 영어를 묻지 않는다 — 영어는 다음 화면이 준다.
 */
export default async function TalkPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;

  if (!isDesignPreview()) {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getSettings(user.id);
    if (!enabledLanguages(settings).includes("en")) redirect("/today");
  }

  return (
    <Screen where="못 한 말" up="/today" aside={isDesignPreview() ? "오후 7:10" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Title lg>
        오늘 회의에서
        <br />못 한 말 있어?
      </Title>
      <Space h={6} />
      <Lead>한국어로 한 줄이면 돼. 말끝까지 그대로.</Lead>
      <Space h={22} />
      <Grow />
      <MissedForm preview={isDesignPreview()} />
    </Screen>
  );
}
