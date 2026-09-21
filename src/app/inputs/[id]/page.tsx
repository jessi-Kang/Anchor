import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getInput, markExtracted } from "@/lib/db/inputs";
import { getKanjiNodes, getKanjiStates } from "@/lib/db/kanji";
import { extractKanji } from "@/lib/kanji/extract";
import { isDesignPreview } from "@/lib/design-preview";
import { LANG_LABEL } from "@/lib/languages";
import { Screen, Space, Title, Lead, Grow, Button } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { inputName } from "@/lib/input-name";
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

  const chars = extractKanji(input.body);
  const nodes = await getKanjiNodes(chars);
  const found = chars.filter((c) => nodes.has(c));
  const states = await getKanjiStates(
    user.id,
    found.map((c) => nodes.get(c)!.id),
  );
  if (!input.extracted_at) await markExtracted(user.id, input.id, found);

  /*
    판정하는 자리에는 발판을 주되 **가장 적게** 준다 (docs/FLOW.md 4장):
    낱말이 있으면 낱말을(協 · 협력의 협), 없으면 **한국 한자음만**(先 · 선).
    소리만 주는 쪽이 낱말까지 주는 쪽보다 덜 주는 것이다 — 소리를 받은 사용자는 선생·우선·선배를
    스스로 부른다. 우리가 낱말을 대는 것보다 원칙 1 에 가깝다. 결정은 커밋 `00f3b7b` 에 있었는데
    코드가 안 따라와 있었다: 낱말과 소리를 **둘 다** 요구해서, 소리가 있는데도 1,480자를
    "아직 아는 소리가 없음" 으로 부르고 있었다. 아는 사람을 모르는 사람으로 부른 것이다.
    한국 한자음은 2,136자 중 2,130자에 있다. 없는 것은 소리가 아니라 낱말이다.
  */
  const items: JudgeItem[] = found.map((c) => {
    const n = nodes.get(c)!;
    const st = states.get(n.id);
    const koWord = n.meta.ko_word;
    const sound = n.meta.ko_sound;
    return {
      nodeId: n.id,
      kanji: c,
      // 한국 한자음조차 없는 여섯 자(枠 같은 국자)는 부제를 비운다. 없는 것을 지어내지 않는다.
      sub: koWord && sound ? `${koWord}의 ${sound}` : (sound ?? null),
      // 두 묶음을 가르는 축은 **낱말 하나**다. 소리는 양쪽 다 있다 (docs/FLOW.md 1장 F03 행).
      hasWord: Boolean(koWord && sound),
      known: st ? st.knows_meaning : null,
    };
  });
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
