import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getChunk, type ChunkRow } from "@/lib/db/chunks";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Card, Label, Mark, uiStyles as s } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { TalkLoop } from "./talk-loop";

export const dynamic = "force-dynamic";

const PREVIEW: ChunkRow = {
  id: "preview",
  lang: "en",
  situation: "이건 다음 스프린트로 미루죠",
  text: "Let's push this to the next sprint.",
  attitude: "제안",
  meta: { chunk: "push this to" },
  created_at: "",
};

/** 문장 안에서 덩어리만 배경 틴트로 (F14). 색이 아니라 틴트다 — CLAUDE.md 디자인 시스템. */
function markChunk(text: string, chunk: string) {
  const i = chunk ? text.indexOf(chunk) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <Mark>{chunk}</Mark>
      {text.slice(i + chunk.length)}
    </>
  );
}

/**
 * `/talk/[id]` — F14 덩어리 + 음성 루프. 뼈대·문구는 design/screens/F14.html.
 * 상단 라벨 → F13(못 한 말). 원칙 3: 연음·억양을 글로 설명하지 않는다. 덩어리를 듣고, 따라 말하고, 곡선을 겹쳐 본다.
 * 맨 위는 F13 에서 쓴 그 한국어 한 줄이다 — 다음 화면에서 사라지면 무엇을 말하려 했는지 잃는다.
 * 한국어 말끝이 무슨 태도인지는 화면에 쓰지 않는다. 그건 문법 설명이고 원칙 1 에 걸린다(태도는 DB 에만 남긴다).
 */
export default async function TalkChunkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fixed?: string }>;
}) {
  const { id } = await params;
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let chunk = PREVIEW;

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const row = await getChunk(user.id, id);
    if (!row) notFound();
    chunk = row;
  }

  const highlight = chunk.meta.chunk ?? chunk.text;

  return (
    <Screen where="못 한 말" up="/talk" aside={preview ? "오후 7:11" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Card>
        <Label>내가 하려던 말</Label>
        <div className={s.talkSituation}>{chunk.situation}</div>
      </Card>
      <Space h={10} />
      <Card>
        <Label>영어로는 이 덩어리 하나로</Label>
        <h1 className={s.source} lang="en">
          {markChunk(chunk.text, highlight)}
        </h1>
      </Card>
      <Space h={16} />
      <TalkLoop chunkId={chunk.id} text={highlight} preview={preview} />
    </Screen>
  );
}
