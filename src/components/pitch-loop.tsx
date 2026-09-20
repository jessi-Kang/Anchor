"use client";

import { useRef, useState } from "react";
import { Card, Label, Lead, Space, Grow, Button, ButtonRow, Ghost, uiStyles as s } from "@/components/ui";

type Point = { t: number; f0: number };

/**
 * 듣기 → 따라 말하기 → 곡선. 한자 카드(F10)와 대화 덩어리(F14)가 같은 루프를 쓴다.
 * (곡선 비교는 다음 단계: 지금은 내 곡선만, 원어민 곡선은 TTS 오디오가 있을 때)
 * - 듣기: /api/tts (ElevenLabs). 204 면 브라우저 음성으로. 재생한 오디오에서 피치를 뽑아 "원어민" 곡선으로 쓴다.
 * - 말하기: 마이크는 버튼을 누른 뒤에만. 3초 녹음 → 브라우저에서 피치(자기상관) → /api/recordings.
 * 설명 텍스트 없음: 곡선과 한 줄뿐 (CLAUDE.md 원칙 3). 연음·억양을 글로 설명하지 않는다.
 *
 * `target` 이 녹음이 매달릴 곳이다: 한자 카드면 {card: id}, 대화 덩어리면 {chunk: id}.
 * `onDone` 은 이탈 한 줄이 눌렸을 때 (화면마다 다음이 다르다).
 */
export function PitchLoop({
  target,
  text,
  lang,
  preview,
  doneLabel,
  onDone,
  firstNote,
  startAttempt,
}: {
  target: { card: string } | { chunk: string };
  text: string;
  /** 듣기 음성의 언어 */
  lang: "ja" | "en";
  preview: boolean;
  doneLabel: string;
  onDone: (spoke: boolean) => void;
  firstNote: string;
  /** 이미 쌓인 녹음 수. 범례의 회차는 화면 상태가 아니라 DB 의 사실이다 (docs/FLOW.md 1′장) */
  startAttempt: number;
}) {
  const [native, setNative] = useState<Point[] | null>(() => (preview ? demoCurve(0) : null));
  const [mine, setMine] = useState<Point[] | null>(() => (preview ? demoCurve(1) : null));
  const [attempt, setAttempt] = useState(preview ? 3 : startAttempt);
  const [state, setState] = useState<"idle" | "playing" | "recording" | "saving">("idle");
  const [note, setNote] = useState<string>(firstNote);
  const ctxRef = useRef<AudioContext | null>(null);
  const [pending, setPending] = useState(false);

  const audioCtx = () => (ctxRef.current ??= new AudioContext());

  const listen = async () => {
    if (state !== "idle" || preview) return;
    setState("playing");
    try {
      const res = await fetch(`/api/tts?lang=${lang}&text=${encodeURIComponent(text)}`);
      if (res.status === 200) {
        const buf = await res.arrayBuffer();
        const ctx = audioCtx();
        const audio = await ctx.decodeAudioData(buf.slice(0));
        setNative(pitchTrack(audio.getChannelData(0), audio.sampleRate));
        const src = ctx.createBufferSource();
        src.buffer = audio;
        src.connect(ctx.destination);
        await new Promise<void>((resolve) => {
          src.onended = () => resolve();
          src.start();
        });
      } else if ("speechSynthesis" in window) {
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = lang === "en" ? "en-US" : "ja-JP";
          u.rate = 0.9;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        });
        setNote("브라우저 음성이야. 목소리 키를 넣으면 원어민 곡선도 보여.");
      }
    } catch (e) {
      console.error(e);
      setNote("듣기가 안 됐어. 한 번 더.");
    } finally {
      setState("idle");
    }
  };

  const speak = async () => {
    if (state !== "idle" || preview) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // 거부해도 화면은 idle 로 돌아간다. 말하기는 막히지만 **듣기는 계속 할 수 있어야 한다** —
      // 안내문이 "듣기만 하고 넘어가도 돼" 라고 말해 놓고 듣기 버튼까지 꺼 두면 그 말이 거짓이 된다.
      setState("idle");
      setNote("마이크를 허용하지 않았어. 듣기만 하고 넘어가도 돼.");
      return;
    }
    setState("recording");
    setNote("말하는 중. 3초.");
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const startedAt = performance.now();
    rec.start();
    await new Promise((r) => setTimeout(r, 3000));
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    stream.getTracks().forEach((t) => t.stop());
    const durationMs = Math.round(performance.now() - startedAt);
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    setState("saving");
    try {
      const ctx = audioCtx();
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      const curve = pitchTrack(audio.getChannelData(0), audio.sampleRate);
      setMine(curve);
      setAttempt((a) => a + 1);
      const form = new FormData();
      if ("card" in target) form.set("card_id", target.card);
      else form.set("chunk_id", target.chunk);
      form.set("pitch", JSON.stringify(curve));
      form.set("duration_ms", String(durationMs));
      form.set("audio", blob, "voice.webm");
      const res = await fetch("/api/recordings", { method: "POST", body: form });
      setNote(res.ok ? "곡선을 봐. 설명 대신 한 번 더." : "저장이 안 됐어. 곡선은 남아 있으니 한 번 더.");
    } catch (e) {
      console.error(e);
      setNote("녹음을 읽지 못했어. 한 번 더.");
    } finally {
      setState("idle");
    }
  };

  return (
    <>
      <Card>
        <Label>억양 비교</Label>
        <Curves native={native} mine={mine} />
        <div className={s.legend}>
          <span className={s.legendItem}>
            <span className={s.legendLine} style={{ background: "var(--curve-native)" }} />
            원어민
          </span>
          <span className={s.legendItem}>
            <span className={s.legendLine} style={{ background: "var(--curve-me)" }} />
            나{attempt > 0 ? `, ${attempt}회차` : ""}
          </span>
        </div>
        <Lead>{note}</Lead>
      </Card>
      <Grow />
      <ButtonRow>
        <Button outline disabled={state !== "idle"} onClick={listen}>
          {state === "playing" ? "듣는 중" : "듣기"}
        </Button>
        <Button disabled={state !== "idle"} onClick={speak}>
          {state === "recording" ? "말하는 중" : state === "saving" ? "저장 중" : "말하기"}
        </Button>
      </ButtonRow>
      <Space h={4} />
      <Ghost
        onClick={() => {
          if (pending || preview) return;
          setPending(true);
          onDone(attempt > 0);
        }}
      >
        {doneLabel}
      </Ghost>
    </>
  );
}

/** 두 곡선. 범례는 항상 (CLAUDE.md). 데이터가 없으면 축만. */
function Curves({ native, mine }: { native: Point[] | null; mine: Point[] | null }) {
  const W = 316;
  const H = 100;
  const path = (pts: Point[] | null) => {
    if (!pts || pts.length < 2) return "";
    const voiced = pts.filter((p) => p.f0 > 0);
    if (voiced.length < 2) return "";
    const t0 = voiced[0].t;
    const t1 = voiced[voiced.length - 1].t || 1;
    const fs = voiced.map((p) => p.f0);
    const lo = Math.min(...fs);
    const hi = Math.max(...fs) || lo + 1;
    return voiced
      .map((p, i) => {
        const x = 8 + ((p.t - t0) / Math.max(1, t1 - t0)) * (W - 16);
        const y = H - 12 - ((p.f0 - lo) / Math.max(1, hi - lo)) * (H - 40);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="원어민과 내 억양 곡선" style={{ maxWidth: "100%" }}>
      <path d={path(native)} fill="none" stroke="var(--curve-native)" strokeWidth={4} strokeLinecap="round" />
      <path d={path(mine)} fill="none" stroke="var(--curve-me)" strokeWidth={4} strokeLinecap="round" strokeDasharray="8 7" />
    </svg>
  );
}

/**
 * 피치 검출 (브라우저): 40ms 창, 자기상관 최대점. 80~500Hz. 무성 구간은 f0 0.
 * 정밀한 알고리즘은 다음 단계(곡선 비교). 지금은 "올라가는지 내려가는지"가 보이면 된다.
 */
function pitchTrack(x: Float32Array, sr: number): Point[] {
  const win = Math.floor(sr * 0.04);
  const hop = Math.floor(sr * 0.02);
  const minLag = Math.floor(sr / 500);
  const maxLag = Math.floor(sr / 80);
  const out: Point[] = [];
  for (let start = 0; start + win < x.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < win; i++) energy += x[start + i] * x[start + i];
    if (energy / win < 1e-4) {
      out.push({ t: Math.round((start / sr) * 1000), f0: 0 });
      continue;
    }
    let bestLag = 0;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < win - lag; i++) sum += x[start + i] * x[start + i + lag];
      const r = sum / energy;
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    out.push({ t: Math.round((start / sr) * 1000), f0: best > 0.3 && bestLag ? Math.round((sr / bestLag) * 10) / 10 : 0 });
  }
  // 튀는 점을 중앙값으로 눌러 곡선이 읽히게
  return out.map((p, i, a) => {
    if (p.f0 === 0) return p;
    const nb = [a[i - 1]?.f0, p.f0, a[i + 1]?.f0].filter((v): v is number => typeof v === "number" && v > 0).sort((u, v) => u - v);
    return { t: p.t, f0: nb[Math.floor(nb.length / 2)] };
  });
}

function demoCurve(k: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i * 60;
    const f0 = 180 + 40 * Math.sin(i / 5 + k) - (k ? 15 : 0);
    pts.push({ t, f0 });
  }
  return pts;
}
