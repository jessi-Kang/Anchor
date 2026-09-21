import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getCard } from "@/lib/db/cards";
import { cardContext } from "@/lib/cards/progress";
import { isDesignPreview } from "@/lib/design-preview";
import { eunNeun } from "@/lib/ko";
import { Screen, Label, Lead, Grow, Button, Mark, rubyKanji, uiStyles as s } from "@/components/ui";
import { markWord, nowKST } from "@/components/card-bits";
import { inputFrom } from "@/lib/input-name";

export const dynamic = "force-dynamic";

/**
 * `/cards/[id]` — F04 카드 출처. 자료 문장에서 그 한자가 든 단어를 강조. "협력은 알아. 協만 모르지."
 * 상단 라벨 "카드 n / N" → 자료(F03). 진행 막대 1/6.
 */
export default async function CardSourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fixed?: string }> }) {
  const { id } = await params;
  const { fixed } = await searchParams;

  if (isDesignPreview()) {
    return (
      <Screen where="카드 1 / 4" up="/today" aside="점심 12:30" progress={[1, 6]} fixed={fixed === "1"}>
        <Grow />
        <div className={s.center}>
          <Label>아침 기사에서</Label>
          <h1 className={s.source} lang="ja">
            {markWord("トヨタとNTT、協力して", "協力")}
          </h1>
          <Lead>협력은 알아. 協만 모르지.</Lead>
        </div>
        <Grow />
        <Button href="/cards/preview/1">협부터 풀어보기</Button>
      </Screen>
    );
  }

  const user = await currentUser();
  if (!user) redirect("/");
  const card = await getCard(user.id, id);
  if (!card) notFound();
  const ctx = await cardContext(user.id, card);
  const p = card.payload;
  const src = p.source;
  // 출처를 대는 문장이라 조사를 붙인다 ("아침 기사에서"). 이름 자체는 lib/input-name.ts 한 곳에서 온다.
  const label = inputFrom(ctx.input);

  return (
    <Screen where={ctx.where} up={card.input_id ? `/inputs/${card.input_id}` : "/today"} aside={nowKST()} progress={[1, 6]}>
      <Grow />
      <div className={s.center}>
        <Label>{label}</Label>
        <h1 className={s.source} lang="ja">
          {src ? markWord(src.sentence, src.word, src.readings) : <Mark>{rubyKanji(p.kanji)}</Mark>}
        </h1>
        {/*
          **부를 낱말이 있으면 낱말로, 없으면 소리로.** 문안을 새로 짓지 않고 같은 문장의 한 자리만
          바꾼다 — "협력은 알아. 協만 모르지." / "조는 알아. 条만 모르지."

          소리 쪽이 F03 을 안 뒤집는 이유: 뒤집힘은 낱말이 화면에 있어서가 아니라 **앱이 아직 못
          골랐다고 해 놓고 그 낱말을 사용자가 안다고 말해서** 생긴다. 한국 한자음은 원칙 2 가
          사용자의 것이라고 보장한 값이고 앱이 고른 것이 아니다 (design/SCREENS.md 표).
        */}
        <Lead>
          {p.anchor ?? p.sound}
          {eunNeun(p.anchor ?? p.sound)} 알아. {p.kanji}만 모르지.
        </Lead>
      </div>
      <Grow />
      {/* 주 버튼은 낱말이 있든 없든 **소리**를 부른다 — Scene1 이 그 소리로 서기 때문이다. */}
      <Button href={`/cards/${card.id}/1`}>{p.sound}부터 풀어보기</Button>
    </Screen>
  );
}
