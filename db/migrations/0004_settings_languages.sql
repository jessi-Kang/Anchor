-- 0004_settings_languages.sql — users.settings 를 "언어를 먼저 켜고, 언어별로 상황·단계를 채우는" 형태로
--
-- 이전 형태는 settings.purposes = {en:[..], ja:[..], es:[..]} 하나로 "상황을 고른 언어 = 켜진 언어"를
-- 암묵적으로 정했고, 단계 완료는 최상위 kana / kanji / seed 키의 유무로 봤다.
-- 그 구조에서는 "언어는 켰지만 상황은 아직", "단계를 건너뛰었지만 나중에 할 것"을 표현할 수 없어서
-- 온보딩이 한 줄로 닫혀 있었다 (다 마칠 때까지 홈에 못 들어감).
--
-- 새 형태:
--   settings.languages[lang] = { enabled_at, purposes? }   -- 키가 있으면 켠 언어. purposes 없음 = 상황 아직 안 고름
--   settings.steps[kana|kanji|seed] = 'done' | 'skipped'     -- 단계 상태는 전역. seed 는 en·es 가 같은 40장을 공유
--   settings.kana, settings.kana_module                      -- 측정 기록은 그대로
--
-- 멱등: 옛 키(purposes)가 있고 새 키(languages)가 없는 행만 변환한다. 다시 실행하면 0행.
-- 상황이 비어 있던 언어는 켠 것으로 보지 않는다 (옛 규칙과 같음).

UPDATE users
SET settings = (settings - 'purposes' - 'kana' - 'kanji' - 'seed')
  || jsonb_build_object(
       'languages',
       coalesce((
         SELECT jsonb_object_agg(
                  lang,
                  jsonb_build_object(
                    'enabled_at', to_char(coalesce(onboarded_at, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                    'purposes', ps
                  ))
         FROM jsonb_each(settings->'purposes') AS p(lang, ps)
         WHERE jsonb_typeof(ps) = 'array' AND jsonb_array_length(ps) > 0
       ), '{}'::jsonb),
       'steps',
       (SELECT coalesce(jsonb_object_agg(k, 'done'), '{}'::jsonb)
        FROM unnest(ARRAY['kana','kanji','seed']) AS k
        WHERE settings ? k)
     )
  || CASE WHEN settings ? 'kana' THEN jsonb_build_object('kana', settings->'kana') ELSE '{}'::jsonb END
WHERE settings ? 'purposes' AND NOT settings ? 'languages';
