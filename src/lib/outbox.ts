"use client";

/**
 * 못 보낸 녹음을 그 기기에 남겼다가 다음에 조용히 올린다 (docs/FLOW.md 4장).
 *
 * **왜 있나.** "보낸 것이 실패해도 화면은 앞으로 간다" 는 규칙은 재전송이 있어야 참이 된다.
 * 없으면 오프라인에서 말한 회차가 그냥 사라지고, 오류 화면의 "방금 한 건 저장돼 있어" 도
 * 거짓말이 된다 (FLOW 1′장 error 행). 데이터 원칙은 "녹음 한 번도 유실 없음" 이다.
 *
 * **화면에는 아무것도 안 쓴다.** "저장 중"·"동기화 중"·"저장 실패" 를 안 쓴다 — 사용자가 할 일이
 * 없는 것을 알릴 이유가 없고, 알리면 상태 어휘만 는다 (FLOW 4장).
 *
 * `localStorage` 가 아니라 IndexedDB 인 이유는 오디오가 Blob 이라서다. 문자열로 바꿔 담으면
 * 3분짜리 하나로 칸이 찬다.
 */

const DB = "anchor-outbox";
const STORE = "recordings";

/** 보낼 것 한 건. FormData 는 저장이 안 되므로 **다시 만들 수 있는 값**으로 쪼개 둔다. */
export type PendingRecording = {
  /**
   * 이 녹음의 이름표. **브라우저가 녹음을 만든 그 자리에서 붙인다** — 서버가 만들면 재전송마다
   * 달라져서 멱등 키 노릇을 못 한다. 서버는 이 값으로 같은 행을 두 번 안 만든다
   * (`db/migrations/0008_recordings_client_id.sql`).
   */
  clientId: string;
  cardId?: string;
  chunkId?: string;
  /** 곡선 JSON. **이게 본체다** — 오디오는 버려도 이건 못 버린다. */
  pitch: string;
  targetPitch?: string;
  durationMs: number;
  audio?: Blob;
};

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB, 1);
    } catch {
      // 사생활 모드·차단. 남기지 못할 뿐이고 보내는 것은 그대로 된다.
      return resolve(null);
    }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "clientId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function done(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

/**
 * 기기에 남긴다. **칸이 모자라면 오디오를 버리고 곡선만 남긴다** (FLOW 4장) — 원본은 어차피
 * 일정 기간 뒤 지우는 값이고 곡선은 계속 보관하는 값이라, 둘 중 하나만 남길 수 있으면 곡선이다.
 */
async function keep(r: PendingRecording): Promise<void> {
  const db = await open();
  if (!db) return;
  const put = async (row: PendingRecording) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(row);
    return done(tx);
  };
  const ok = await put(r).catch(() => false);
  if (!ok && r.audio) {
    const noAudio: PendingRecording = { ...r, audio: undefined };
    const second = await put(noAudio).catch(() => false);
    if (!second) console.error("[outbox] 곡선도 못 남겼다", r.clientId);
    else console.warn("[outbox] 자리가 모자라 오디오를 버리고 곡선만 남겼다", r.clientId);
  }
  db.close();
}

async function drop(clientId: string): Promise<void> {
  const db = await open();
  if (!db) return;
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(clientId);
  await done(tx);
  db.close();
}

async function all(): Promise<PendingRecording[]> {
  const db = await open();
  if (!db) return [];
  const rows = await new Promise<PendingRecording[]>((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as PendingRecording[]);
    req.onerror = () => resolve([]);
  });
  db.close();
  return rows;
}

function body(r: PendingRecording): FormData {
  const form = new FormData();
  if (r.cardId) form.set("card_id", r.cardId);
  if (r.chunkId) form.set("chunk_id", r.chunkId);
  form.set("pitch", r.pitch);
  if (r.targetPitch) form.set("target_pitch", r.targetPitch);
  form.set("duration_ms", String(r.durationMs));
  form.set("client_id", r.clientId);
  if (r.audio) form.set("audio", r.audio, "voice.webm");
  return form;
}

/** 보냈나 / 다시 보내 봐야 하나 / 영영 안 될 것인가. */
type Sent = "ok" | "retry" | "never";

async function post(r: PendingRecording): Promise<Sent> {
  let res: Response;
  try {
    res = await fetch("/api/recordings", { method: "POST", body: body(r) });
  } catch {
    return "retry"; // 끊겼다. 기기에 남는다.
  }
  if (res.ok) return "ok";
  /*
    **4xx 는 다시 보내도 같은 답이 온다.** 모양이 틀렸거나 내 것이 아닌 id 라 몇 번을 보내도
    안 받는다. 그런 건을 큐에 두면 **영영 안 지워지는 줄**이 되어 뒤의 것까지 매번 같이 돈다.
    다만 408(시간 초과)·429(잠깐 막힘)는 "지금은" 이라는 뜻이라 남긴다.
    401 도 남긴다 — 로그인이 풀린 것이고, 다시 들어오면 그대로 올라가야 한다.
  */
  if (res.status >= 400 && res.status < 500 && ![401, 408, 429].includes(res.status)) return "never";
  return "retry";
}

/**
 * 한 건 보내고, 못 보내면 기기에 남긴다. **부르는 쪽은 기다리지 않아도 된다** — 화면은 이미
 * 앞으로 가 있고 사용자가 할 일이 없다.
 */
export async function sendRecording(r: PendingRecording): Promise<void> {
  const sent = await post(r);
  if (sent === "retry") await keep(r);
  else if (sent === "never") console.error("[outbox] 서버가 안 받는 녹음이라 버린다", r.clientId);
}

let flushing = false;

/**
 * 남아 있는 것을 올린다. 연결이 돌아왔을 때와 루프 화면이 열릴 때 부른다.
 *
 * **같은 `clientId` 그대로 보낸다** — 서버가 그 값으로 같은 행을 두 번 안 만든다. 새로 붙이면
 * 재전송이 회차를 부풀려서, 오프라인에서 한 번 말한 것이 5회차 자리에 4회차 소리를 앉힌다.
 */
export async function flushRecordings(): Promise<void> {
  if (flushing || typeof navigator === "undefined" || navigator.onLine === false) return;
  flushing = true;
  try {
    for (const r of await all()) {
      const sent = await post(r);
      if (sent === "ok" || sent === "never") await drop(r.clientId);
      // "retry" 면 그대로 둔다. 다음 기회에 다시.
    }
  } finally {
    flushing = false;
  }
}
