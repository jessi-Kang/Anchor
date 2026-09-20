# Anchor

내가 매일 만나는 자료와 못 한 말에서 출발해, 내가 규칙을 발견하고 소리로 꺼내게 만드는 **3개 언어(영어·일본어·스페인어) 대화 워크스페이스**.

Anchor는 "가르치는 서비스"가 아니다. 커리큘럼도, 레벨도, 데일리 퀴즈도 없다. 사용자의 인풋(업무 문서, 수업 자료, 일본어 기사, 스페인어 릴스, 그리고 "오늘 못 한 말")이 들어오면 거기서 모르는 것만 뽑아, **발견 루프**와 **앵커 그래프** 위에 올려 준다.

이름의 뜻: 아는 것에 닻을 내리고 새 것을 끌어온다.

> 1차 사용자는 Jessi(PM, 한국어 화자) 한 명이다. 단, 데이터 구조는 첫날부터 다수 계정·기본 비공개다.

---

## 핵심 원칙

모든 기능은 아래 원칙 중 하나를 구현한 것이어야 한다. 어느 원칙에도 속하지 않는 기능은 만들지 않는다.

| # | 원칙 | 한 줄 |
| --- | --- | --- |
| 0 | 목표는 대화 | 모든 학습 항목은 말할 상황에서 출발해 말하기로 끝난다 |
| 1 | 설명하지 말고 발견시켜라 | 규칙·뜻을 먼저 보여주지 않는다. 사용자가 먼저 추측 → 확인. 문법 설명 텍스트 금지 |
| 2 | 아는 것 위에만 쌓아라 | 일본어 한자는 한국어 한자어의 **소리**에, 스페인어는 영어 어근에, 영어는 업무 어휘에 앵커. 정의는 그 언어 안의 쉬운 단어로(롱맨 방식) |
| 3 | 소리는 덩어리·루프·눈으로 | 연음·억양 규칙 텍스트 금지. 덩어리 단위로 듣기 → 따라 말하기 → 내 곡선과 원어민 곡선 겹쳐 보기 |
| 4 | 커리큘럼 대신 내 인풋 | 학습 순서는 앵커 그래프("아는 것 + 1")가 정한다. 복습은 카드 반복이 아니라 다음 인풋에서의 재만남 |

### 발견 카드 한 장

카드 하나는 한자 하나, 화면 여섯 장이다. 한 장면은 한 화면을 넘지 않고, 추측 입력은 **항상** 정답보다 먼저 나온다.

```
출처(F04) → 아는 단어 → 부품 → 내가 먼저 추측 → 정답 → 아는 단어로 착지(Scene1~5)
```

### 앵커 3종

| 앵커 | 예 |
| --- | --- |
| 한국어 한자어의 소리 → 한자 → 일본어 음독 | 협(ㅂ) → 協 → きょう, 학(ㄱ) → 学 → がく |
| 영어 라틴 어근 → 스페인어 | -tion → -ción, -ty → -dad, -ly → -mente |
| 업무 도메인 어휘 → 세 언어 | 지능 → 知能 ちのう / intelligence / inteligencia |

## 하지 않는 것

- 레벨 테스트, "초급/중급/고급" 질문, 자기 보고식 수준 입력. "아는 것"은 실제 자료에서 뽑은 항목에 "알아 / 몰라"를 누르는 행동으로만 채운다
- 미리 채우는 준비 단계(씨앗 덱, 상황 고르기). 언어를 켜면 바로 그 언어의 자료 넣기로 간다
- 스트리크·포인트·리더보드·공개 프로필·친구 기능
- 텍스트 채팅형 회화, 문법 교정
- 플래시카드 반복(SRS)
- 한자 쓰기·필순

Jessi에게 "초급/중급/고급"을 묻는 UI가 생기면 버그다.

## 데이터 원칙 (협상 불가)

- Google 로그인(Neon Auth). 모든 테이블에 `user_id`, Postgres RLS로 계정 간 분리. 사용자 1명이어도 동일.
- 기본 비공개. 공개는 항목 단위로 사용자가 명시적으로 켤 때만.
- 데이터 유실 = 즉시 이탈. 백업은 세 층(Neon PITR · 배포 전 스냅샷 · Neon 밖 매일 JSON 백업). 기간·절차는 [docs/BACKUP.md](./docs/BACKUP.md).
- 전체 내보내기(JSON) 언제든. 계정 삭제 시 백업 사본까지 삭제.
- 음성 녹음은 계정 전용 암호화 스토리지. 원본은 30일 후 삭제(설정 가능), 피치 데이터만 보관.
- 오프라인/저장 실패 시 브라우저 임시 보관 후 재전송. 추측 한 번, 녹음 한 번도 유실 없음.
- 사용자 자료를 외부 LLM에 보낼 때 학습에 쓰지 않는 설정으로 호출.

## 스택

| 영역 | 선택 |
| --- | --- |
| 앱 | Next.js (App Router) · TypeScript · 모바일 우선 PWA (네이티브 앱 아님) |
| 배포 | Vercel |
| DB / 인증 | Neon Postgres (RLS) · Neon Auth (Google OAuth) |
| LLM | Claude API: 한자·어근 분해, 후킹 질문, 쉬운 정의(어휘 제한), 덩어리 추출 |
| 음성 | ElevenLabs TTS (기본 목소리 + Jessi 목소리 클론) · Web Audio API + 브라우저 피치 검출 |
| 데이터 | KANJIDIC2, 한자 구성요소(IDS), 한국 한자음 사전, 영·서 어원 사전 (공개) |

### 앵커 그래프 데이터 모델

- **노드**: 부품(한자 부수, 어근, 문법 구조, 대화 덩어리) 또는 단어. 언어 무관 공통 테이블.
- **엣지**: "부품 ∈ 단어", "한국 한자음 ↔ 음독", "영어 어근 = 스페인어 단어", "기능 분류(태도 9종)".
- **사용자별 노드 상태 3층**: `knows_sound`, `knows_meaning`, `can_say`. "협력은 아는데 協은 모른다"가 표현돼야 한다.
- **다음 카드** = 아는 노드에서 가장 가까운 모르는 노드. 추측 결과로 인접 노드 확신도 보정.

## 문서

| 문서 | 무엇 |
| --- | --- |
| [CLAUDE.md](./CLAUDE.md) | 코딩할 때 항상 지키는 지침 (원칙·금지·디자인·커밋 규칙) |
| [docs/SPEC.md](./docs/SPEC.md) | 왜 이렇게 만드는가. 문제 정의 → 원칙 → 모듈 → 언어별 적용 → 로드맵 |
| [docs/FLOW.md](./docs/FLOW.md) | 사용자가 밟는 화면 순서와 각 화면의 목적·나가는 길. **코드가 이 문서와 다르면 코드가 틀린 것이다** |
| [docs/SITEMAP.md](./docs/SITEMAP.md) | 라우트와 화면 파일의 대응, API 경계 |
| [docs/STATUS.md](./docs/STATUS.md) | 지금 실제로 있는 것과 없는 것 |
| [docs/TEAM.md](./docs/TEAM.md) | 누가 어디를 고치는가, 통합 규칙, 완결 기준, 우선순위 |
| [docs/BACKUP.md](./docs/BACKUP.md) | 백업 세 층과 복구 절차 |
| [db/README.md](./db/README.md) | 스키마·마이그레이션·두 개의 DB 연결 |

## 화면 흐름

언어는 라우트가 아니라 데이터 속성이다. 세 언어가 같은 화면을 재사용하고, 하단 탭바는 없다. 상단 왼쪽 "지금 어디" 라벨은 한 단계 위로 가는 링크라, 어느 화면에서도 홈까지 2탭이다.

기준은 하나다: **첫 5분 안에 "내 자료에서 내가 맞힌 한자" 하나가 생긴다.** 로그인 → 언어 고르기 → 자료 넣기(예시 자료 1개를 탭 한 번으로) → 뽑기 → 가나 6개 읽기(일본어 첫 카드 직전 한 번) → 카드 → 말하기 → 그래프 → 홈. 준비 단계는 없다.

라우트 표는 [docs/SITEMAP.md](./docs/SITEMAP.md), 화면 순서와 각 화면의 목적은 [docs/FLOW.md](./docs/FLOW.md).

### 디자인 시스템 요약

- 텍스트 세기 3단계로만 위계: `#2A2D33` / `#6B7078` / `#9AA0A8`. 순수 검정 금지.
- 강조는 글자색이 아니라 배경 틴트 `#E9EEF6`. 채도 높은 색, 그린·앰버 계열 금지.
- 배경 `#F6F6F7`, 카드 흰색 + 1px `#E6E7EA`, 반경 18px. 검은 주 버튼 1개(56px)만.
- 폰트는 Noto Sans KR / Noto Sans JP만. 세리프·모노스페이스 금지.
- 일본어 텍스트에는 항상 よみがな(ruby). 그래프·곡선에는 항상 범례.

## 저장소 구조

```
.
├── CLAUDE.md            코딩 시 항상 지켜야 하는 지침
├── docs/                SPEC · FLOW · SITEMAP · STATUS · TEAM · BACKUP
├── design/
│   ├── tokens.json      디자인 토큰 (색·폰트·반경·간격·곡선·그래프 색)
│   ├── SCREENS.md       화면 목록과 순서
│   ├── screens/*.html   390×844 정적 화면 참고 (문구·위계·버튼 개수를 그대로 옮긴다)
│   ├── screenshots/     위 화면의 PNG
│   └── logo/            확정 로고 A안 (alternatives/는 탈락안, 제품에 쓰지 않음)
├── prompts/kickoff.md   구현 시작 프롬프트
├── src/
│   ├── app/             Next.js App Router (페이지, /api/*, tokens.css, onboarding/)
│   ├── components/ui/   공통 뼈대: Screen·Card·Label·Row·Pill·Button·Ghost
│   ├── lib/auth/        Neon Auth 서버·클라이언트 인스턴스
│   ├── lib/db/          withUser() 트랜잭션 헬퍼 (RLS 컨텍스트)
│   └── proxy.ts         라우트 보호 미들웨어
├── db/
│   ├── migrations/      SQL 마이그레이션 (0001 스키마·역할, 0002 RLS, 0003 소유자 읽기, 0004 settings 구조)
│   ├── seed/            공용 참조 노드 (ja-seed.json 한자 40, en-seed.json 영어 어근·덩어리 40)
│   └── recovery/        복구 시 역할·RLS 재적용
├── scripts/             migrate.ts, seed.ts, backup/(neon-snapshot·restore-json), design/(tokens-to-css·check-screen)
├── vercel.json          빌드 명령·리전(icn1)·매일 백업 cron
└── .github/workflows/   backup.yml (선택: pg_dump → 외부 S3)
```

## 구현 상태

지금 무엇이 있고 무엇이 없는지는 [docs/STATUS.md](./docs/STATUS.md). 다음에 무엇을 만드는지는 [docs/TEAM.md](./docs/TEAM.md) 4장.

## 로드맵

| 단계 | 만드는 것 |
| --- | --- |
| MVP (3주) | 일본어 한자 발견 카드 + 앵커 그래프, 영어 대화 루프 초기판 |
| v0.5 (2주) | 인풋 레이어(브라우저 확장, 못 한 말 메모) + 재만남 하이라이트 |
| v1 (4주) | 대화 루프 완성 (영·일·서 음성) |
| v1.5 (4주) | 영어 어근 + 스페인어 브릿지, 문법 블록 |
| v2 | 이미지 연상, PDF·영상 인풋, 다수 사용자 |

각 단계가 검증하는 가설과 통과 기준은 [docs/SPEC.md](./docs/SPEC.md) 9장.

## 배포

- 프로덕션: https://anchor-jessikang.vercel.app (Vercel 팀 `jessikang` → 프로젝트 `anchor`, 리전 icn1)
- DB·Auth: Neon 프로젝트 `anchor` (Vercel 마켓플레이스 통합, 싱가포르). Neon 조직이 Vercel 관리형이라 프로젝트는 Vercel Storage 에서 만든다.
- 통합이 `DATABASE_URL`(소유자)·`NEON_AUTH_BASE_URL` 을 주입하고, 앱은 별도로 넣은 `ANCHOR_DATABASE_URL`(anchor_app) 만 쓴다.
- `main` 에 푸시하면 자동 배포된다. 마이그레이션은 자동으로 돌지 않는다: 새 SQL 파일을 만들면 `pnpm db:migrate` 를 손으로(또는 Neon MCP 로) 적용한 뒤 푸시한다.
- Google 로그인은 Neon Auth 의 공용 개발 자격증명으로 동작한다. 공개 전에 Google 클라이언트를 직접 등록한다 (docs: https://neon.com/docs/auth/guides/setup-oauth).

## 개발

```bash
pnpm install
cp .env.example .env.local        # 값 채우기 (아래 표)
pnpm db:migrate                    # DATABASE_URL_ADMIN(또는 DATABASE_URL) 로 스키마 + RLS 적용
pnpm db:seed                       # 공용 참조 노드 적재 (한자 40, 영어 어근·덩어리 40. 뽑기 화면의 앵커·패턴 재료)
pnpm dev                           # http://localhost:3000
```

| 변수 | 무엇 |
| --- | --- |
| `ANCHOR_DATABASE_URL` | 앱 런타임 연결. 마이그레이션이 만드는 `anchor_app` 역할 (RLS 우회 불가) |
| `DATABASE_URL_ADMIN` | 마이그레이션·백업 전용. 테이블 소유자. 없으면 Vercel Neon 통합이 주입한 `DATABASE_URL` 을 쓴다 |
| `ANCHOR_APP_PASSWORD` | 0001 마이그레이션이 `anchor_app` 을 만들 때 쓰는 비밀번호 |
| `NEON_AUTH_BASE_URL` | Neon 콘솔 → Auth → Configuration 의 Auth URL. Google 제공자를 켜 둔다 |
| `NEON_AUTH_COOKIE_SECRET` | `openssl rand -base64 32` |
| `NEON_API_KEY` / `NEON_PROJECT_ID` / `NEON_BRANCH_ID` | 배포 전 스냅샷 (프로덕션만) |
| `CRON_SECRET` · `BLOB_READ_WRITE_TOKEN` | 매일 JSON 백업 (`/api/cron/backup` → Vercel Blob). Blob 토큰은 Vercel 이 주입 |

```bash
pnpm typecheck && pnpm lint && pnpm build   # 커밋 전
pnpm db:migrate:status                       # 마이그레이션 상태
pnpm design:tokens                           # design/tokens.json → src/app/tokens.css
pnpm design:check O01 http://localhost:3000/?fixed=1   # 참고 HTML 과 픽셀 비교 (.design-check/)
# 로그인이 필요한 화면을 찍을 땐 서버를 ANCHOR_DESIGN_PREVIEW=1 로 띄운다 (예시 데이터, 로컬 전용)
curl localhost:3000/api/health               # DB 역할·RLS 상태 (rls_all_enabled 가 true, role_bypasses_rls 가 false 여야 한다)
```

### 데이터 접근 규칙

- 사용자 데이터 쿼리는 전부 `withUser(userId, tx => …)` 안에서. 트랜잭션마다 `app.user_id` 를 SET LOCAL 하고 RLS 정책이 그 사용자 행만 허용한다. 자세한 건 [db/README.md](./db/README.md).
- 내보내기 `GET /api/export`, 계정 삭제 `POST /api/account/delete`. 백업·복구 절차는 [docs/BACKUP.md](./docs/BACKUP.md).

## 작업 방식

- 기능 하나 = 화면 하나. `design/screens/`의 해당 HTML을 열어 레이아웃·문구를 그대로 옮긴다. 문구를 임의로 늘리지 않는다.
- 새 화면을 만들면 원칙 0–4와 "하지 않는 것"에 걸리는지 스스로 점검하고, 걸리면 만들지 않는다.
- 세션마다 소유 영역이 다르다. 남의 영역은 고치지 말고 그 세션에 요청한다 ([docs/TEAM.md](./docs/TEAM.md)).

## 토픽

GitHub 저장소 토픽: `vibelog`
