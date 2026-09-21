import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getInput, markExtracted } from "@/lib/db/inputs";
import { judgeItems, type JudgeItem } from "@/lib/cards/judge-items";
import { isDesignPreview } from "@/lib/design-preview";
import { LANG_LABEL } from "@/lib/languages";
import { Screen, Space, Title, Lead, Grow, Button } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { inputName } from "@/lib/input-name";
import { JudgeRows } from "./judge-rows";

export const dynamic = "force-dynamic";

/**
 * `/inputs/[id]` — F03 뽑기. 문구·뼈대는 design/screens/F03.html (알아로 표시한 뒤는 F03a.html).
 * 자료의 한자를 두 묶음으로: **「아는 낱말에서 시작」**(그 글자를 부를 한국어 낱말이 있음) /
 * **「부를 낱말이 아직 없어」**. 가르는 축은 **낱말 하나**다 — 소리는 양쪽 다 있다.
 * 둘째 묶음의 주어는 사용자가 아니라 앱이다: 그 소리를 모르는 게 아니라 **우리가 아직 못 골랐다**.
 * 여기가 "아는 것" 수집 자리: 한자마다 알아/몰라 선택 칩 한 탭 → user_node_state (docs/FLOW.md 1장 4).
 * 상단 라벨 → 홈. 영어·스페인어 자료는 다음 단계(못 한 말 루프)라 자료만 저장됐다고 알린다.
 */
export default async function InputPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fixed?: string }> }) {
  const { id } = await params;
  const { fixed } = await searchParams;

  if (isDesignPreview()) {
    const anchored: JudgeItem[] = [
      { nodeId: "a", kanji: "協", sub: "협력의 협", hasWord: true, known: null },
      { nodeId: "b", kanji: "開", sub: "개발의 개", hasWord: true, known: null },
      { nodeId: "c", kanji: "基", sub: "기반의 기", hasWord: true, known: null },
    ];
    // 낱말은 없고 소리만 있는 행 — 부제는 한국 한자음 한 글자다 (docs/FLOW.md 1장 F03 행).
    const bare: JudgeItem[] = [{ nodeId: "d", kanji: "妥", sub: "타", hasWord: false, known: null }];
    return (
      <Screen where="아침 기사" up="/today" aside="오전 8:42" fixed={fixed === "1"}>
        <Space h={28} />
        <JudgeRows inputId="preview" anchored={anchored} bare={bare} empty={false} />
      </Screen>
    );
  }

  const user = await currentUser();
  if (!user) redirect("/");
  const input = await getInput(user.id, id);
  if (!input) notFound();

  if (input.lang !== "ja") {
    return (
      <Screen where={inputName(input)} up="/today" aside={nowKST()}>
        <Space h={28} />
        <Title lg>자료는 저장됐어</Title>
        <Space h={6} />
        <Lead>{LANG_LABEL[input.lang]} 뽑기는 다음 단계야. 지금은 일본어 자료부터 카드가 돼.</Lead>
        <Grow />
        <Button href="/today">홈으로</Button>
      </Screen>
    );
  }

  // 줄과 그 순서는 F04a("다음 글자")와 한 곳에서 온다 (lib/cards/judge-items.ts).
  const { found, items } = await judgeItems(user.id, input.body);
  if (!input.extracted_at) await markExtracted(user.id, input.id, found);

  const anchored = items.filter((i) => i.hasWord);
  const bare = items.filter((i) => !i.hasWord);
  // 상단 "지금 어디" 라벨에는 이름만 온다. 조사를 붙이면 라벨이 아니라 문장이 된다.
  const where = inputName(input);

  return (
    <Screen where={where} up="/today" aside={nowKST()}>
      <Space h={28} />
      <JudgeRows inputId={input.id} anchored={anchored} bare={bare} empty={found.length === 0} />
    </Screen>
  );
}
