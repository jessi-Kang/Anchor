import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { isDesignPreview } from "@/lib/design-preview";
import { safeNext } from "@/lib/safe-next";
import { Screen, Space, Title, Lead, Grow, Button } from "@/components/ui";
import { nowKST } from "@/components/card-bits";

export const dynamic = "force-dynamic";

/**
 * `/onboarding/kana/module?next=&why=` — O03b 가나 모듈 예고 1장 (docs/FLOW.md 1′장). 문구는 O03b.html 그대로.
 * "못 읽겠어" 착지. 카드를 잠그지 않고 그대로 첫 카드로 보낸다 (읽기는 F10 에서 소리로).
 * why=mic 이면 마이크 미지원·거부 착지: 같은 레이아웃에 문구만 "마이크를 쓸 수 없어 / 다음에 다시 확인할게."
 */
export default async function KanaModulePage({ searchParams }: { searchParams: Promise<{ next?: string; from?: string; why?: string; fixed?: string }> }) {
  const { next: rawNext, from: rawFrom, why, fixed } = await searchParams;
  if (!isDesignPreview()) {
    const user = await currentUser();
    if (!user) redirect("/");
  }
  const next = safeNext(rawNext);
  const up = safeNext(rawFrom);
  const mic = why === "mic";
  return (
    <Screen where="가나" up={up} aside={isDesignPreview() ? "오전 8:43" : nowKST()} fixed={fixed === "1"}>
      <Grow />
      <Title>{mic ? "마이크를 쓸 수 없어" : "가나부터 익히는 길은 준비 중이야"}</Title>
      <Space h={6} />
      <Lead>{mic ? "다음에 다시 확인할게." : "지금은 읽기를 소리로 들려줄게."}</Lead>
      <Grow />
      <Button href={next}>첫 카드로</Button>
    </Screen>
  );
}
