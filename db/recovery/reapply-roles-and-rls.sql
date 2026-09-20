-- pg_restore --no-privileges 후 역할·권한·RLS 재적용 (docs/BACKUP.md 절차 C-3)
-- 0001 의 역할/권한 블록 + 0002 전체 + 0003. RLS 마이그레이션을 바꾸면 이 파일도 같이 바꾼다.
-- 실행 전 :app_password 를 넘긴다:  psql ... -v app_password='...' -f db/recovery/reapply-roles-and-rls.sql

\set ON_ERROR_STOP on

-- 변수 자체를 안 넘기면 아래 :'app_password' 가 날것으로 남아 "syntax error at :" 만 뜬다. 먼저 말해 준다.
\if :{?app_password}
\else
\echo '-v app_password=... 를 넘겨야 한다 (docs/BACKUP.md C-3)'
\quit
\endif

-- psql 의 -v 는 클라이언트 변수라 DO 블록($$...$$) 안까지 들어가지 않는다. GUC 로 한 번 옮겨야 읽힌다.
-- 이걸 빼먹으면 current_setting 이 NULL 을 주고 PASSWORD NULL 인 역할이 조용히 만들어진다
-- — 즉 복구는 "성공"했는데 앱만 로그인 못 하는 상태가 된다. 그래서 짧으면 여기서 멈춘다.
SELECT set_config('anchor.app_password', :'app_password', false);
DO $$
BEGIN
  IF coalesce(length(current_setting('anchor.app_password', true)), 0) < 16 THEN
    RAISE EXCEPTION '-v app_password=... (16자 이상) 를 넘겨야 한다';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anchor_app') THEN
    EXECUTE format('CREATE ROLE anchor_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
                   current_setting('anchor.app_password', true));
  END IF;
END $$;

-- 0001 과 같은 이유로 DB 이름을 박지 않는다. 복구본의 이름은 neondb 가 아닐 수 있다.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO anchor_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO anchor_app;
GRANT USAGE ON SCHEMA app TO anchor_app;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO anchor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, inputs, nodes, edges, user_node_state, cards, chunks, recordings, encounters
  TO anchor_app;
GRANT INSERT ON account_deletions TO anchor_app;

-- 정책은 덤프에 포함되어 있을 수 있다(pg_dump 는 POLICY 를 스키마로 취급). 있으면 지우고 다시 만든다.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

\i db/migrations/0002_rls.sql
-- 0002 가 FORCE 를 다시 걸므로 0003 으로 풀어야 소유자 연결(매일 백업)이 행을 읽는다
\i db/migrations/0003_owner_reads_for_backup.sql
