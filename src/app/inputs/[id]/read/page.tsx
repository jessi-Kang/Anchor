import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getInput, saveInputReadings } from "@/lib/db/inputs";
import { inputProgress, freshKanji } from "@/lib/cards/progress";
import { withParticle } from "@/lib/ko";
import { kanjiRuns } from "@/lib/kanji/extract";
import { getFurigana } from "@/lib/kanji/furigana";
import { isDesignPreview } from "@/lib/design-preview";
import { inputName } from "@/lib/input-name";
import { Screen, Space, uiStyles as s } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { MetText } from "@/components/met-text";
import { runStates } from "@/lib/kanji/runs";
import { finishRead } from "@/app/inputs/[id]/actions";

export const dynamic = "force-dynamic";

const PREVIEW = {
  name: "아침 기사",
  body: "トヨタとNTT、協力して次世代の車を開発。両社は20日、協力して車のデータ基盤を作ると発表した。条件をめぐって妥協が必要だったという。",
  /*
    참고 화면과 같은 상태 (design/screens/F12.html). **참고를 열어 틴트를 세어 넣는다** — 참고가
    틴트하는 것은 `協力 · 協力 · 基 · 協` 넷이라 만난 글자는 `協 力 基` 셋이고, 아래 한 줄이
    `새로 배울 건 妥 하나뿐.` 인 것과 들어맞는다.

    **전에는 `基` 가 어느 쪽에도 없었다.** `met` 에서 빼 놓고 `fresh` 에도 안 넣어서, 화면에서
    그 글자만 「만난 것」도 「새로 배울 것」도 아닌 게 됐다 — 참고는 제 안에서 맞는데 **붙박이
    값이 스스로 어긋나 있었다.** 주석이 "基·妥 는 아직" 이라고 적혀 있던 것이 참고를 잘못 읽은
    자리다 — 어느 쪽인지는 눈이 아니라 db/seed/kanji-ko.json 이 정한다.
  */
  met: new Set(["協", "力", "基"]),
  fresh: ["妥"],
  sounds: new Map([["妥", "타"], ["協", "협"], ["力", "력"], ["基", "기"]]),
  /*
    **읽기도 붙박이 값이다.** 없으면 이 화면은 ruby 를 한 글자도 못 그리는데, ruby 가 빠지면
    줄 높이가 줄고 **줄바꿈 자리가 달라져 본문이 통째로 어긋나** 보인다 — 자리 문제로 읽히지만
    자리 문제가 아니다. 키가 있느냐와도 상관없다: 미리보기는 `getFurigana` 까지 가지도 않는다.

    **값은 참고에서 읽었다.** `kanjiRuns(body)` 와 길이·순서가 같아야 하는데(14개), 열린 상태를
    그린 `design/screens/F12a.html` 이 그 열넷을 같은 차례로 다 적어 두었다. 그래서 지어낸 값이
    하나도 없다 — 틴트 때문에 F12 에서 가려지는 `協力` 의 `きょうりょく` 까지 거기 있다.

    `車` 가 두 번 다 `くるま` 인 것이 이 값이 사전 음이 아니라 **그 문장에서 실제로 읽히는 소리**
    라는 표시다 (아래 실제 경로의 같은 주석).
  */
  readings: [
    "きょうりょく", "じせだい", "くるま", "かいはつ", "りょうしゃ", "か", "きょうりょく",
    "くるま", "きばん", "つく", "はっぴょう", "じょうけん", "だきょう", "ひつよう",
  ],
};

/**
 * `/inputs/[id]/read` — F12 재만남. 뼈대·문구는 design/screens/F12.html.
 * 넣었던 자료를 **다시 읽는** 화면이다. 상단 라벨 → F03(그 자료), 주 버튼 "읽기 끝" → 홈.
 *
 * 이 화면이 원칙 4("복습은 카드 반복이 아니라 다음 인풋에서의 재만남")가 실제로 일어나는 자리고,
 * 검증 기준("2주 후 **자료** 재만남 인식률 70%", docs/SPEC.md 9장)을 재려면 이 화면이 있어야
 * 한다. 예문 재만남은 합치지 않고 옆에 나란히 낸다 (docs/MEASURE.md 1장).
 *
 * **틴트의 기준은 "이 자료에서 이미 만났는가" 하나다** (docs/FLOW.md 1′장 F12 행) — F03 에서
 * 알아로 고른 것과 카드를 끝낸 것. 맞혔는지는 안 본다. `inputProgress` 의 `anchors` 가 바로 그
 * 집합이라(판정된 것 중 아는 것) 새로 만들지 않고 그대로 쓴다. 틴트가 말하는 것은 "아는 것" 이
 * 아니라 **"새로 배울 것이 아니다"** 이고, 개수 한 줄은 **진한 것만** 센다.
 */
export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fixed?: string }>;
}) {
  const { id } = await params;
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let name = PREVIEW.name;
  let body = PREVIEW.body;
  let met = PREVIEW.met;
  let fresh = PREVIEW.fresh;
  let readings: string[] | undefined = PREVIEW.readings;
  let sounds = PREVIEW.sounds;
  // 이 자료에서 **착지한 순서대로** 쌓인 한자 (`inputProgress` 가 `landed_at` 으로 정렬해 준다).
  // 미리보기는 빈 채로 둔다 — 아래에서 지금까지와 같은 줄로 떨어진다.
  let landed: string[] = [];

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const input = await getInput(user.id, id);
    if (!input) notFound();
    // 일본어 자료만 한자가 있다. 다른 언어는 재만남이 다음 단계라 그 자료의 뽑기로 돌려보낸다.
    if (input.lang !== "ja") redirect(`/inputs/${id}`);

    const prog = await inputProgress(user.id, input);
    name = inputName(input);
    body = input.body;
    met = prog.anchors;
    landed = prog.landedKanji;
    fresh = freshKanji(prog);
    sounds = new Map(prog.nodes.map((n) => [n.key, n.meta.ko_sound ?? ""]));

    // 읽기는 한 번만 만들고 자료에 굳힌다. 사전 음이 아니라 이 문장에서 실제로 읽히는 소리다 —
    // 같은 이유로 F04 도 그렇게 한다(車 는 次世代の車 에서 "くるま" 다).
    readings = input.meta.readings;
    if (!readings && kanjiRuns(body).length) {
      const made = await getFurigana(body);
      if (made) {
        readings = made;
        await saveInputReadings(user.id, id, made).catch((e) => console.error("[F12] 읽기 저장 실패", e));
      }
    }
  }

  // 읽기·한국어 낱말·아래 한 줄이 모두 이 한 계산에서 나온다.
  const runs = runStates(body, met);
  /*
    **섞인 낱말은 「안 만난 글자」가 아니라 「셀 수 있는 새 글자」로 가른다.**

    `RunState.fresh` 는 그냥 met 에 없는 글자라 **노드가 없는 글자까지 들어온다.** 그 값으로
    고르면 `基盤` 이 섞인 낱말이 되어 아래 한 줄이 `基盤, 기는 방금 봤지` 가 되는데, 바로 밑
    개수 줄은 `새로 배울 건 妥 하나뿐` 이라고 말한다 — 한 카드의 두 줄이 서로 다른 낱말을
    가리킨다(`盤` 은 `freshKanji` 가 세지 않으니 배울 것에 없다).

    참고가 그 답을 이미 그려 놨다: `design/screens/F12.html` 은 `基` 를 틴트하면서도 아래 줄을
    `妥協, 협은 방금 봤지` 로 짚는다. 그러니 기준은 **개수 줄이 세는 그 목록**(`fresh`)이다.
    두 줄이 같은 값을 보면 갈릴 자리가 없어진다.
  */
  const counted = new Set(fresh);
  const mixed = runs.find((r) => r.met.length > 0 && r.chars.some((c) => counted.has(c))) ?? null;
  /*
    한국어 낱말이 붙는 낱말. 섞인 낱말이 있으면 그것 — 위 한 줄이 짚은 낱말이라 딴 낱말의 한국어를
    붙이면 화면이 두 낱말을 말하게 된다. 섞인 낱말은 `allMet` 이 거짓이라 아래에서 걸러진다.

    섞인 낱말이 없으면(=이 자료를 다 만났으면) **방금 푼 한자가 든 낱말**을 짚는다. 이 자리가
    없으면 한국어 낱말은 보이는 조건이 아예 없는 값이 된다 — "전부 만났을 때만 보인다" 를 늘 가리는
    것으로 지키는 건 규칙을 지킨 게 아니라 피한 것이다 (docs/FLOW.md 1′장 F12 행).

    **전에는 "문장에서 마지막으로 다 만난 낱말" 이었다.** 주석은 "그게 방금까지 섞인 낱말이던 그
    낱말이라서" 라고 적어 뒀는데 **코드는 그 일을 안 했다** — 문서 순서상 마지막을 고를 뿐이라,
    방금 푼 낱말이 문장 끝에 있을 때만 우연히 맞았다. 참고 자료에서 妥 를 풀어도 화면은 妥協 가
    아니라 文章 끝의 必要 를 냈다. 한국어 낱말은 **앵커를 부르는 값**이라(원칙 2) 부를 게 있는 쪽은
    방금 푼 낱말이지 오래전부터 알던 낱말이 아니다.

    그래서 착지한 순서를 **뒤에서부터** 훑어 그 한자가 든 낱말을 찾는다. 못 찾으면(착지가 아예
    없거나, 착지한 글자가 다 만난 낱말에 안 들었으면) 옛 규칙으로 떨어진다 — 지금 나오던 자리에서
    아무것도 사라지지 않는다.
  */
  const whole = runs.filter((r) => r.chars.length > 1 && r.allMet);
  const justSolved = [...landed].reverse().flatMap((k) => whole.filter((r) => r.chars.includes(k)))[0] ?? null;
  const wordRun = mixed ?? justSolved ?? [...whole].reverse()[0] ?? null;
  // 글자마다의 한국 한자음을 이어 만든다(妥協 → 타 + 협). 소리를 하나라도 모르면 만들지 않는다 —
  // 낱말의 한국어 낱말(協.ko_word 는 "협력")을 끌어다 쓰면 그 낱말의 말이 아니게 된다.
  const korean =
    wordRun && wordRun.allMet && wordRun.chars.every((c) => sounds.get(c)) ? wordRun.chars.map((c) => sounds.get(c)).join("") : null;

  return (
    <Screen where={name} up={`/inputs/${id}`} aside={preview ? "점심 12:37" : nowKST()} fixed={fixed === "1"}>
      <Space h={20} />
      {/*
        본문부터 "읽기 끝" 까지가 한 덩어리다. 어느 덩어리를 열었는지는 브라우저만 알고, 그 값이
        버튼을 누를 때 한 번에 기록으로 나간다 — 그래서 둘을 한 컴포넌트가 들고 있다.
        화면을 그냥 떠나면 아무것도 안 적는다. 반쯤 읽은 것을 판정으로 만들지 않는다
        (docs/MEASURE.md 1장, PM 결정).
      */}
      <MetText
        body={body}
        name={name}
        met={met}
        readings={readings}
        doneLabel="읽기 끝"
        onDone={preview ? undefined : finishRead.bind(null, id)}
      >
      <div className={s.metFoot}>
        {/*
          이미 만난 글자를 짚어 주는 한 줄. 한 낱말 안에 만난 것과 아직인 것이 같이 있는 자리를 고른다 —
          "妥協, 협은 방금 봤지" 가 이 화면이 하려는 말 그대로다.
        */}
        {/*
          **부를 소리가 없으면 이 줄을 아예 안 낸다.** 전에는 `sounds.get(...) ?? mixed.met[0]` 이라
          한국 한자음이 없는 글자(2,136자 중 `枠` 한 자, 일본 국자다)에서 **"妥協, 는 방금 봤지"** 가 떴다 —
          주어가 비고 조사만 남은 문장이다. `sounds` 가 없는 값을 `""` 로 채워서 `??` 가 안 걸렸다.

          글자로 떨어뜨리는 것도 답이 아니다. 한국어 문장 안에 일본 글자를 넣는 것이고, 조사를 고를
          소리가 없어 `withParticle` 도 찍을 수 없다 — Scene2 의 `pt.name ?? pt.ch` 와 같은 자리다.
          **짚을 수 없으면 안 짚는다.** 아래 개수 한 줄이 남아 화면이 비지 않는다.
        */}
        {mixed && sounds.get(mixed.met[0]) && (
          <span className={s.metFootWord}>
            {mixed.text}, {withParticle({ text: sounds.get(mixed.met[0]) as string, sound: null }, "은는")} 방금 봤지
          </span>
        )}
        <span className={s.metFootLine}>
          {/*
            **한국어 낱말은 그 낱말의 한자를 전부 만났을 때만 보이고, 전부 만났으면 보인다.**
            읽기를 가리는 것과 같은 판단이고(`allMet`), 같은 값에서 나온다. 妥 카드의 후킹이
            "타협의 타" 라서 미리 보여 주면 읽기는 가려 놓고 다음 카드의 앵커를 주는 꼴이 되고,
            다 만난 뒤에도 가리면 이제 줄 것이 없는 말을 안 하는 것이다.
            개수는 셋으로 갈린다 — 0개 / 1개 / 여럿. 0개일 때도 블록을 숨기지 않는다.
          */}
          {korean && `${korean}. `}
          {fresh.length === 0
            ? "새로 배울 건 없어. 다 만난 글자야."
            : fresh.length === 1
              ? `새로 배울 건 ${fresh[0]} 하나뿐.`
              : `새로 배울 건 ${fresh.length}개.`}
        </span>
      </div>
      </MetText>
    </Screen>
  );
}
