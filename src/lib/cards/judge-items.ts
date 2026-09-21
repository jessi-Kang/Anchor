import { getKanjiNodes, getKanjiStates } from "@/lib/db/kanji";
import { extractKanji } from "@/lib/kanji/extract";

/**
 * 자료 하나의 한자를 뽑기(F03)가 쓰는 모양으로 세운다.
 *
 * **여기 있는 이유는 줄 순서다.** F03 의 주 버튼("協부터")과 F04a 의 "다음 글자" 는 **같은 줄**을
 * 가리켜야 한다. 두 화면이 각자 고르면 카드를 못 만든 날 F04a 가 F03 과 다른 글자를 내밀고,
 * 사용자는 자기가 아까 본 목록이 아닌 것을 보게 된다.
 */
export type JudgeItem = {
  nodeId: string;
  kanji: string;
  /** 행 부제. 낱말이 있으면 "협력의 협", 없으면 한국 한자음 한 글자("선"), 그것도 없으면 null */
  sub: string | null;
  /** 이 글자를 부를 한국어 낱말을 우리가 골라 뒀는가. **두 묶음을 가르는 축이 이것이다** */
  hasWord: boolean;
  /**
   * 한국 한자음이 있는가 — **카드가 설 수 있는가**. 2,136자 중 `枠` 한 자에만 없다(일본 국자).
   * 전에는 여섯이었다. 나머지 다섯(収 塡 頰 𠮟 剝)은 KANJIDIC2 가 제 항목에서 정자로 링크를
   * 걸어 두었는데 빌드가 그 링크를 안 따라갔던 것이다 (`scripts/kanji/build-kanjidic.ts`).
   * 판정(알아/몰라)은 발판 없이도 되므로 **행은 그대로 서고**, 카드 큐에서만 빠진다.
   */
  hasSound: boolean;
  known: boolean | null;
};

/**
 * `seen` 은 자료에서 **뽑아낸** 한자 전부, `found` 는 그중 **우리가 아는** 것이다.
 *
 * 둘을 갈라 돌려주는 이유 하나뿐이다 — 화면이 **"한자가 없다"** 와 **"우리가 아직 그 한자를
 * 모른다"** 를 다르게 말해야 하기 때문이다. `found` 만 돌려주던 때 F03 은 둘을 같은 것으로 보고
 * 자료에 한자가 열아홉이어도 "이 자료엔 한자가 없어" 라고 했다. 없는 것은 자료의 한자가 아니라
 * 우리 쪽 행이었다.
 */
export async function judgeItems(
  userId: string,
  body: string,
): Promise<{ seen: string[]; found: string[]; items: JudgeItem[] }> {
  const chars = extractKanji(body);
  const nodes = await getKanjiNodes(chars);
  const found = chars.filter((c) => nodes.has(c));
  const states = await getKanjiStates(
    userId,
    found.map((c) => nodes.get(c)!.id),
  );

  /*
    판정하는 자리에는 발판을 주되 **가장 적게** 준다 (docs/FLOW.md 4장):
    낱말이 있으면 낱말을(協 · 협력의 협), 없으면 **한국 한자음만**(先 · 선).
    소리만 주는 쪽이 낱말까지 주는 쪽보다 덜 주는 것이다 — 소리를 받은 사용자는 선생·우선·선배를
    스스로 부른다. 우리가 낱말을 대는 것보다 원칙 1 에 가깝다. 결정은 커밋 `00f3b7b` 에 있었는데
    코드가 안 따라와 있었다: 낱말과 소리를 **둘 다** 요구해서, 소리가 있는데도 1,483자를
    "아직 아는 소리가 없음" 으로 부르고 있었다. 아는 사람을 모르는 사람으로 부른 것이다.
    한국 한자음은 2,136자 중 2,135자에 있다. 없는 것은 소리가 아니라 낱말이다.
  */
  const items: JudgeItem[] = found.map((c) => {
    const n = nodes.get(c)!;
    const st = states.get(n.id);
    const koWord = n.meta.ko_word;
    const sound = n.meta.ko_sound;
    return {
      nodeId: n.id,
      kanji: c,
      // 한국 한자음조차 없는 한 자(`枠` — 일본 국자라 한국어가 읽을 소리가 없다)는 부제를 비운다.
      // 없는 것을 지어내지 않는다.
      sub: koWord && sound ? `${koWord}의 ${sound}` : (sound ?? null),
      // 두 묶음을 가르는 축은 **낱말 하나**다. 소리는 양쪽 다 있다 (docs/FLOW.md 1장 F03 행).
      hasWord: Boolean(koWord && sound),
      hasSound: Boolean(sound),
      known: st ? st.knows_meaning : null,
    };
  });
  return { seen: chars, found, items };
}

/**
 * 다음에 카드로 만들 한자. 아는 낱말이 있는 줄이 먼저고, 그다음이 부를 낱말이 없는 줄이다
 * (F03 의 묶음 순서와 같다). "알아" 로 내려간 줄은 큐에 없다.
 *
 * `skip` 은 **이번에 문안을 못 만든 한자**다. 다시 내밀면 F04a 가 같은 글자를 "다음 글자" 라고
 * 부르게 되고, 눌러도 또 못 만들어 제자리를 돈다. 저장하지는 않는다 — 주소로만 다닌다
 * (design/SCREENS.md "실패를 저장하지 않는다").
 *
 * **소리 없는 글자는 아예 안 내민다.** 발판이 없으면 카드가 못 서니(`app/inputs/[id]/actions.ts`)
 * 내밀어 봐야 F04a 로 되돌아온다. 될 리 없는 것을 "다음 글자" 라고 부르지 않는다.
 */
export function nextKanji(items: JudgeItem[], skip: string[] = []): string | null {
  const open = items.filter((i) => i.known !== true && i.hasSound && !skip.includes(i.kanji));
  return (open.find((i) => i.hasWord) ?? open[0])?.kanji ?? null;
}
