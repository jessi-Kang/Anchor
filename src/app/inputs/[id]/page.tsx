import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getInput, markExtracted } from "@/lib/db/inputs";
import { getKanjiNodes, getKanjiStates } from "@/lib/db/kanji";
import { extractKanji } from "@/lib/kanji/extract";
import { isDesignPreview } from "@/lib/design-preview";
import { LANG_LABEL } from "@/lib/languages";
import { Screen, Space, Title, Lead, Grow, Button } from "@/components/ui";
import { JudgeRows, type JudgeItem } from "./judge-rows";

export const dynamic = "force-dynamic";

/**
 * `/inputs/[id]` — F03 뽑기. 문구·뼈대는 design/screens/F03.html (알아로 표시한 뒤는 F03a.html).
 * 자료의 한자를 두 묶음으로: "아는 소리에서 시작"(한국어 한자어 앵커가 있음) / "발판 없음".
 * 여기가 "아는 것" 수집 자리: 한자마다 알아/몰라 선택 칩 한 탭 → user_node_state (docs/FLOW.md 1장 4).
 * 상단 라벨 → 홈. 영어·스페인어 자료는 다음 단계(못 한 말 루프)라 자료만 저장됐다고 알린다.
 */
export default async function InputPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fixed?: string }> }) {
  const { id } = await params;
  const { fixed } = await searchParams;

  if (isDesignPreview()) {
    const anchored: JudgeItem[] = [
      { nodeId: "a", kanji: "協", anchor: "협력의 협", known: null },
      { nodeId: "b", kanji: "開", anchor: "개발의 개", known: null },
      { nodeId: "c", kanji: "基", anchor: "기반의 기", known: null },
    ];
    const bare: JudgeItem[] = [{ nodeId: "d", kanji: "妥", anchor: null, known: null }];
    return (
      <Screen where="이 기사에서" up="/today" aside="오전 8:42" fixed={fixed === "1"}>
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
      <Screen where={input.title ?? "자료"} up="/today" aside={LANG_LABEL[input.lang]}>
        <Space h={28} />
        <Title lg>자료는 저장됐어</Title>
        <Space h={6} />
        <Lead>{LANG_LABEL[input.lang]} 뽑기는 다음 단계야. 지금은 일본어 자료부터 카드가 돼.</Lead>
        <Grow />
        <Button href="/today">홈으로</Button>
      </Screen>
    );
  }

  const chars = extractKanji(input.body);
  const nodes = await getKanjiNodes(chars);
  const found = chars.filter((c) => nodes.has(c));
  const states = await getKanjiStates(
    user.id,
    found.map((c) => nodes.get(c)!.id),
  );
  if (!input.extracted_at) await markExtracted(user.id, input.id, found);

  const items: JudgeItem[] = found.map((c) => {
    const n = nodes.get(c)!;
    const st = states.get(n.id);
    const koWord = n.meta.ko_word;
    const sound = n.meta.ko_sound;
    return {
      nodeId: n.id,
      kanji: c,
      anchor: koWord && sound ? `${koWord}의 ${sound}` : null,
      known: st ? st.knows_meaning : null,
    };
  });
  const anchored = items.filter((i) => i.anchor);
  const bare = items.filter((i) => !i.anchor);
  const where = input.meta.example ? "이 기사에서" : input.title ? `${input.title.slice(0, 12)}에서` : "이 자료에서";

  return (
    <Screen where={where} up="/today" aside={`한자 ${found.length}개`}>
      <Space h={28} />
      <JudgeRows inputId={input.id} anchored={anchored} bare={bare} empty={found.length === 0} />
    </Screen>
  );
}
