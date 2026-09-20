"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Tiles, Tile, Space, Status, Pill, Grow, Button, Ghost } from "@/components/ui";
import { submitKana } from "./actions";

type Kana = { glyph: string; say: string };

/* Web Speech API 최소 타입 (lib.dom 에 webkit 접두 버전이 없다) */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** 가타카나 → 히라가나 (U+30A1..U+30F6 → U+3041..U+3096) */
function toHiragana(s: string) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

type State = "idle" | "listening" | "off" | "unsupported" | "denied";

/**
 * 마이크는 "읽기 시작"을 누른 뒤에만 켠다. 켜져 있으면 점과 알약으로 보이고, 알약을 탭하면 끈다 (FLOW 4장).
 * 미지원·거부는 통과가 아니라 "다음에 다시 확인"으로 저장되고 카드로 간다 (자기 보고 통과 금지).
 * 이탈은 하나: "못 읽겠어, 가나부터 시작할래" → locked.
 */
export function KanaCheck({ kana, preview, next }: { kana: Kana[]; preview: boolean; next: string }) {
  const [heard, setHeard] = useState<Set<string>>(() => new Set(preview ? kana.slice(0, 4).map((k) => k.say) : []));
  const [state, setState] = useState<State>(preview ? "listening" : "idle");
  const recRef = useRef<Recognition | null>(null);
  const [pending, start] = useTransition();

  const stopMic = () => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* 이미 멈춤 */
      }
    }
  };

  useEffect(() => stopMic, []);

  const startMic = () => {
    const Ctor = getRecognition();
    if (!Ctor) {
      setState("unsupported");
      return;
    }
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? "";
      const h = toHiragana(text);
      setHeard((prev) => {
        const nextSet = new Set(prev);
        for (const k of kana) if (h.includes(k.say)) nextSet.add(k.say);
        return nextSet;
      });
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        recRef.current = null;
        setState("denied");
      }
    };
    // 브라우저가 침묵 후 끊으면 다시 켠다 (사용자가 끄기 전까지 계속 듣는다)
    rec.onend = () => {
      if (recRef.current === rec) {
        try {
          rec.start();
        } catch {
          /* 이미 시작됨 */
        }
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setState("listening");
    } catch {
      recRef.current = null;
      setState("unsupported");
    }
  };

  const finish = (cannotRead: boolean) => {
    stopMic();
    start(() =>
      submitKana({
        recognized: heard.size,
        total: kana.length,
        supported: state !== "unsupported" && state !== "denied",
        cannotRead,
        next,
      }),
    );
  };

  const supported = state !== "unsupported" && state !== "denied";
  const statusText =
    state === "idle"
      ? "마이크는 읽기 시작을 누르면 켜져"
      : state === "unsupported"
        ? "이 브라우저는 마이크 인식을 지원하지 않아. 다음에 다시 확인할게"
        : state === "denied"
          ? "마이크를 허용하지 않았어. 다음에 다시 확인할게"
          : state === "off"
            ? `마이크 껐어. ${heard.size} / ${kana.length} 인식됨`
            : `듣는 중. ${heard.size} / ${kana.length} 인식됨`;

  return (
    <>
      <Tiles>
        {kana.map((k) => (
          <Tile key={k.glyph} on={heard.has(k.say) && !preview}>
            {k.glyph}
          </Tile>
        ))}
      </Tiles>
      <Space h={16} />
      <Status
        dot={state === "listening" ? "on" : "off"}
        right={
          state === "listening" && !preview ? (
            <button
              type="button"
              onClick={() => {
                stopMic();
                setState("off");
              }}
              style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer" }}
              aria-label="마이크 끄기"
            >
              <Pill on>마이크 끄기</Pill>
            </button>
          ) : undefined
        }
      >
        {statusText}
      </Status>
      <Grow />
      {state === "idle" ? (
        <Button onClick={startMic}>읽기 시작</Button>
      ) : (
        <Button disabled={pending} onClick={() => finish(false)}>
          {supported ? "다 읽었어" : "카드로"}
        </Button>
      )}
      <Ghost onClick={() => finish(true)}>못 읽겠어, 가나부터 시작할래</Ghost>
    </>
  );
}
