/**
 * M3 배관 검증용 시드. **14일치 상태를 과거 날짜로 만들어 넣는다.**
 *   pnpm measure:fixture          넣는다 (이미 있으면 지우고 다시)
 *   pnpm measure:fixture --wipe   지우기만 한다
 *
 * **왜 스크립트인가.** 이걸 화면으로는 못 만든다 — 과거 날짜로 행을 쌓는 것, `encounters` 를
 * 화면을 안 거치고 쓰는 것, `pitch` 배열을 정확한 모양으로 넣는 것, 같은 대상에 5회차를 묶는 것,
 * 그리고 **일부러 틀린 케이스를 섞는 것**이 전부 손이 닿지 않는 자리다. 테스터가 2주를 기다릴 수
 * 없어서 만드는 것이 아니라, 2주를 다 써도 이 케이스들은 안 생기기 때문에 만든다.
 *
 * **무엇을 확인하는가.** `pnpm measure` 가 MEASURE 의 정의대로 **거르는가**. 값이 나오는지가
 * 아니라, 빠져야 할 것이 빠지는지다. 아래 여섯 케이스는 전부 "세면 안 되는데 세기 쉬운" 자리다.
 *
 * **안전.** 이 스크립트는 `fixture-` 로 시작하는 계정만 만들고 지운다. 다른 계정 id 를 주면
 * 아무것도 안 하고 멈춘다. 만든 행은 전부 `meta.synthetic = true` 라, 실수로 남아도
 * `pnpm measure` 가 머리말에서 그렇게 말한다.
 */
import { loadEnv } from "./lib/load-env";
import { adminClient } from "./lib/admin-client";

loadEnv();

/** 이 접두사로 시작하지 않는 계정은 건드리지 않는다. 시드가 실제 데이터를 밀어내지 않게. */
const FIXTURE_PREFIX = "fixture-";
const USER_ID = `${FIXTURE_PREFIX}measure`;
const SYNTHETIC = JSON.stringify({ synthetic: true });

const wipeOnly = process.argv.includes("--wipe");

/** D일 전 시각. 시드는 "오늘부터 며칠 전"으로만 말한다 — 절대 날짜를 박으면 내일 안 맞는다. */
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/** 되풀이 가능한 난수. 돌릴 때마다 다른 곡선이 나오면 "왜 숫자가 달라졌나"를 못 가른다. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 브라우저 피치 검출이 내놓는 것과 **같은 모양**의 곡선 ([{t: ms, f0: Hz}], 20ms 간격, 무성은 0).
 * 앞뒤에 무성 구간을 붙인다 — 거리 함수의 1단계(무성 제거)가 실제로 도는지 여기서 걸린다.
 *
 * `wobble` 이 0 이면 `base` 와 같은 모양이고, 클수록 멀어진다. 회차마다 이 값을 줄이면
 * "5회차가 1회차보다 가까워졌다", 늘리면 그 반대가 된다.
 */
function curve(seed: number, wobble: number): { t: number; f0: number }[] {
  const r = rng(seed);
  const pts: { t: number; f0: number }[] = [];
  for (let i = 0; i < 3; i++) pts.push({ t: i * 20, f0: 0 });
  for (let i = 0; i < 44; i++) {
    const shape = 190 + 35 * Math.sin(i / 6) - 12 * Math.cos(i / 3.5);
    const f0 = shape * (1 + wobble * (r() - 0.5));
    pts.push({ t: (i + 3) * 20, f0: Math.round(f0 * 10) / 10 });
  }
  for (let i = 0; i < 2; i++) pts.push({ t: (i + 47) * 20, f0: 0 });
  return pts;
}

type Voice = { kind: "lang" | "clone" | "preset"; id: string } | null;

async function main() {
  if (!USER_ID.startsWith(FIXTURE_PREFIX)) throw new Error(`계정 id 가 ${FIXTURE_PREFIX} 로 시작하지 않는다`);
  const client = adminClient();
  await client.connect();
  try {
    // 계정 하나를 지우면 모든 사용자 표가 CASCADE 로 따라간다 (0001 의 FK). 시드를 다시 넣는 것은
    // 언제나 "지우고 처음부터" 다 — 부분 갱신은 옛 행과 새 행이 섞여 기대값을 못 적는다.
    await client.query("DELETE FROM users WHERE id LIKE $1", [`${FIXTURE_PREFIX}%`]);
    if (wipeOnly) {
      console.log(`지웠다: ${FIXTURE_PREFIX}* 계정과 딸린 모든 행.`);
      return;
    }
    await client.query(
      "INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4)",
      [USER_ID, `${USER_ID}@anchor.invalid`, "측정 배관 확인용", daysAgo(15)],
    );

    const node = async (key: string, lang: "ja" | "en", kind: "kanji" | "chunk") => {
      // 공용 노드(user_id IS NULL)를 만들지 않는다. 공용은 모든 계정의 화면에 뜨므로 시드가
      // 거기 들어가면 Jessi 의 뽑기 화면에 합성 한자가 나온다. 이 계정 것으로만 만든다.
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO nodes (user_id, lang, kind, key, display, meta) VALUES ($1, $2, $3, $4, $4, $5) RETURNING id",
        [USER_ID, lang, kind, key, SYNTHETIC],
      );
      return rows[0].id;
    };
    const input = async (lang: "ja" | "en", title: string, body: string, ago: number) => {
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO inputs (user_id, kind, lang, title, body, created_at, extracted_at, meta) VALUES ($1, 'paste', $2, $3, $4, $5, $5, $6) RETURNING id",
        [USER_ID, lang, title, body, daysAgo(ago), SYNTHETIC],
      );
      return rows[0].id;
    };
    const card = async (nodeId: string, inputId: string, landedAgo: number) => {
      const at = daysAgo(landedAgo);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO cards (user_id, kind, lang, node_id, input_id, payload, guess, guess_at, guess_correct, revealed_at, landed_at, created_at, meta)
         VALUES ($1, 'discover', 'ja', $2, $3, '{}'::jsonb, '추측', $4, true, $4, $4, $4, $5) RETURNING id`,
        [USER_ID, nodeId, inputId, at, SYNTHETIC],
      );
      return rows[0].id;
    };
    const encounter = (nodeId: string, inputId: string, recognized: boolean, ago: number) =>
      client.query(
        "INSERT INTO encounters (user_id, node_id, input_id, recognized, created_at, meta) VALUES ($1, $2, $3, $4, $5, $6)",
        [USER_ID, nodeId, inputId, recognized, daysAgo(ago), SYNTHETIC],
      );
    /** 같은 대상에 회차를 쌓는다. 기준선은 1회차 것을 그대로 물려준다 — 앱이 하는 것과 같다. */
    const attempts = async (
      target: { card: string } | { chunk: string },
      wobbles: number[],
      voice: Voice,
      seed: number,
      startAgo: number,
    ) => {
      const base = voice ? curve(seed, 0) : null;
      for (let i = 0; i < wobbles.length; i++) {
        await client.query(
          `INSERT INTO recordings (user_id, card_id, chunk_id, attempt, pitch, target_pitch, duration_ms, created_at, target_voice_kind, target_voice_id, meta)
           VALUES ($1, $2, $3, $4, $5, $6, 3000, $7, $8, $9, $10)`,
          [
            USER_ID,
            "card" in target ? target.card : null,
            "chunk" in target ? target.chunk : null,
            i + 1,
            JSON.stringify(curve(seed + 100 + i, wobbles[i])),
            base ? JSON.stringify(base) : null,
            daysAgo(Math.max(0, startAgo - i)),
            voice?.kind ?? null,
            voice?.id ?? null,
            SYNTHETIC,
          ],
        );
      }
    };

    // ── 재만남 ────────────────────────────────────────────────────────────────
    // 자료 셋: 카드를 푼 자료(D-12), 자격을 갖춘 새 자료(D-4), 그보다 뒤의 자료(D-2).
    const src = await input("ja", "카드를 푼 자료", "합성", 12);
    const again = await input("ja", "자격을 갖춘 새 자료", "합성", 4);
    const later = await input("ja", "그 뒤의 자료", "합성", 2);

    // 분모에 드는 10자. 7자는 읽기를 안 열었고(true), 3자는 열었다(false) → 70.0%
    const main10 = [..."協収談報誠拠支承継績"];
    const opened = new Set(["支", "承", "継"]);
    const cardOf = new Map<string, string>();
    for (const ch of main10) {
      const id = await node(ch, "ja", "kanji");
      cardOf.set(ch, await card(id, src, 12));
      await encounter(id, again, !opened.has(ch), 4);
      // **실패 케이스 1 — 글자마다 첫 재만남 한 번.** 承 은 D-4 에 열었고(false) D-2 에 안 열었다(true).
      // 늦은 줄을 세면 분자가 8 이 되어 80% 가 나온다. 첫 줄을 세면 7/10 = 70% 다.
      if (ch === "承") await encounter(id, later, true, 2);
    }

    // **실패 케이스 2 — 자격 미달.** 착지 D-5, 재만남 자료 D-4 → 간격 1일. 분모에서 빠져야 한다.
    const tooSoon = await node("暫", "ja", "kanji");
    await card(tooSoon, src, 5);
    await encounter(tooSoon, again, true, 4);

    // **실패 케이스 3 — 착지했지만 다시 안 나왔다.** 분모에 넣으면 앱의 효과가 아니라 자료 선택을 잰다.
    for (const ch of ["謹", "頒"]) await card(await node(ch, "ja", "kanji"), src, 12);

    // ── 곡선 ──────────────────────────────────────────────────────────────────
    const chunk = async (text: string, lang: "en" | "ja", ago: number) => {
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO chunks (user_id, lang, situation, text, created_at, meta) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [USER_ID, lang, "합성 상황", text, daysAgo(ago), SYNTHETIC],
      );
      return rows[0].id;
    };
    const LANG_VOICE: Voice = { kind: "lang", id: "fixture-en-voice" };
    const CLONE: Voice = { kind: "clone", id: "fixture-clone-voice" };

    // 가까워진 대상: 흔들림이 회차마다 줄어든다.
    await attempts({ chunk: await chunk("push this to next week", "en", 9) }, [0.5, 0.4, 0.3, 0.2, 0.08], LANG_VOICE, 11, 9);
    // 멀어진 대상: 늘어난다. **가까워진 것만 세는지** 여기서 걸린다.
    await attempts({ chunk: await chunk("let me get back to you", "en", 8) }, [0.08, 0.2, 0.3, 0.4, 0.55], CLONE, 22, 8);
    // **실패 케이스 4 — 5회차까지 안 갔다.** 3회차뿐이라 "둘 다 잰 대상"에서 빠져야 한다.
    await attempts({ chunk: await chunk("can we park that", "en", 6) }, [0.4, 0.3, 0.2], CLONE, 33, 6);
    // **실패 케이스 5 — 겨눈 곡선이 없다.** 5회차까지 갔지만 target_pitch 가 없어 거리를 못 잰다.
    // 없는 것을 0(완벽히 같다)으로 세면 그 대상이 항상 통과로 잡힌다.
    await attempts({ chunk: await chunk("I'll circle back", "en", 5) }, [0.4, 0.3, 0.25, 0.2, 0.1], null, 44, 5);
    // **실패 케이스 6 — 일본어.** 계산은 하지만 M4 판정에는 안 들어간다. 영어와 합치면 그 결정이 사라진다.
    // 위에서 이미 착지한 카드에 회차를 매단다 — 곡선용 카드를 따로 만들면 "착지한 한자" 수가
    // 실제보다 하나 늘어, 재만남 쪽 참고 숫자가 틀린다. 화면에서도 F10 은 그 카드에서 말한다.
    await attempts({ card: cardOf.get("協")! }, [0.5, 0.4, 0.3, 0.2, 0.1], CLONE, 55, 10);

    console.log(`넣었다: 계정 ${USER_ID} (모든 행 meta.synthetic = true)`);
    console.log("");
    console.log(`  pnpm measure ${USER_ID}`);
    console.log("");
    console.log("배관이 맞으면 이렇게 나온다. 하나라도 다르면 스크립트가 정의대로 안 거른 것이다.");
    console.log("  재만남: 분모 10 · 분자 7 → 70.0%");
    console.log("          참고 — 착지한 한자 13자 · 자격 미달 1자 · 다시 안 나온 한자 2자");
    console.log("  곡선 영어: 가까워진 대상 1 / 2   (3회차뿐인 것과 겨눈 곡선이 없는 것은 빠진다)");
    console.log("          기준선 출처가 안 남은 대상 1개");
    console.log("  곡선 일본어: 가까워진 대상 1 / 1  (따로 적히고 통과·미달에 안 들어간다)");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
