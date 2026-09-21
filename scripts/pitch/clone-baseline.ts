/**
 * 클론 기준선 시험 —  `pnpm pitch:baseline`
 *
 * **묻는 것:** Jessi 목소리 클론을 "제대로 발음된 소리"의 기준선(`target_pitch`)으로 써도 되는가.
 * 클론이 원 화자의 억양 습관을 끌고 오면, 5회차에 가까워진 것이 "제대로 된 발음에 가까워졌다" 가
 * 아니라 **"내 클론에 가까워졌다"** 가 된다. 그러면 통과 기준 하나가 뜻을 잃는다.
 *
 * 문장마다 다섯 번 합성한다 — 프리셋 세 번(A1·A2·A3), 클론 두 번(B1·B2).
 *  - **바닥값** = d(A1,A2)·d(A1,A3)·d(A2,A3) 의 중앙값. TTS 비결정성만으로 생기는 거리다.
 *    표본 하나면 그게 분모라 우연히 작게 나온 날 전부 불합격으로 읽힌다.
 *  - **관심값** = d(B1,A*) 들의 평균. 클론과 프리셋의 차이.
 *  - **클론 흔들림** = d(B1,B2). 기준선은 1회차에 뽑은 **단 한 번의 합성**이라, 클론이 평균적으로
 *    비슷해도 자기가 크게 흔들리면 그 한 번이 제비뽑기가 된다.
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

const SENTENCES: { lang: "en" | "ja"; text: string }[] = [
  { lang: "en", text: "I think we should push this to next week." },
  { lang: "en", text: "Can you take a look at this before the meeting?" },
  { lang: "en", text: "That is not what I meant, let me say it again." },
  { lang: "ja", text: "来週に回してもいいですか。" },
  { lang: "ja", text: "会議の前に見てもらえますか。" },
  { lang: "ja", text: "そういう意味ではありません。" },
];

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
  for (const { lang, text } of SENTENCES) {
    const A: PitchPoint[][] = [];
    const B: PitchPoint[][] = [];
    for (let i = 0; i < 3; i++) A.push(await curve(await synth(key, preset[lang]!, text, lang)));
    for (let i = 0; i < 2; i++) B.push(await curve(await synth(key, clone, text, lang)));

    const num = (v: number | null) => (v === null ? "못 잼" : v.toFixed(2));
    const floors = [pitchDistance(A[0], A[1]), pitchDistance(A[0], A[2]), pitchDistance(A[1], A[2])].filter(
      (v): v is number => v !== null,
    );
    const interest = A.map((a) => pitchDistance(B[0], a)).filter((v): v is number => v !== null);
    const jitter = pitchDistance(B[0], B[1]);
    // **못 잰 것을 0 으로 찍지 않는다.** 값이 모자라면 그렇다고 말한다.
    if (floors.length === 0 || interest.length === 0) {
      rows.push(`${lang} | ${text} | 잴 수 없음 (곡선이 모자람)`);
      continue;
    }
    const floor = median(floors);
    const mean = interest.reduce((s, v) => s + v, 0) / interest.length;
    const verdict =
      jitter !== null && jitter >= floor * 2
        ? "프리셋 (클론 흔들림이 바닥값의 2배 이상)"
        : mean <= floor * 1.5
          ? "클론 가능"
          : mean >= floor * 3
            ? "프리셋"
            : "프리셋 (사이 값 → 안전한 쪽)";
    rows.push(
      `${lang} | ${text}\n    바닥값(반음) ${floor.toFixed(2)}  [${floors.map((v) => v.toFixed(2)).join(" ")}]` +
        `\n    관심값 ${mean.toFixed(2)}  [${interest.map((v) => v.toFixed(2)).join(" ")}]` +
        `\n    클론 흔들림 ${num(jitter)}\n    → ${verdict}`,
    );
  }
  await browser.close();
  console.log("문장별 결과 (평균으로 뭉치지 않는다)\n");
  console.log(rows.join("\n\n"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
