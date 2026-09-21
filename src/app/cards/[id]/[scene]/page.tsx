import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getCard, type CardPayload } from "@/lib/db/cards";
import { judgedKanji } from "@/lib/db/kanji";
import { cardContext } from "@/lib/cards/progress";
import { landingWords } from "@/lib/cards/landing";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Label, Lead, Card, Grow, Button, Ghost, Mark, Ja, rubyKanji, uiStyles as s } from "@/components/ui";
import { iGa, withParticle } from "@/lib/ko";
import { GuessForm } from "./guess-form";
import { LandingButtons } from "./landing-buttons";

export const dynamic = "force-dynamic";

const PREVIEW: CardPayload = {
  kanji: "協",
  reading: "きょう",
  sound: "협",
  anchor: "협력",
  parts: [
    { ch: "十", name: "열 십", count: 1 },
    { ch: "力", name: "힘 력", count: 3 },
  ],
  parts_meaning: "열 사람의 힘",
  question: "열 사람이 힘을 모으면\n무슨 뜻이 될까?",
  answer: "힘을 합쳐 돕다",
  landing: [
    { word: "協力", reading: "きょうりょく", ko: "협력" },
    { word: "妥協", reading: "だきょう", ko: "타협" },
  ],
  pattern: "ㅂ 받침은 장음 う로 끝나. 협 きょう, 십 じゅう, 업 ぎょう",
  source: { sentence: "トヨタとNTT、協力して", word: "協力" },
  content_source: "authored",
};

/** 단어 안에서 한 음절(협)만 배경 틴트 */
function markSyllable(word: string, mark: string) {
  const i = word.indexOf(mark);
  if (i < 0) return <>{word}</>;
  return (
    <>
      {word.slice(0, i)}
      <Mark>{mark}</Mark>
      {word.slice(i + mark.length)}
    </>
  );
}

function markKanji(word: string, kanji: string) {
  return markSyllable(word, kanji);
}

/**
 * `/cards/[id]/1..5` — 발견 5장면. 한 장면 = 한 화면, 합치지 않는다 (CLAUDE.md).
 *  1 아는 단어 → 2 부품 → 3 내가 먼저 추측 → 4 정답 → 5 아는 단어로 착지 (+패턴 한 줄)
 * 추측(3)을 안 했으면 4·5 로 바로 못 간다: 3 으로 돌려보낸다. 상단 라벨 → 카드 출처(F04).
 */
export default async function ScenePage({ params, searchParams }: { params: Promise<{ id: string; scene: string }>; searchParams: Promise<{ fixed?: string }> }) {
  const { id, scene: rawScene } = await params;
  const { fixed } = await searchParams;
  const scene = Number(rawScene);
  if (!(scene >= 1 && scene <= 5)) notFound();

  const preview = isDesignPreview();
  let p: CardPayload = PREVIEW;
  let where = "카드 1 / 4";
  let guess = "힘을 합친다";
  // 착지 낱말을 거르는 기준. 참고 화면과 같은 상태로 둔다: 力 은 만났고 妥 는 아직이라
  // 協力 만 남는다 (design/screens/Scene5.html).
  let met = new Set(["力"]);

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const card = await getCard(user.id, id);
    if (!card) notFound();
    if (scene >= 4 && !card.revealed_at) redirect(`/cards/${id}/3`);
    // 반대쪽도 막는다. 정답을 본 뒤 Scene3 으로 돌아오면 빈 추측 칸이 다시 서서 "저장이 안 됐나" 로
    // 읽힌다. 쓴 값이 지워지지는 않지만(saveGuess 가 revealed_at IS NULL 일 때만 쓴다) 화면이
    // 거짓을 말한다. 추측이 끝난 카드에서 Scene3 은 할 일이 없으므로 정답으로 보낸다.
    if (scene === 3 && card.revealed_at) redirect(`/cards/${id}/4`);
    const ctx = await cardContext(user.id, card);
    p = card.payload;
    where = ctx.where;
    // 자료가 아니라 계정 전체를 본다 — 다른 기사에서 이미 푼 글자도 만난 글자다 (lib/db/kanji.ts).
    met = await judgedKanji(user.id);
    guess = card.guess ?? "";
  }

  const up = `/cards/${id}`;
  const common = { where, up, fixed: fixed === "1", progress: [scene + 1, 6] as [number, number] };
  const next = (n: number) => (preview ? `/cards/preview/${n}` : `/cards/${id}/${n}`);

  if (scene === 1) {
    /*
      **자리는 그대로 서고 담기는 것만 바뀐다** (design/screens/Scene1.html · Scene1a.html).
      부를 낱말이 있으면 낱말을 내고 그 안의 한 음절에만 틴트를 씌운다(협**력**의 `협`).
      없으면 **소리 한 글자**를 틴트 없이 낸다 — 음절이 하나뿐이면 틴트가 강조가 아니라 상자로
      읽힌다. 틴트의 일은 여럿 중 이것을 가리키는 것인데 견줄 나머지가 없다 (디자인 판정).

      물음은 양쪽이 같다. 이미 소리만 쓰고 있어서 새로 지을 말이 없다.
    */
    return (
      <Screen {...common}>
        <Grow />
        <div className={`${s.center} ${s.centerWide}`}>
          <Label>{p.anchor ? "늘 쓰는 단어" : "이미 아는 소리"}</Label>
          <Ja size="lg">{p.anchor ? markSyllable(p.anchor, p.sound) : p.sound}</Ja>
          <h1 className={s.ask}>
            이 {p.sound}, 한자로는
            <br />
            어떤 모양일까?
          </h1>
        </div>
        <Grow />
        <Button href={next(2)}>부품 보기</Button>
      </Screen>
    );
  }

  if (scene === 2) {
    const parts = p.parts.length ? p.parts : [{ ch: p.kanji, name: null, count: 1 }];
    const small = parts.length > 2;
    /*
      **이름 줄은 부를 이름이 다 있을 때만 낸다.**

      부품이 없는 한자(457자, 상용한자의 21%)는 위에서 그 한자 자신을 타일에 넣는데, 그러면
      이름 줄이 `pt.name ?? pt.ch` 로 **같은 글자를 또 찍었다.** 큰 타일에 上, 그 밑에 작게 上,
      그 아래 "上 한 글자" — 한 화면에 같은 글자가 셋이고 가운데 줄은 아무것도 안 알려 준다.
      글자를 이름 자리에 놓는 것은 이름을 대는 게 아니라 **이름이 없다는 걸 감추는 것**이다.

      이름이 하나라도 비면 줄 전체를 안 낸다 — 일부만 그리면 타일과 이름의 짝이 어긋나서
      **어느 이름이 어느 타일 것인지** 알 수 없게 된다. 빈 자리를 남기는 것도 같은 이유로 안 한다.

      남는 화면은 큰 타일 하나 + "上 한 글자" + 다음 장면의 "이 모양이면 무슨 뜻이 될까?" 다.
      (이게 Scene2 (나)안과 같은 그림인지는 **디자인이 정할 일이라 여기서 정하지 않았다.**)
    */
    const named = p.parts.length > 0 && parts.every((pt) => pt.name);
    return (
      <Screen {...common}>
        <Grow />
        <div className={`${s.center} ${s.centerWide}`} style={{ gap: 20 }}>
          <div className={s.parts}>
            {parts.map((pt, i) => (
              <div key={pt.ch + i} style={{ display: "contents" }}>
                {i > 0 && <span className={s.partPlus}>+</span>}
                <div className={`${s.partTile} ${small ? s.partTileSm : ""}`} lang="ja">
                  {rubyKanji(pt.ch)}
                  {pt.count > 1 && <span className={s.partBadge}>×{pt.count}</span>}
                </div>
              </div>
            ))}
          </div>
          {named && (
            <div className={s.partNames}>
              {parts.map((pt, i) => (
                <span key={pt.ch + i}>{pt.name}</span>
              ))}
            </div>
          )}
          <h1 className={s.ask}>{p.parts_meaning}</h1>
        </div>
        <Grow />
        <Button href={next(3)}>뜻 맞혀보기</Button>
      </Screen>
    );
  }

  if (scene === 3) {
    const [q1, q2] = p.question.split("\n");
    return (
      <Screen {...common}>
        <Grow />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 className={s.answer}>
            {q1}
            {q2 && (
              <>
                <br />
                {q2}
              </>
            )}
          </h1>
          <Lead>틀려도 돼. 떠오르는 대로.</Lead>
          {preview ? <input id="guess" className={s.guess} defaultValue={guess} readOnly /> : <GuessForm cardId={id} initial={guess} />}
        </div>
        <Grow />
        {preview && <Button href={next(4)}>확인</Button>}
      </Screen>
    );
  }

  if (scene === 4) {
    return (
      <Screen {...common}>
        <Grow />
        <div className={s.center}>
          <div className={s.answerTile}>
            <Ja size="xl">{p.kanji}</Ja>
          </div>
          <div className={s.reading} lang="ja">
            {p.reading}
          </div>
          <h1 className={s.answer}>{p.answer}</h1>
          {/*
            **판정 글자를 내지 않는다.** Scene3 이 "틀려도 돼. 떠오르는 대로." 라고 해 놓고 여기서
            "다름" 을 붙이면 약속하고 어기는 것이다. 색을 안 쓰고 빨간 줄을 안 그어도 글자가 이미
            판정이고, 영어 축(F14)은 같은 행동에 아무 판정도 안 낸다. 정답과 내 추측을 나란히 놓고 끝낸다.
            기록은 남는다 — 추측 정답률은 검증 항목이라(docs/SPEC.md 9장) 저장은 그대로 하고
            화면에서만 뺀다. 재는 것과 보여 주는 것은 다르다.
          */}
          {guess && (
            <Card tint style={{ padding: "12px 16px" }}>
              <div className={s.compare}>
                <span className={s.compareKey}>내 추측</span>
                <span className={s.compareGuess}>{guess}</span>
              </div>
            </Card>
          )}
        </div>
        <Grow />
        <Button href={next(5)}>어디에 쓰이지?</Button>
      </Screen>
    );
  }

  // scene 5
  /*
    **머리줄은 셋으로 갈린다. 카드에 뜨는 낱말은 어느 쪽이든 그대로다** — 바뀌는 건 h1 뿐이다.

    1. 부를 낱말이 **없는** 카드(둘째 묶음)면 **보여 주기만 한다**: `이 조가 여기 들어 있어`.
       착지 낱말(条件·条約)은 그대로 서지만 **안다는 말을 뺀다.** 뒤집힘의 정체가 "낱말을 대서" 가
       아니라 **"앱이 아직 못 골랐다고 해 놓고 사용자가 그 낱말을 안다고 말해서"** 라서다. 그래서
       착지 낱말이 남았는지가 아니라 **앵커가 있는지**로 가른다 — 디자인이 머리줄 넷을 그려 보고
       `이미 아는 단어에 条가 들어 있어` 는 착지 낱말이 있어도 뒤집힌다고 답했다
       (design/SCREENS.md "결 하나를 정하고 세 줄을 거기서 뽑는다" · "뒤집을 수 있나").
       Scene1 의 `이미 아는 소리` 를 그대로 이어받아 같은 실로 앉는다.
    2. 앵커는 있는데 **안전한 착지 낱말이 하나도 안 남았으면** 뜨는 것은 그 한자 하나뿐이라
       "이미 아는 단어에" 가 거짓이 된다. 그때만 `이미 아는 소리에 모양이 생겼어` 다.
    3. 나머지가 본래의 `이미 아는 단어에 協이 들어 있어`.
  */
  const landing = landingWords(p, met);
  return (
    <Screen {...common}>
      <Grow />
      <Label as="h1">
        {!p.anchor ? (
          // 소리는 한글이라 조사를 글자에서 센다 — `건` 이면 "이 건이 여기 들어 있어" 다.
          `이 ${p.sound}${iGa(p.sound)} 여기 들어 있어`
        ) : landing.landed ? (
          <>이미 아는 단어에 {withParticle({ text: p.kanji, sound: p.sound }, "이가")} 들어 있어</>
        ) : (
          "이미 아는 소리에 모양이 생겼어"
        )}
      </Label>
      <Space h={10} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {landing.words.map((w) => (
          <Card key={w.word}>
            <div className={s.landing}>
              <div className={s.landingWord}>
                <Ja size="md">{markKanji(w.word, p.kanji)}</Ja>
                <span className={s.landingRuby} lang="ja">
                  {w.reading}
                </span>
              </div>
              <span className={s.landingKo}>{w.ko}</span>
            </div>
          </Card>
        ))}
      </div>
      {p.pattern && (
        <>
          <Space h={14} />
          <Card tint style={{ padding: "12px 16px" }}>
            <div className={s.patternLine}>
              <span className={s.patternKey}>패턴</span>&nbsp; {p.pattern}
            </div>
          </Card>
        </>
      )}
      <Grow />
      {preview ? (
        <>
          <Button href="/cards/preview/speak">소리 내서 말해보기</Button>
          <Ghost href="/graph">다음 한자로</Ghost>
        </>
      ) : (
        <LandingButtons cardId={id} />
      )}
    </Screen>
  );
}
