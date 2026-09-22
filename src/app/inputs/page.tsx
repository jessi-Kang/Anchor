import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getSettings } from "@/lib/db/settings";
import { listInputs } from "@/lib/db/inputs";
import { enabledLanguages, inputPath } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { inputRowData, toInputRow, splitForHome } from "@/lib/cards/input-rows";
import { Screen, Space, Title, Lead, Card, Label, Grow, Button } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { HomeRows, type HomeRow } from "@/app/today/home-rows";

export const dynamic = "force-dynamic";

const PREVIEW: HomeRow[] = [
  { id: "p1", title: "아침 기사", sub: "일본어 · 한자 4개 · 다 봤어", next: null, href: "/inputs/p1/read" },
  { id: "p2", title: "회의 노트", sub: "영어 · 어근 3개 · 다 봤어", next: null },
  { id: "p3", title: "안내문", sub: "스페인어 · 어근 2개 · 남은 카드 2", next: null },
];

/**
 * `/inputs` — F19 지난 자료. 뼈대·문구는 design/screens/F19.html.
 *
 * **홈에서 넘친 자료가 오는 자리다.** 2주를 쓰면 자료가 열댓 개가 되는데 홈은 넷까지만 세운다.
 * 이 화면이 없으면 21일째에 첫 주 자료로 들어갈 길이 사라지고, **일본어 축의 재만남(F12)은
 * 다 본 자료 행 하나가 유일한 입구라 그게 밀리면 재만남이 통째로 막힌다** — 통과 기준
 * ("2주 후 **자료** 재만남 인식률 70%", `docs/SPEC.md` 9장) 둘 중 하나가 여기 걸려 있다.
 *
 * **최근에 넣은 것이 위다.** F18 과 갈리는 지점이다 — 덩어리는 "마지막으로 말한 지 오래된 것"
 * 이 위인데, 자료는 다시 **읽는** 자리라 오래 안 본 것을 위로 올릴 이유가 없다 (docs/FLOW.md 1′장).
 *
 * 행 모양·갈래는 홈과 같은 코드를 쓴다(`lib/cards/input-rows.ts`). 두 목록이 같은 행을 쓰면
 * 사용자가 한 번만 배운다.
 */
export default async function PastInputsPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let rows = PREVIEW;
  let first = "/inputs/new";

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getSettings(user.id);
    const langs = enabledLanguages(settings);
    if (langs.length === 0) redirect("/onboarding/languages");
    first = inputPath(langs[0]);
    const all = await inputRowData(user.id, await listInputs(user.id));
    // 홈에 선 넷은 여기 안 낸다 — 같은 행이 두 화면에 동시에 있으면 "넘친 것" 이라는 말이 뜻을 잃는다.
    const { rest } = splitForHome(all);
    rows = rest.map((d) => toInputRow(d, langs.length > 1));
  }

  return (
    <Screen where="지난 자료" up="/today" aside={preview ? "오후 7:14" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Title lg>지난 자료</Title>
      <Space h={22} />
      {/*
        빈 상태에 화면을 따로 만들지 않는다. 홈의 "지난 자료" 행은 넘치는 것이 있을 때만 서므로
        여기 빈 목록은 주소로 들어왔을 때만 본다 (F18 과 같은 이유).
      */}
      {rows.length === 0 ? (
        <Lead>넘친 자료가 아직 없어.</Lead>
      ) : (
        <Card>
          <Label>자료</Label>
          <HomeRows rows={rows} />
        </Card>
      )}
      <Grow />
      <Button href={first}>자료 넣기</Button>
    </Screen>
  );
}
