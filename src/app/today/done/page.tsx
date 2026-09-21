import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { listInputs } from "@/lib/db/inputs";
import { litToday, spokenToday } from "@/lib/db/today";
import { inputProgress, freshKanji } from "@/lib/cards/progress";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Card, Label, Row, Pill, Grow, Button } from "@/components/ui";
import { nowKST } from "@/components/card-bits";

export const dynamic = "force-dynamic";

/** 한 줄에 들어가는 한자 수. 넘으면 글자 대신 개수로 말한다. */
const FITS = 6;

// 참고 화면과 같은 상태로 둔다 (design/screens/F15.html). 실제 화면에서는 이 줄에 카드에서 낸
// 소리(協力)와 대화 덩어리가 같이 서지만, 미리보기는 참고 HTML 과 견주는 자리라 그대로 맞춘다.
const PREVIEW = { lit: ["協", "開", "基"], spoken: ["push this to"], waiting: ["妥"] };

/**
 * `/today/done` — F15 하루 끝. 뼈대·문구는 design/screens/F15.html.
 * 카드 큐가 비었을 때 홈 대신 뜬다. 상단 라벨 → 홈, 주 버튼 "내일 아침에" → 홈.
 * **오늘 켠 게 없으면 뜨지 않는다** — 아래 갈림길을 보라.
 *
 * **세는 자리지 칭찬하는 자리가 아니다.** 스트리크·점수·"잘했어요" 는 없다 (CLAUDE.md 하지 않는 것).
 * 오늘 켜진 것과 내일 기다리는 것을 그대로 센다.
 *
 * "또 만날 글자" 는 재만남(F12)이 진하게 보여 주는 바로 그 한자들이다 — `freshKanji` 한 곳에서 온다.
 * 따로 세면 F12 는 하나라고 하는데 여기서는 둘이라고 말하게 된다.
 */
export default async function DonePage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let lit = PREVIEW.lit;
  let spoken = PREVIEW.spoken;
  let waiting = PREVIEW.waiting;

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    [lit, spoken] = await Promise.all([litToday(user.id), spokenToday(user.id)]);
    /*
      **오늘 켠 것이 하나도 없으면 이 화면은 뜨지 않는다** (docs/FLOW.md 1′장 F15).

      F14 의 "됐어" 가 녹음 없이도 여기로 보내서, 영어만 쓴 사람이 한 번도 안 켜고 이 화면에 닿았다.
      그때 남는 건 제목 "오늘 켜진 것" 과 라벨 "그래프" 만 있는 빈 카드다. **세는 자리가 아무것도
      못 세면 없느니만 못하다** — 켠 게 없는 날에 "오늘 켜진 것" 을 띄우는 건 빈 화면이 아니라
      틀린 말이다.

      `waiting` 은 안 센다. 내일 기다리는 글자는 오늘 켠 것이 아니라서, 그것만 있는 날은 FLOW 가
      말하는 "아무것도 안 켠 날" 그대로다. 그래서 세는 것 둘을 먼저 읽고 여기서 갈라진다 —
      돌아가는 사람 몫으로 자료·진행도를 훑지 않는다.
    */
    if (lit.length === 0 && spoken.length === 0) redirect("/today");
    const inputs = await listInputs(user.id, 20);
    const progs = await Promise.all(inputs.filter((i) => i.lang === "ja").map((i) => inputProgress(user.id, i)));
    // 아직 안 만난 한자는 자료마다 나오니 글자로 모은다 — 같은 한자가 두 기사에 있어도 하나다.
    waiting = [...new Set(progs.flatMap(freshKanji))];
  }

  return (
    <Screen where="오늘 끝" up="/today" aside={preview ? "오후 7:14" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Title lg>오늘 켜진 것</Title>
      <Space h={22} />
      <Card>
        <Label>그래프</Label>
        {lit.length > 0 && <Row title={lit.join(" ")} sub={`한자 ${lit.length}`} right={<Pill on>켜짐</Pill>} plain />}
        {spoken.length > 0 && (
          <Row title={spoken.join(" · ")} sub={`말해본 것 ${spoken.length}`} right={<Pill on>켜짐</Pill>} plain />
        )}
        {waiting.length > 0 && (
          /*
            한자가 적으면 참고 화면처럼 글자를 늘어놓고, 많으면 개수로 말한다.
            여섯 자만 보이면 나머지가 있다는 걸 화면이 숨기고, 열여덟 자를 다 늘어놓으면 두 줄로 흐른다.
            개수 쪽 문구는 FLOW 1′장 F15 행의 말("또 만날 글자 n")을 그대로 쓴다 — "재만남" 은
            우리끼리 쓰는 말이라 화면에 못 쓰고, "만나다" 는 F12 에서 이미 쓰는 말이다.

            이 줄에만 알약이 없다. 알약 어휘는 켜짐·꺼짐·이어서 셋뿐이고(FLOW 4장) "대기" 는 그 밖이다.
            없어도 말이 새지 않는다 — 부제 "내일 기사에 또 나오면" 이 같은 말을 이미 하고 있다.
            앞 두 줄의 "켜짐" 은 어휘 안이라 그대로 둔다.
          */
          <Row
            title={waiting.length <= FITS ? waiting.join(" ") : `또 만날 글자 ${waiting.length}`}
            sub="내일 기사에 또 나오면"
            plain
          />
        )}
      </Card>
      <Grow />
      <Button href="/today">내일 아침에</Button>
    </Screen>
  );
}
