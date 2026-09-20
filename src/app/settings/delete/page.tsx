import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Lead, Grow } from "@/components/ui";
import { DeleteForm } from "./delete-form";

export const dynamic = "force-dynamic";

/**
 * `/settings/delete` — 계정 삭제 확인 1장 (docs/FLOW.md 1′장, design/screens/F16a.html). 상단 라벨 → 설정.
 * 되돌릴 수 없는 일은 검은 주 버튼에 두지 않는다: 주 버튼은 돌아가는 쪽이고, 지우는 것은 그 아래 회색 링크다.
 */
export default async function DeleteAccountPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  if (!isDesignPreview()) {
    const user = await currentUser();
    if (!user) redirect("/");
  }
  return (
    <Screen where="설정" up="/settings" fixed={fixed === "1"}>
      <Grow />
      <Title>
        계정을 지우면
        <br />
        되돌릴 수 없어
      </Title>
      <Space h={10} />
      <Lead>지우면 백업 사본까지 함께 지워져. 되돌릴 수 없어.</Lead>
      <Space h={16} />
      <DeleteForm />
    </Screen>
  );
}
