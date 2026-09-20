import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { Screen, Space, Title, Lead, Grow } from "@/components/ui";
import { DeleteForm } from "./delete-form";

export const dynamic = "force-dynamic";

/** `/settings/delete` — 계정 삭제 확인 1장 (docs/FLOW.md 1′장). 상단 라벨 → 설정. */
export default async function DeleteAccountPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  return (
    <Screen where="계정 삭제" up="/settings">
      <Grow />
      <Title>정말 지울까?</Title>
      <Space h={6} />
      <Lead>모든 데이터가 지워지고 되돌릴 수 없어. 백업 사본도 함께 지워져. 계속하려면 아래에 삭제 라고 써.</Lead>
      <Space h={16} />
      <DeleteForm />
    </Screen>
  );
}
