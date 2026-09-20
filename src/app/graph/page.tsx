import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getCard } from "@/lib/db/cards";
import { cardContext, nextCandidates } from "@/lib/cards/progress";
import { isDesignPreview } from "@/lib/design-preview";
import { eulReul, iGa } from "@/lib/ko";
import { Screen, Space, Title, Lead, Card, Grow, Button, Ghost, uiStyles as s } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { NextCard } from "./next-card";

export const dynamic = "force-dynamic";

type GraphData = { center: string; known: string[]; next: string[] };

/** 그래프 1장: 가운데 오늘 켜진 한자, 위에 아는 부품(최대 2), 아래 다음 후보(최대 2). 범례 항상. */
function Graph({ g }: { g: GraphData }) {
  const top = [78, 238];
  const bottom = [78, 238];
  return (
    <svg width="316" height="236" viewBox="0 0 316 236" role="img" aria-label={`${g.center}이 켜지고 ${g.next.join("·")}가 다음으로 뜬 그래프`} style={{ maxWidth: "100%" }}>
      {g.known.slice(0, 2).map((k, i) => (
        <line key={`ke${k}`} x1={158} y1={112} x2={g.known.length === 1 ? 158 : top[i]} y2={40} stroke="var(--graph-edge-known)" strokeWidth={3} />
      ))}
      {g.next.slice(0, 2).map((k, i) => (
        <line key={`ne${k}`} x1={158} y1={112} x2={g.next.length === 1 ? 158 : bottom[i]} y2={196} stroke="var(--graph-edge-next)" strokeWidth={3} strokeDasharray="6 6" />
      ))}
      {g.known.slice(0, 2).map((k, i) => {
        const x = g.known.length === 1 ? 158 : top[i];
        return (
          <g key={`k${k}`}>
            <circle cx={x} cy={40} r={30} fill="var(--graph-known)" />
            <text x={x} y={51} textAnchor="middle" fontFamily="var(--font-jp), Noto Sans JP" fontSize={30} fontWeight={700} fill="var(--color-accent-dark)">
              {k}
            </text>
          </g>
        );
      })}
      <circle cx={158} cy={112} r={42} fill="var(--graph-today)" />
      <text x={158} y={127} textAnchor="middle" fontFamily="var(--font-jp), Noto Sans JP" fontSize={42} fontWeight={700} fill="#FFFFFF">
        {g.center}
      </text>
      {g.next.slice(0, 2).map((k, i) => {
        const x = g.next.length === 1 ? 158 : bottom[i];
        return (
          <g key={`n${k}`}>
            <circle cx={x} cy={196} r={30} fill="var(--color-bg)" stroke="var(--graph-next)" strokeWidth={2} />
            <text x={x} y={207} textAnchor="middle" fontFamily="var(--font-jp), Noto Sans JP" fontSize={30} fontWeight={700} fill="var(--color-text3)">
              {k}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * `/graph?card=` — F11 그래프 1장. "協이 켜졌어. 力을 아니까 助(조력)·加(추가)가 가장 가까워." 뼈대는 F11.html.
 * 다음 카드 = 아는 노드에서 가장 가까운 모르는 노드 (이 자료 안에서). 주 버튼 → 다음 카드, 보조 → 자료(F03).
 */
export default async function GraphPage({ searchParams }: { searchParams: Promise<{ card?: string; fixed?: string }> }) {
  const { card: cardId, fixed } = await searchParams;

  if (isDesignPreview()) {
    return (
      <Screen where="카드 1 / 4 끝" up="/today" aside="점심 12:36" fixed={fixed === "1"}>
        <Space h={28} />
        <Title lg>協이 켜졌어</Title>
        <Space h={6} />
        <Lead>力을 아니까 助(조력)·加(추가)가 가장 가까워. 다음 카드는 이 둘 중 하나.</Lead>
        <Space h={18} />
        <Card style={{ padding: "20px 20px" }}>
          <Graph g={{ center: "協", known: ["十", "力"], next: ["助", "加"] }} />
          <Legend />
        </Card>
        <Grow />
        <Button href="/today">아침 기사로 돌아가기</Button>
        <Ghost href="/today">다음 카드 助</Ghost>
      </Screen>
    );
  }

  const user = await currentUser();
  if (!user) redirect("/");
  if (!cardId) redirect("/today");
  const card = await getCard(user.id, cardId);
  if (!card) notFound();
  if (!card.landed_at) redirect(`/cards/${card.id}/5`);
  const ctx = await cardContext(user.id, card);
  const p = card.payload;
  const cands = nextCandidates(ctx, p.kanji);
  const known = p.parts.map((pt) => pt.ch).filter((ch, i, a) => a.indexOf(ch) === i);
  const shared = cands.flatMap((c) => c.shared).find(Boolean) ?? known[0] ?? null;
  const candText = cands.map((c) => `${c.kanji}${c.koWord ? `(${c.koWord})` : ""}`).join("·");
  const lead =
    cands.length === 0
      ? "이 자료의 한자는 다 봤어. 다음 자료를 넣으면 이어져."
      : shared
        ? `${shared}${eulReul(shared)} 아니까 ${candText}${iGa(cands[cands.length - 1].kanji)} 가장 가까워. 다음 카드는 ${cands.length > 1 ? "이 둘 중 하나" : "이거"}.`
        : `${candText}${iGa(cands[cands.length - 1].kanji)} 남았어. 다음 카드는 ${cands.length > 1 ? "이 둘 중 하나" : "이거"}.`;
  const backLabel = ctx.input?.meta.example ? "아침 기사로 돌아가기" : "자료로 돌아가기";

  return (
    <Screen where={`${ctx.where} 끝`} up={card.input_id ? `/inputs/${card.input_id}` : "/today"} aside={nowKST()}>
      <Space h={28} />
      <Title lg>{p.kanji}이 켜졌어</Title>
      <Space h={6} />
      <Lead>{lead}</Lead>
      <Space h={18} />
      <Card style={{ padding: "20px 20px" }}>
        <Graph g={{ center: p.kanji, known: known.slice(0, 2), next: cands.map((c) => c.kanji) }} />
        <Legend />
      </Card>
      <Grow />
      <NextCard inputId={card.input_id} next={cands[0]?.kanji ?? null} backLabel={backLabel} />
    </Screen>
  );
}

function Legend() {
  return (
    <div className={s.legend}>
      <span className={s.legendItem}>
        <span className={s.legendDot} style={{ background: "var(--graph-known)" }} />
        아는 것
      </span>
      <span className={s.legendItem}>
        <span className={s.legendDot} style={{ background: "var(--graph-today)" }} />
        오늘
      </span>
      <span className={s.legendItem}>
        <span className={s.legendDot} style={{ border: "2px solid var(--graph-next)" }} />
        다음
      </span>
    </div>
  );
}
