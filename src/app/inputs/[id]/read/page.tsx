import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getInput, saveInputReadings } from "@/lib/db/inputs";
import { inputProgress, freshKanji } from "@/lib/cards/progress";
import { kanjiRuns } from "@/lib/kanji/extract";
import { getFurigana } from "@/lib/kanji/furigana";
import { isDesignPreview } from "@/lib/design-preview";
import { inputName } from "@/lib/input-name";
import { Screen, Space, Card, Label, Grow, Button, Pill, uiStyles as s } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { MetText } from "@/components/met-text";

export const dynamic = "force-dynamic";

const PREVIEW = {
  name: "아침 기사",
  body: "トヨタとNTT、協力して次世代の車を開発。両社は20日、協力して車のデータ基盤を作ると発表した。条件をめぐって妥協が必要だったという。",
  // 참고 화면과 같은 상태: 協力 은 만났고 基·妥 는 아직이다 (design/screens/F12.html).
  met: new Set(["協", "力"]),
  fresh: ["妥"],
};

/**
 * `/inputs/[id]/read` — F12 재만남. 뼈대·문구는 design/screens/F12.html.
 * 넣었던 자료를 **다시 읽는** 화면이다. 상단 라벨 → F03(그 자료), 주 버튼 "읽기 끝" → 홈.
 *
 * 이 화면이 원칙 4("복습은 카드 반복이 아니라 다음 인풋에서의 재만남")가 실제로 일어나는 자리고,
 * 검증 기준("2주 후 재만남 인식률 70%", docs/SPEC.md 9장)을 재려면 이 화면이 있어야 한다.
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
  let readings: string[] | undefined;

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
    fresh = freshKanji(prog);

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

  return (
    <Screen where={name} up={`/inputs/${id}`} aside={preview ? "점심 12:37" : nowKST()} fixed={fixed === "1"}>
      <Space h={20} />
      <Card>
        {/* 화면마다 h1 하나 (CLAUDE.md). 상단 "지금 어디" 라벨은 제목이 아니다 — 이 화면의 제목은
            다시 읽는 그 자료의 이름이다. Scene1~5 가 같은 꼴로 카드 라벨을 h1 으로 쓴다. */}
        <Label as="h1">{name}</Label>
        <div className={s.metBody} lang="ja">
          <MetText body={body} met={met} readings={readings} />
        </div>
      </Card>
      <Grow />
      {fresh.length > 0 && (
        <>
          {/*
            개수 한 줄 (docs/FLOW.md 1′장 F12 행). **진한 것만 센다** — 틴트는 새로 배울 것이 아니다.
            참고 화면은 이 위에 "妥協, 협은 방금 봤지" 한 줄이 더 있는데, 그건 임의의 한자어를
            한국어로 뭐라고 읽는지("타협")를 알아야 지어진다. 믿을 값이 없어 짓지 않았다 — 기획에 물었다.
          */}
          <div className={s.metFoot}>
            <span className={s.metFootLine}>
              {/*
                하나면 이름을 부르고("새로 배울 건 妥 하나뿐"), 여럿이면 개수만 센다. 전부 늘어놓으면
                열아홉 자가 한 줄에 깔려 읽히지 않는다 — FLOW 가 "개수 한 줄" 이라고 한 이유다.
              */}
              {fresh.length === 1 ? `새로 배울 건 ${fresh[0]} 하나뿐.` : `새로 배울 건 ${fresh.length}개.`}
            </span>
            <Pill on>재만남</Pill>
          </div>
          <Space h={12} />
        </>
      )}
      <Button href="/today">읽기 끝</Button>
    </Screen>
  );
}
