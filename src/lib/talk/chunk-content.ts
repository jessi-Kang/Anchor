import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * "오늘 못 한 말" 한국어 한 줄 → 그 상황에서 쓸 영어 문장 + 소리로 연습할 덩어리.
 *
 * 원칙 0·3 (CLAUDE.md): 말할 상황에서 출발해 말하기로 끝난다. 문법은 설명하지 않는다.
 * 그래서 돌려주는 것은 문장 하나와 그 안의 덩어리 하나뿐이다. 태도는 그래프 분류용으로 받고 화면에 쓰지 않는다
 * — 한국어 말끝이 무슨 태도인지 적는 순간 그건 문법 설명이 된다(원칙 1).
 * 덩어리의 단위는 한국어 말끝·태도다 (docs/SPEC.md 5장). "~하죠" → 제안, "~것 같아" → 내적 태도.
 *
 * 외부 LLM 호출 원칙: 보내는 것은 사용자가 방금 쓴 그 한 줄뿐이다. 다른 자료도, 지난 기록도 싣지 않는다.
 * Anthropic API 는 기본적으로 API 입력을 학습에 쓰지 않는다 (소비자 제품과 다름).
 */

const MODEL = "claude-opus-5";

/** 기능 분류 9종 (docs/SPEC.md 5장) */
export const ATTITUDES = ["내적 태도", "기억", "의도", "능력", "제안", "원인", "설명", "확인", "강조"] as const;

const ChunkSchema = z.object({
  english: z.string(),
  chunk: z.string(),
  attitude: z.enum(ATTITUDES),
});

export type ChunkContent = z.infer<typeof ChunkSchema>;

const SYSTEM = `너는 한국어 화자가 "오늘 못 한 말" 한 줄을 주면, 그 상황에서 실제로 쓸 영어를 돌려준다. 규칙:
- english: 그 상황에서 원어민이 쓸 자연스러운 한 문장. 짧게(10단어 안팎). 교과서 문장이 아니라 회의·수업에서 입으로 나오는 말.
- chunk: english 안에서 소리로 연습할 덩어리. **english 의 연속된 부분 문자열이어야 한다**(글자 그대로 포함). 단어 2~4개. 그 말의 태도를 지고 있는 부분을 고른다.
- attitude: 한국어 말끝이 무슨 태도인지. 내적 태도 / 기억 / 의도 / 능력 / 제안 / 원인 / 설명 / 확인 / 강조 중 하나. **화면에 쓰지 않고 그래프 분류에만 쓴다.**
- 문법 설명 금지. 왜 그런 형태인지 설명하지 않는다. 다른 표현을 여러 개 늘어놓지 않는다.
- 이모지·마크다운 금지.`;

/**
 * **못 만들면 `null` 이다. 지어내지 않는다.**
 *
 * 전에는 사용자가 쓴 **한국어 한 줄을 그대로 `english` 에 넣었다.** 화면은 그걸 "따라 말할 영어
 * 덩어리" 라고 부르고 곡선까지 그렸다 — 듣기가 그 한국어를 영어 목소리로 읽고, 그 곡선이
 * `target_pitch` 로 **1회차 기준선에 고정**됐다. 화면만 틀린 게 아니라 **곡선 숫자가 통째로
 * 뜻을 잃는** 자리였다 (`docs/MEASURE.md` 2장).
 *
 * 부르는 쪽(`submitGuess`)이 `null` 을 받으면 **추측은 저장한 채** F17 에 세워 둔다. 그 상태는
 * 코드가 이미 아는 상태다 — `hasEnglish` 가 거짓이고, F18 목록에도 안 뜬다.
 */
export async function getChunkContent(situation: string): Promise<{ content: ChunkContent; source: "claude" } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: "user", content: situation.slice(0, 300) }],
      output_config: { format: zodOutputFormat(ChunkSchema) },
    });
    const parsed = res.parsed_output;
    if (!parsed) throw new Error("덩어리 문안 파싱 실패");
    // chunk 는 english 안에 그대로 있어야 화면에서 강조할 수 있다. 어긋나면 문장 전체를 덩어리로 둔다.
    const chunk = parsed.english.includes(parsed.chunk) ? parsed.chunk : parsed.english;
    return { content: { ...parsed, chunk }, source: "claude" };
  } catch (e) {
    console.error("[chunk-content] 생성 실패 — 지어내지 않고 못 만들었다고 돌려준다", e instanceof Error ? e.message : e);
    return null;
  }
}
