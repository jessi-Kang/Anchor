import { requireUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/tts?text=協力&lang=ja|en&voice=mine|default — ElevenLabs TTS (mp3).
 * 키가 없으면 204: 클라이언트가 브라우저 음성(SpeechSynthesis)으로 대신한다.
 * voice=mine 은 Jessi 목소리 클론(ELEVENLABS_VOICE_ID_JESSI): 목표 발음을 "내 목소리 버전"으로.
 * 캐시: 같은 텍스트·목소리는 브라우저가 1일 보관.
 */
export async function GET(req: Request) {
  try {
    await requireUser();
  } catch (res) {
    return res as Response;
  }
  const url = new URL(req.url);
  const text = (url.searchParams.get("text") ?? "").trim().slice(0, 200);
  if (!text) return Response.json({ error: "text 가 비었다" }, { status: 400 });

  const key = process.env.ELEVENLABS_API_KEY;
  const mine = url.searchParams.get("voice") === "mine";
  const lang = url.searchParams.get("lang") === "en" ? "en" : "ja";
  const perLang = lang === "en" ? process.env.ELEVENLABS_VOICE_ID_EN : process.env.ELEVENLABS_VOICE_ID_JA;
  const voice = (mine ? process.env.ELEVENLABS_VOICE_ID_JESSI : perLang) ?? process.env.ELEVENLABS_VOICE_ID_JESSI;
  if (!key || !voice) return new Response(null, { status: 204 });

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", language_code: lang }),
  });
  if (!res.ok || !res.body) {
    console.error("[tts] ElevenLabs", res.status, await res.text().catch(() => ""));
    return new Response(null, { status: 204 });
  }
  return new Response(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" },
  });
}
