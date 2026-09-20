import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getCard, type CardPayload } from "@/lib/db/cards";
import { cardContext } from "@/lib/cards/progress";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Label, Lead, Card, Grow, Button, Mark, Ja, uiStyles as s } from "@/components/ui";
import { GuessForm } from "./guess-form";
import { LandingButtons } from "./landing-buttons";

export const dynamic = "force-dynamic";

const PREVIEW: CardPayload = {
  kanji: "協",
  reading: "きょう",
  hook: { word: "협력", mark: "협" },
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
  let verdict = "거의 맞음";

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const card = await getCard(user.id, id);
    if (!card) notFound();
    if (scene >= 4 && !card.revealed_at) redirect(`/cards/${id}/3`);
    const ctx = await cardContext(user.id, card);
    p = card.payload;
    where = ctx.where;
    guess = card.guess ?? "";
    verdict = (card.payload as CardPayload & { verdict?: string }).verdict ?? "";
  }

  const up = `/cards/${id}`;
  const common = { where, up, fixed: fixed === "1", progress: [scene + 1, 6] as [number, number] };
  const next = (n: number) => (preview ? `/cards/preview/${n}` : `/cards/${id}/${n}`);

  if (scene === 1) {
    return (
      <Screen {...common}>
        <Grow />
        <div className={`${s.center} ${s.centerWide}`}>
          <Label>늘 쓰는 단어</Label>
          <Ja size="lg">{markSyllable(p.hook.word, p.hook.mark)}</Ja>
          <div className={s.ask}>
            이 {p.hook.mark}, 한자로는
            <br />
            어떤 모양일까?
          </div>
        </div>
        <Grow />
        <Button href={next(2)}>부품 보기</Button>
      </Screen>
    );
  }

  if (scene === 2) {
    const parts = p.parts.length ? p.parts : [{ ch: p.kanji, name: null, count: 1 }];
    const small = parts.length > 2;
    return (
      <Screen {...common}>
        <Grow />
        <div className={`${s.center} ${s.centerWide}`} style={{ gap: 20 }}>
          <div className={s.parts}>
            {parts.map((pt, i) => (
              <div key={pt.ch + i} style={{ display: "contents" }}>
                {i > 0 && <span className={s.partPlus}>+</span>}
                <div className={`${s.partTile} ${small ? s.partTileSm : ""}`} lang="ja">
                  {pt.ch}
                  {pt.count > 1 && <span className={s.partBadge}>×{pt.count}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className={s.partNames}>
            {parts.map((pt, i) => (
              <span key={pt.ch + i}>{pt.name ?? pt.ch}</span>
            ))}
          </div>
          <div className={s.ask}>{p.parts_meaning}</div>
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
          <div className={s.answer}>
            {q1}
            {q2 && (
              <>
                <br />
                {q2}
              </>
            )}
          </div>
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
          <div className={s.answer}>{p.answer}</div>
          {guess && (
            <Card tint style={{ padding: "12px 16px" }}>
              <div className={s.compare}>
                <span className={s.compareKey}>내 추측</span>
                <span className={s.compareGuess}>{guess}</span>
                {verdict && <span className={s.compareVerdict}>{verdict}</span>}
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
  return (
    <Screen {...common}>
      <Grow />
      <Label>이미 아는 단어에 {p.kanji}이 들어 있어</Label>
      <Space h={10} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(p.landing.length ? p.landing : [{ word: p.kanji, reading: p.reading, ko: p.hook.word }]).map((w) => (
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
        <Button href="/cards/preview/speak">소리 내서 말해보기</Button>
      ) : (
        <LandingButtons cardId={id} />
      )}
    </Screen>
  );
}
