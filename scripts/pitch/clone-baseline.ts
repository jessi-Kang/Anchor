/**
 * 클론 기준선 시험 —  `pnpm pitch:baseline`
 *
 * **묻는 것:** Jessi 목소리 클론을 "제대로 발음된 소리"의 기준선(`target_pitch`)으로 써도 되는가.
 * 클론이 원 화자의 억양 습관을 끌고 오면, 5회차에 가까워진 것이 "제대로 된 발음에 가까워졌다" 가
 * 아니라 **"내 클론에 가까워졌다"** 가 된다. 그러면 통과 기준 하나가 뜻을 잃는다.
 *
 * 문장마다 여섯 번 합성한다 — 프리셋 세 번(A1·A2·A3), 클론 세 번(B1·B2·B3). 언어마다 다섯 문장이다.
 *  - **바닥값** = d(A1,A2)·d(A1,A3)·d(A2,A3) 의 중앙값. TTS 비결정성만으로 생기는 거리다.
 *    표본 하나면 그게 분모라 우연히 작게 나온 날 전부 불합격으로 읽힌다.
 *  - **관심값** = 클론과 프리셋 사이 아홉 쌍의 평균. 클론과 프리셋의 차이.
 *  - **클론 흔들림** = d(B1,B2)·d(B1,B3)·d(B2,B3) 의 중앙값. 기준선은 1회차에 뽑은 **단 한 번의
 *    합성**이라, 클론이 평균적으로 비슷해도 자기가 크게 흔들리면 그 한 번이 제비뽑기가 된다.
 *  - **비율(관심값/바닥값)의 중앙값**을 언어마다 같이 찍는다. 판정만 보면 얼마나 아슬아슬했는지가
 *    안 보인다 — 다 불합격인데 중앙값이 1.6 이면 나중에 선을 다시 볼 근거가 된다.
 *
 * 판정(PM 결정): 관심값 ≤ 바닥값×1.5 → 클론 가능 / ≥ 바닥값×3 → 프리셋 / 사이 → 안전한 쪽(프리셋).
 * **클론 흔들림이 바닥값의 2배 이상이면 위와 무관하게 프리셋.**
 *
 * **일본어는 이 시험으로 안 닫힌다.** 재는 것이 "일치" 지 "맞음" 이 아니라, 클론과 프리셋이 같은
 * 방식으로 고저 악센트를 틀리면 통과가 나온다. 영어는 프리셋이 원어민 모델이라 대리가 되지만
 * 일본어는 아니다. 그래서 일본어도 재되 그 결과로 일본어 기준선을 닫지 않는다.
 *
 * 필요한 환경 변수: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID_JESSI`,
 * 그리고 프리셋으로 쓸 `ELEVENLABS_VOICE_ID_EN` / `ELEVENLABS_VOICE_ID_JA`.
 * mp3 디코딩은 브라우저(Web Audio)가 한다 — 앱과 **같은 피치 검출**(`lib/pitch/track.ts`)을
 * 쓰기 위해서다. 다른 알고리즘으로 재면 여기 숫자가 앱의 곡선과 다른 것을 말하게 된다.
 */
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { pitchTrack, type PitchPoint } from "../../src/lib/pitch/track";
import { pitchDistance } from "../../src/lib/pitch/distance";

/**
 * 언어마다 **다섯 문장**(`docs/MEASURE.md` 2장). 하나로 재면 그 문장이 운 나쁜 경우를 못 거르고,
 * 셋이면 판정이 2:1 로 갈릴 때 중앙값이 한 문장에 끌려다닌다. 업무 대화에서 실제로 나오는 말로
 * 고른다 — 교과서 문장은 TTS 가 유난히 안정적으로 읽어서 바닥값이 실제보다 작게 나온다.
 */
const SENTENCES: { lang: "en" | "ja"; text: string }[] = [
  { lang: "en", text: "I think we should push this to next week." },
  { lang: "en", text: "Can you take a look at this before the meeting?" },
  { lang: "en", text: "That is not what I meant, let me say it again." },
  { lang: "en", text: "Could we go over the numbers one more time?" },
  { lang: "en", text: "I am not sure that is going to work for us." },
  { lang: "ja", text: "来週に回してもいいですか。" },
  { lang: "ja", text: "会議の前に見てもらえますか。" },
  { lang: "ja", text: "そういう意味ではありません。" },
  { lang: "ja", text: "もう一度数字を確認させてください。" },
  { lang: "ja", text: "それはちょっと難しいと思います。" },
];

/** 목소리마다 몇 번 합성하는가 (MEASURE 2장: 프리셋 A1·A2·A3, 클론 B1·B2·B3). */
const TAKES = 3;

function findChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium")).sort().reverse())
    for (const c of ["chrome-linux/chrome", "chrome-linux64/chrome"]) {
      const p = path.join(root, dir, c);
      if (existsSync(p)) return p;
    }
  return undefined;
}

async function synth(key: string, voice: string, text: string, lang: "en" | "ja"): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    // 앱이 듣기에 쓰는 것과 같은 모델·설정이어야 같은 것을 잰다 (api/tts/route.ts).
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", language_code: lang }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 같은 목소리의 서로 다른 합성끼리, 모든 쌍의 거리. 못 잰 쌍은 버린다 (0 으로 안 센다). */
function selfPairs(xs: PitchPoint[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) {
      const d = pitchDistance(xs[i], xs[j]);
      if (d !== null) out.push(d);
    }
  return out;
}

export type Score = {
  floors: number[];
  floor: number;
  interest: number[];
  mean: number;
  jitters: number[];
  jitter: number | null;
  ratio: number;
  verdict: string;
};

/**
 * 한 문장의 판정. **합성(네트워크)과 떨어뜨려 둔다** — 판정선이 맞는지는 키 없이도 확인할 수 있어야
 * 하고, 키를 가진 사람이 한 번 돌릴 때 여기서 처음 틀리면 그 한 번을 날린다.
 *
 * `A` 는 프리셋 합성들, `B` 는 클론 합성들. 잴 수 있는 쌍이 하나도 없으면 **null** 이다 — 0 은
 * "완전히 같다" 는 뜻이라 못 잰 것과 한 값으로 두면 안 된다.
 */
export function score(A: PitchPoint[][], B: PitchPoint[][]): Score | null {
  // 바닥값 = 프리셋끼리 세 쌍의 **중앙값**. 쌍 하나를 분모로 쓰면 그 한 번이 우연히 작게 나온 날
  // 전부 불합격으로 읽힌다 (MEASURE 2장).
  const floors = selfPairs(A);
  // 관심값 = 클론과 프리셋 사이 거리들의 **평균**. 클론도 세 번 부르므로 아홉 쌍 전부 본다 —
  // B1 하나만 쓰면 그 한 번의 합성이 관심값을 통째로 정한다.
  const interest = B.flatMap((b) => A.map((a) => pitchDistance(b, a))).filter((v): v is number => v !== null);
  // 클론 자신의 흔들림도 세 쌍의 중앙값.
  const jitters = selfPairs(B);
  if (floors.length === 0 || interest.length === 0) return null;

  const floor = median(floors);
  const mean = interest.reduce((s, v) => s + v, 0) / interest.length;
  const jitter = jitters.length ? median(jitters) : null;
  const ratio = floor > 0 ? mean / floor : Infinity;
  const verdict =
    jitter !== null && jitter >= floor * 2
      ? "프리셋 (클론 흔들림이 바닥값의 2배 이상)"
      : mean <= floor * 1.5
        ? "클론 가능"
        : mean >= floor * 3
          ? "프리셋"
          : "프리셋 (사이 값 → 안전한 쪽)";
  return { floors, floor, interest, mean, jitters, jitter, ratio, verdict };
}

async function main() {
  const key = process.env.ELEVENLABS_API_KEY;
  const clone = process.env.ELEVENLABS_VOICE_ID_JESSI;
  const preset = { en: process.env.ELEVENLABS_VOICE_ID_EN, ja: process.env.ELEVENLABS_VOICE_ID_JA };
  if (!key || !clone || !preset.en || !preset.ja) {
    console.error(
      "환경 변수가 모자란다: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID_JESSI, ELEVENLABS_VOICE_ID_EN, ELEVENLABS_VOICE_ID_JA",
    );
    process.exit(2);
  }

  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage();
  await page.goto("about:blank");
  // 앱과 같은 검출기를 페이지 안으로 넣는다. 한 벌만 쓰려고 소스를 그대로 건넨다.
  await page.evaluate(`window.__pitchTrack = ${pitchTrack.toString()}`);

  const curve = async (mp3: Buffer): Promise<PitchPoint[]> =>
    (await page.evaluate(async (b64: string) => {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(buf.buffer);
      return (window as unknown as { __pitchTrack: (x: Float32Array, sr: number) => PitchPoint[] }).__pitchTrack(
        audio.getChannelData(0),
        audio.sampleRate,
      );
    }, mp3.toString("base64"))) as PitchPoint[];

  const rows: string[] = [];
  /** 문장별 (관심값 / 바닥값) 비율. 판정이 얼마나 아슬아슬했는지는 이 값들의 중앙값이 말한다. */
  const ratios: { lang: "en" | "ja"; ratio: number; verdict: string }[] = [];

  for (const { lang, text } of SENTENCES) {
    const A: PitchPoint[][] = [];
    const B: PitchPoint[][] = [];
    for (let i = 0; i < TAKES; i++) A.push(await curve(await synth(key, preset[lang]!, text, lang)));
    for (let i = 0; i < TAKES; i++) B.push(await curve(await synth(key, clone, text, lang)));

    const r = score(A, B);
    if (!r) {
      // **못 잰 것을 0 으로 찍지 않는다.** 값이 모자라면 그렇다고 말한다.
      rows.push(`${lang} | ${text}\n    잴 수 없음 (곡선이 모자람) — 이 문장은 집계에서 뺀다`);
      continue;
    }
    ratios.push({ lang, ratio: r.ratio, verdict: r.verdict });
    const list = (xs: number[]) => xs.map((v) => v.toFixed(2)).join(" ");
    rows.push(
      `${lang} | ${text}` +
        `\n    바닥값(반음) ${r.floor.toFixed(2)}  [${list(r.floors)}]` +
        `\n    관심값 ${r.mean.toFixed(2)}  [${list(r.interest)}]` +
        `\n    클론 흔들림 ${r.jitter === null ? "못 잼" : r.jitter.toFixed(2)}  [${list(r.jitters)}]` +
        `\n    비율(관심값/바닥값) ${r.ratio.toFixed(2)}` +
        `\n    → ${r.verdict}`,
    );
  }
  await browser.close();

  console.log("문장별 결과 (평균으로 뭉치지 않는다)\n");
  console.log(rows.join("\n\n"));

  /*
    언어마다 한 줄로 모은다. **판정이 갈리면 프리셋으로 간다** — 안전 쪽으로 치우친 집계인 것을
    알고 쓴다. 비용이 비대칭이라서다: 클론이 괜찮은데 프리셋으로 가면 코드가 조금 늘 뿐이고,
    클론이 억양을 끌고 오는데 클론으로 가면 **곡선 숫자가 통째로 순환하고 2주 뒤에 알게 된다.**

    그래서 **비율의 중앙값을 같이 찍는다.** 다 불합격인데 중앙값이 1.6 이면 아슬아슬하게 떨어진
    것이고, 나중에 선을 다시 볼 근거가 된다. 판정만 보면 그 차이가 안 보인다 (MEASURE 2장).
  */
  console.log("\n\n언어별 집계");
  for (const lang of ["en", "ja"] as const) {
    const g = ratios.filter((r) => r.lang === lang);
    if (g.length === 0) {
      console.log(`  ${lang}: 잴 수 있는 문장이 없다`);
      continue;
    }
    const ok = g.filter((r) => r.verdict === "클론 가능").length;
    const finite = g.map((r) => r.ratio).filter((v) => Number.isFinite(v));
    console.log(
      `  ${lang}: 클론 가능 ${ok} / ${g.length} → **${ok === g.length ? "클론" : "프리셋"}**` +
        (finite.length ? `  · 비율 중앙값 ${median(finite).toFixed(2)} (판정선: 1.5 이하 클론 / 3 이상 프리셋)` : ""),
    );
  }
  console.log(
    "\n일본어는 이 시험으로 안 닫힌다 — 재는 것이 「일치」지 「맞음」이 아니라, 클론과 프리셋이 같은 방식으로\n" +
      "고저 악센트를 틀리면 통과가 나온다. 영어는 프리셋이 원어민 모델이라 대리가 되지만 일본어는 아니다 (MEASURE 2장).",
  );
}

// `score` 를 불러 쓰는 쪽(확인 스크립트)이 이 파일을 import 해도 합성이 돌면 안 된다 — 키가 없으면
// 그 자리에서 종료해 버린다. 직접 실행했을 때만 돈다.
if (process.argv[1] && /clone-baseline\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
