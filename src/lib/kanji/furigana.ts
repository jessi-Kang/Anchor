import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { kanjiRuns } from "@/lib/kanji/extract";

/**
 * 자료 문장의 한자 덩어리마다 よみがな 를 구한다 (F04 출처 문장용).
 *
 * 왜 사전이 아니라 모델인가: 읽기는 글자가 아니라 문맥이 정한다. `車` 는 사전에서 "シャ" 지만
 * `次世代の車` 에서는 "くるま" 다. 사전 값을 그대로 달면 틀린 읽기를 정답처럼 보여 주게 된다.
 *
 * **이 호출은 사용자 자료를 외부로 보낸다.** 일본어 쪽에서는 이게 처음이다 — 카드 문안
 * (`card-content.ts`)은 공용 사전 데이터만 보낸다. CLAUDE.md 데이터 원칙이 정한 조건은
 * "학습에 쓰지 않는 설정으로 호출" 이고, Anthropic API 는 기본적으로 API 입력을 학습에 쓰지 않는다.
 * 보내는 것은 그 문장 하나뿐이다. 자료 전체도, 다른 기록도 싣지 않는다.
 *
 * 읽기를 **지어내지 않는 것**이 이 함수의 전부다. 틀린 읽기를 하나 다는 것이 아예 안 다는 것보다 나쁘다:
 *  - 덩어리 수가 안 맞으면 그 문장은 통째로 ruby 없이 간다 (null).
 *  - 개별 읽기가 가나가 아니거나 길이가 터무니없으면 그 덩어리만 비운다 (부분 적용).
 *  - 키가 없거나 호출이 실패하면 ruby 없이 간다.
 */

const MODEL = "claude-opus-5";

/** 히라가나 + 장음부호. 후리가나는 히라가나로 단다. */
const KANA = /^[ぁ-ゟー]+$/u;
/** 한자 한 글자가 가나 네 자를 넘는 읽기는 실질적으로 없다. 모델이 문장을 통째로 넣은 경우를 거른다. */
const MAX_KANA_PER_KANJI = 4;

const FuriganaSchema = z.object({ readings: z.array(z.string()) });

const SYSTEM = `너는 일본어 문장의 한자 덩어리에 よみがな 를 단다. 규칙:
- 주어진 문장 안에서 **그 덩어리가 실제로 어떻게 읽히는지**를 돌려준다. 사전의 대표 음이 아니다.
  예: 次世代の車 의 車 는 "しゃ" 가 아니라 "くるま".
- readings 는 덩어리와 **같은 개수, 같은 순서**의 배열이다. 하나도 빼거나 더하지 않는다.
- 히라가나로만 쓴다. 한자·가타카나·로마자·공백·기호를 넣지 않는다.
- 읽기를 확신할 수 없는 덩어리는 지어내지 말고 빈 문자열("")로 둔다.
- 설명·이모지·마크다운 금지.`;

/**
 * 돌려주는 배열은 `kanjiRuns(sentence)` 와 길이·순서가 같다. 빈 문자열은 "읽기 없음"이다.
 * 문장에 ruby 를 달 수 없으면 null.
 */
export async function getFurigana(sentence: string): Promise<string[] | null> {
  const runs = kanjiRuns(sentence);
  if (!runs.length) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
    const user = [`문장: ${sentence}`, "덩어리:", ...runs.map((r, i) => `${i + 1}. ${r.text}`)].join("\n");
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: { format: zodOutputFormat(FuriganaSchema) },
    });
    const parsed = res.parsed_output;
    if (!parsed) throw new Error("후리가나 파싱 실패");
    return alignReadings(sentence, parsed.readings);
  } catch (e) {
    console.error("[furigana] 생성 실패, ruby 없이", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 모델이 준 읽기를 문장의 덩어리에 맞춰 본다. 순수 함수 — 여기가 "지어낸 읽기"를 막는 자리다.
 *
 * - 개수가 어긋나면 어느 읽기가 어느 덩어리 것인지 알 수 없다. 맞춰 보려 들지 않고 문장을 포기한다(null).
 * - 가나가 아니거나 터무니없이 긴 읽기는 그 덩어리만 비운다(""). 한 글자 때문에 문장 전체가 읽기를 잃지 않는다.
 * - 남은 읽기가 하나도 없으면 ruby 를 달 이유가 없다(null).
 */
export function alignReadings(sentence: string, raw: string[]): string[] | null {
  const runs = kanjiRuns(sentence);
  if (!runs.length) return null;
  if (raw.length !== runs.length) {
    console.error(`[furigana] 덩어리 ${runs.length}개인데 읽기 ${raw.length}개, ruby 없이 간다`);
    return null;
  }
  const readings = raw.map((one, i) => {
    const r = one.trim();
    if (!r || !KANA.test(r)) return "";
    return [...r].length <= [...runs[i].text].length * MAX_KANA_PER_KANJI ? r : "";
  });
  return readings.some((r) => r) ? readings : null;
}
