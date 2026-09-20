-- 0001_init.sql — 역할, 스키마, 테이블
-- 실행 주체: DATABASE_URL_ADMIN (테이블 소유자). 앱은 anchor_app 으로만 접속한다.
-- __ANCHOR_APP_PASSWORD__ 는 scripts/migrate.ts 가 환경 변수로 치환한다.

-- ── 앱 역할 ──────────────────────────────────────────────────────────────────
-- Neon 콘솔/API로 만든 역할은 neon_superuser 멤버라 RLS를 우회한다.
-- 그래서 앱 역할은 반드시 SQL로 만들고 BYPASSRLS 를 주지 않는다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anchor_app') THEN
    EXECUTE format('CREATE ROLE anchor_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
                   '__ANCHOR_APP_PASSWORD__');
  END IF;
END $$;

-- 복구하는 자리에서는 DB 이름이 neondb 가 아닐 수 있다(스냅샷을 다른 프로젝트·다른 이름으로 되살리는 경우).
-- 이름을 박아 두면 바로 여기서 마이그레이션 전체가 멈춘다. 그래서 접속 중인 DB 에 준다.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO anchor_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO anchor_app;

-- ── 헬퍼 스키마 ───────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO anchor_app;

-- 현재 요청의 사용자 ID. withUser() 가 트랜잭션마다 SET LOCAL 한다. 없으면 NULL → 모든 정책이 false.
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;

CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ── 열거형 ───────────────────────────────────────────────────────────────────
-- 언어는 라우트가 아니라 데이터 속성이다. ko 는 앵커(소리) 노드용, xx 는 언어 무관(태도 분류 등).
CREATE TYPE lang AS ENUM ('en', 'ja', 'es', 'ko', 'xx');

-- 노드 종류: 부품(radical, root, grammar, chunk, attitude, sound) 또는 단어(word, kanji).
CREATE TYPE node_kind AS ENUM ('kanji', 'radical', 'word', 'root', 'grammar', 'chunk', 'sound', 'attitude');

-- 엣지 종류 (CLAUDE.md 앵커 그래프 데이터 모델)
--  part_of         부품 ∈ 단어            (力 → 協)
--  ko_sound_onyomi 한국 한자음 ↔ 음독      (협 → きょう)
--  ko_sound_of     한국어 한자어 소리 → 한자 (협 → 協)
--  cognate         영어 어근 = 스페인어 단어 (spect → inspeccionar)
--  attitude        기능 분류(태도 9종)      (It seems like → 내적 태도)
--  intensity       같은 태도의 강도 한 단계 위 (tired → worn out)
--  landing         정답에서 착지하는 아는 단어 (協 → 協力)
--  concept         업무 개념 브릿지          (知能 ↔ intelligence ↔ inteligencia)
CREATE TYPE edge_rel AS ENUM ('part_of', 'ko_sound_onyomi', 'ko_sound_of', 'cognate', 'attitude', 'intensity', 'landing', 'concept');

CREATE TYPE input_kind AS ENUM ('paste', 'share', 'url', 'memo');
CREATE TYPE card_kind  AS ENUM ('discover', 'chunk');
CREATE TYPE state_source AS ENUM ('default', 'onboarding', 'card', 'input', 'talk', 'inferred');

-- ── users ────────────────────────────────────────────────────────────────────
-- id 는 Neon Auth 의 user.id (text). 모든 사용자 테이블은 여기로 FK + ON DELETE CASCADE.
CREATE TABLE users (
  id                    text PRIMARY KEY,
  email                 text NOT NULL,
  name                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  onboarded_at          timestamptz,
  -- 설정 (SITEMAP /settings): 음성 보관 기간, 목소리 선택
  voice_retention_days  int  NOT NULL DEFAULT 30 CHECK (voice_retention_days BETWEEN 1 AND 365),
  preferred_voice       text NOT NULL DEFAULT 'default',   -- 'default' | 'mine'
  settings              jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ── inputs: 붙여넣은 자료, 공유 시트, "못 한 말" 메모 ─────────────────────────
CREATE TABLE inputs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          input_kind NOT NULL,
  lang          lang NOT NULL,
  title         text,
  body          text NOT NULL,
  source_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  extracted_at  timestamptz,                 -- 모르는 것 추출이 끝난 시각
  is_public     boolean NOT NULL DEFAULT false, -- 기본 비공개. 항목 단위로만 공개.
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX inputs_user_created_idx ON inputs (user_id, created_at DESC);

-- ── nodes: 앵커 그래프 노드 (언어 무관 공통 테이블) ───────────────────────────
-- user_id IS NULL → 공용 참조 데이터(KANJIDIC2, IDS, 한자음 사전, 어원 사전에서 적재). 모든 사용자가 읽는다.
-- user_id 있음   → 사용자 개인 노드(못 한 말에서 만든 덩어리 등). 본인만.
CREATE TABLE nodes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text REFERENCES users(id) ON DELETE CASCADE,
  lang        lang NOT NULL,
  kind        node_kind NOT NULL,
  key         text NOT NULL,          -- 정규화 키: '協', '力', 'spect', 'push this to', '협'
  display     text NOT NULL,          -- 화면 표시 (한자, 덩어리 원문)
  reading     text,                   -- よみがな / 발음 (일본어 텍스트는 항상 ruby)
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- 쉬운 정의, 예문, 어원 등
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX nodes_shared_key_uq ON nodes (lang, kind, key) WHERE user_id IS NULL;
CREATE UNIQUE INDEX nodes_user_key_uq   ON nodes (user_id, lang, kind, key) WHERE user_id IS NOT NULL;
CREATE INDEX nodes_kind_lang_idx ON nodes (kind, lang);

-- ── edges ────────────────────────────────────────────────────────────────────
CREATE TABLE edges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text REFERENCES users(id) ON DELETE CASCADE,   -- NULL = 공용
  src         uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  dst         uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  rel         edge_rel NOT NULL,
  weight      real NOT NULL DEFAULT 1.0,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (src <> dst)
);
CREATE UNIQUE INDEX edges_shared_uq ON edges (src, dst, rel) WHERE user_id IS NULL;
CREATE UNIQUE INDEX edges_user_uq   ON edges (user_id, src, dst, rel) WHERE user_id IS NOT NULL;
CREATE INDEX edges_src_idx ON edges (src);
CREATE INDEX edges_dst_idx ON edges (dst);

-- ── user_node_state: "안다"는 세 층 ──────────────────────────────────────────
-- "협력은 아는데 協은 모른다" → 협(ko sound) knows_sound=true, 協(ja kanji) knows_meaning=false.
CREATE TABLE user_node_state (
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id        uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  knows_sound    boolean NOT NULL DEFAULT false,
  knows_meaning  boolean NOT NULL DEFAULT false,
  can_say        boolean NOT NULL DEFAULT false,
  confidence     real NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  source         state_source NOT NULL DEFAULT 'default',
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, node_id)
);
CREATE TRIGGER user_node_state_touch BEFORE UPDATE ON user_node_state
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ── cards: 생성된 발견 카드와 추측 기록 ───────────────────────────────────────
-- 추측(guess_at)은 항상 정답(revealed_at)보다 먼저여야 한다. DB 제약으로도 막는다.
CREATE TABLE cards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           card_kind NOT NULL,
  lang           lang NOT NULL,
  node_id        uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  input_id       uuid REFERENCES inputs(id) ON DELETE SET NULL,   -- 출처 (F04)
  payload        jsonb NOT NULL,     -- {hook, known, parts[], answer, definition, landing[], bridge, onyomi_pattern, nuance?}
  guess          text,               -- 사용자가 먼저 쓴 추측 (건너뛰면 NULL, skipped_at 기록)
  guess_at       timestamptz,
  skipped_at     timestamptz,
  guess_correct  boolean,
  revealed_at    timestamptz,
  landed_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (revealed_at IS NULL OR guess_at IS NOT NULL OR skipped_at IS NOT NULL),
  CHECK (guess_at IS NULL OR revealed_at IS NULL OR guess_at <= revealed_at)
);
CREATE INDEX cards_user_created_idx ON cards (user_id, created_at DESC);
CREATE INDEX cards_user_node_idx ON cards (user_id, node_id);

-- ── chunks: 대화 덩어리 ("못 한 말" 한 줄 → 영어 덩어리 1~2개) ───────────────
CREATE TABLE chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lang        lang NOT NULL,
  situation   text NOT NULL,          -- 한국어 상황 한 줄 (후킹은 항상 상황)
  text        text NOT NULL,          -- 덩어리 원문 ("push this to next week")
  attitude    text,                   -- 태도 9종 중 하나 (SPEC 5장)
  intensity   smallint NOT NULL DEFAULT 1 CHECK (intensity BETWEEN 1 AND 3),
  node_id     uuid REFERENCES nodes(id) ON DELETE SET NULL,   -- 그래프 상의 chunk 노드
  input_id    uuid REFERENCES inputs(id) ON DELETE SET NULL,  -- 출처 메모
  nuance      text,                   -- 접힌 한 줄 (Culture Point). 열어야 보인다.
  created_at  timestamptz NOT NULL DEFAULT now(),
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX chunks_user_created_idx ON chunks (user_id, created_at DESC);

-- ── recordings: 피치 데이터만 보관 ────────────────────────────────────────────
-- 원본 오디오는 별도 암호화 스토리지(object key 만 기록), users.voice_retention_days 후 삭제.
CREATE TABLE recordings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_id          uuid REFERENCES chunks(id) ON DELETE CASCADE,
  card_id           uuid REFERENCES cards(id) ON DELETE CASCADE,
  attempt           int NOT NULL DEFAULT 1,
  pitch             jsonb NOT NULL,        -- [{t: ms, f0: Hz}], 브라우저에서 추출
  target_pitch      jsonb,                 -- 비교 대상(TTS) 곡선
  match_score       real CHECK (match_score BETWEEN 0 AND 1),
  duration_ms       int,
  audio_object_key  text,                  -- 원본 위치. 만료 후 NULL
  audio_expires_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (chunk_id IS NOT NULL OR card_id IS NOT NULL)
);
CREATE INDEX recordings_user_created_idx ON recordings (user_id, created_at DESC);
CREATE INDEX recordings_expiry_idx ON recordings (audio_expires_at) WHERE audio_object_key IS NOT NULL;

-- ── encounters: 재만남 기록 (성공 지표 "재만남 인식률") ───────────────────────
CREATE TABLE encounters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id     uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  input_id    uuid REFERENCES inputs(id) ON DELETE CASCADE,
  recognized  boolean,                -- 하이라이트를 클릭 없이 지나갔으면 true
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX encounters_user_node_idx ON encounters (user_id, node_id, created_at DESC);

-- ── account_deletions: 삭제 원장 ─────────────────────────────────────────────
-- 계정 삭제는 즉시 CASCADE 로 지워지지만 백업 파일 안의 사본은 남는다.
-- 이 원장은 (1) 보존 기간 안의 백업을 복구할 때 해당 사용자를 다시 지우는 데,
-- (2) 백업 보존 기간이 지나 사본이 완전히 사라졐음을 확인하는 데 쓴다. 앱 역할은 INSERT 만 가능.
CREATE TABLE account_deletions (
  user_id            text PRIMARY KEY,
  requested_at       timestamptz NOT NULL DEFAULT now(),
  backups_purged_at  timestamptz            -- BACKUP_RETENTION_DAYS 경과 후 backup 워크플로가 채운다
);

-- ── 권한 ─────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, inputs, nodes, edges, user_node_state, cards, chunks, recordings, encounters
  TO anchor_app;
GRANT INSERT ON account_deletions TO anchor_app;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO anchor_app;

-- 마이그레이션 상태를 /api/health 가 읽을 수 있게 (schema_migrations 는 러너가 먼저 만든다)
GRANT SELECT ON schema_migrations TO anchor_app;
