-- 0007_measure_columns.sql — 기준선 출처를 행에 남긴다
--
-- `docs/MEASURE.md` 가 정의의 원본이다. 이 파일은 그 정의가 **행에 남으려면** 있어야 하는 칸만 만든다.
-- 값이 좋은지 나쁜지, 자격을 갖췄는지는 여기서 안 본다 — 거르는 것은 `pnpm measure` 가 한다
-- (MEASURE 0′장: 걸러서 적으면 정의를 바꾼 날 다시 못 센다).
--
-- 기존 행을 건드리지 않는다. 새 칸은 NULL 로 남고, 세는 쪽이 "모름"으로 읽는다.
-- 오늘부터 실제 데이터가 쌓이므로 비어 있는 칸은 오늘치부터 채워진다.

-- ── 1. 기준선을 무엇으로 만들었는가 ──────────────────────────────────────────
-- MEASURE 2장: 곡선 거리는 1회차에 뽑은 원어민 곡선(`target_pitch`)을 고정해서 잰다. 그 곡선을
-- 어느 목소리로 만들었는지가 안 남으면, 목소리 ID 가 바뀐 날 **어느 행이 어느 기준선인지 몰라
-- 전부 못 쓴다.** 곡선은 남아 있는데 그 곡선이 무엇인지를 모르는 상태가 된다.
--
-- 두 칸을 따로 두는 이유가 다르다.
--   target_voice_id   그때 실제로 소리를 낸 ElevenLabs 목소리 ID. **이쪽이 사실이다.**
--                     환경변수가 바뀌어도 이 값은 그대로라, 옛 행이 계속 읽힌다.
--   target_voice_kind 그 ID 가 쓰일 때 무엇으로 골라졌는가. 적는 시점에 굳힌다.
--                     'lang'  = 언어별 전용 목소리 (ELEVENLABS_VOICE_ID_EN / _JA)
--                     'clone' = Jessi 목소리 클론 (ELEVENLABS_VOICE_ID_JESSI)
--                     'preset'= ElevenLabs 기본 목소리
--                     MEASURE 2장의 클론 기준선 시험이 이 값으로 행을 가른다.
-- 목소리 ID 는 비밀값이 아니다(클론 ID 가 CLAUDE.md 에 적혀 있다). 내보내기에 그대로 나가도 된다.
ALTER TABLE recordings ADD COLUMN target_voice_kind text
  CHECK (target_voice_kind IN ('lang', 'clone', 'preset'));
ALTER TABLE recordings ADD COLUMN target_voice_id text;

-- 합성 행(M3 배관 확인용 14일치)을 가르는 **표시 열은 만들지 않는다.** 전용 계정 하나에 넣고
-- `pnpm measure` 가 `user_id` 를 인자로 받으므로 RLS 와 같은 경계가 이미 갈라 준다. 열을 두면
-- 다음 사람이 `WHERE meta->>'synthetic' IS NULL` 로 거르기 시작하고, 그게 계정 인자를 대신하다가
-- 언젠가 빠진다. 거르지 않는 열은 언젠가 거르는 데 쓰인다.

-- ── 2. 세는 쪽이 밟는 길 ─────────────────────────────────────────────────────
-- 재만남 분모는 "착지한 카드의 한자가 +3일 뒤 자료에 다시 나왔는가" 라 cards 를 landed_at 으로
-- 훑는다. 곡선은 대상(card_id / chunk_id)별로 attempt 순서를 본다.
CREATE INDEX cards_user_landed_idx ON cards (user_id, node_id) WHERE landed_at IS NOT NULL;
CREATE INDEX recordings_card_attempt_idx  ON recordings (user_id, card_id, attempt)  WHERE card_id IS NOT NULL;
CREATE INDEX recordings_chunk_attempt_idx ON recordings (user_id, chunk_id, attempt) WHERE chunk_id IS NOT NULL;

-- GRANT 는 표 단위라 새 칸에 그대로 걸린다(0001 의 GRANT ... ON recordings).
-- RLS 정책도 칸을 안 보므로 그대로다.
