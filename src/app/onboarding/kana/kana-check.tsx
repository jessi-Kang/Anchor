"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Tiles, Tile, Space, Status, Grow, Button, Ghost } from "@/components/ui";
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

export function KanaCheck({ kana, preview }: { kana: Kana[]; preview: boolean }) {
  const [heard, setHeard] = useState<Set<string>>(() => new Set(preview ? kana.slice(0, 4).map((k) => k.say) : []));
  const [state, setState] = useState<"idle" | "listening" | "unsupported" | "denied">(preview ? "listening" : "idle");
  const recRef = useRef<Recognition | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (preview) return;
    // 인식 시작은 다음 틱에: 렌더 직후 동기 setState 를 피하고, 지원 여부는 브라우저에서만 알 수 있다.
    const t = setTimeout(() => {
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
          const next = new Set(prev);
          for (const k of kana) if (h.includes(k.say)) next.add(k.say);
          return next;
        });
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") setState("denied");
      };
      // 브라우저가 침묵 후 끊으면 다시 켠다 (사용자가 끝내기 전까지 계속 듣는다)
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
        setState("unsupported");
      }
    }, 0);
    return () => {
      clearTimeout(t);
      const rec = recRef.current;
      recRef.current = null;
      if (rec) {
        rec.onend = null;
        rec.stop();
      }
    };
  }, [kana, preview]);

  const finish = (kanaModule: boolean) => {
    recRef.current?.stop();
    recRef.current = null;
    start(() =>
      submitKana({
        recognized: heard.size,
        total: kana.length,
        supported: state !== "unsupported" && state !== "denied",
        kanaModule,
      }),
    );
  };

  const statusText =
    state === "unsupported"
      ? "이 브라우저는 마이크 인식을 지원하지 않아"
      : state === "denied"
        ? "마이크를 허용하지 않았어"
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
      <Status dot={state === "listening" ? "on" : "off"}>{statusText}</Status>
      <Grow />
      <Button disabled={pending} onClick={() => finish(false)}>
        다 읽었어
      </Button>
      <Ghost onClick={() => finish(true)}>못 읽겠어, 가나부터 시작할래</Ghost>
    </>
  );
}
