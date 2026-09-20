import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getCard } from "@/lib/db/cards";
import { cardContext } from "@/lib/cards/progress";
import { isDesignPreview } from "@/lib/design-preview";
import { eunNeun } from "@/lib/ko";
import { Screen, Label, Lead, Grow, Button, Mark, rubyKanji, uiStyles as s } from "@/components/ui";
import { markWord, nowKST } from "@/components/card-bits";

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
          <Label>오늘 아침 기사에서</Label>
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
  const label = ctx.input?.meta.example ? "오늘 아침 기사에서" : ctx.input?.title ? `${ctx.input.title.slice(0, 14)}에서` : "내 자료에서";

  return (
    <Screen where={ctx.where} up={card.input_id ? `/inputs/${card.input_id}` : "/today"} aside={nowKST()} progress={[1, 6]}>
      <Grow />
      <div className={s.center}>
        <Label>{label}</Label>
        <h1 className={s.source} lang="ja">
          {src ? markWord(src.sentence, src.word) : <Mark>{rubyKanji(p.kanji)}</Mark>}
        </h1>
        <Lead>
          {p.hook.word}
          {eunNeun(p.hook.word)} 알아. {p.kanji}만 모르지.
        </Lead>
      </div>
      <Grow />
      <Button href={`/cards/${card.id}/1`}>{p.hook.mark}부터 풀어보기</Button>
    </Screen>
  );
}
