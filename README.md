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

### 발견 루프 (모든 카드의 공통 5장면)

```
후킹 질문 → 부품 분해 → 내가 먼저 추측 → 정답 도출 → 아는 단어로 착지 (+ 다른 언어 브릿지)
```

추측 단계가 핵심이다. 추측 입력은 **항상** 정답보다 먼저 나오고, 한 장면은 한 화면을 넘지 않는다.

### 앵커 3종

| 앵커 | 예 |
| --- | --- |
| 한국어 한자어의 소리 → 한자 → 일본어 음독 | 협(ㅂ) → 協 → きょう, 학(ㄱ) → 学 → がく |
| 영어 라틴 어근 → 스페인어 | -tion → -ción, -ty → -dad, -ly → -mente |
| 업무 도메인 어휘 → 세 언어 | 지능 → 知能 ちのう / intelligence / inteligencia |

## 하지 않는 것

- 레벨 테스트, "초급/중급/고급" 질문, 자기 보고식 수준 입력 (온보딩은 행동으로만)
- 스트리크·포인트·리더보드·공개 프로필·친구 기능
- 텍스트 채팅형 회화, 문법 교정
- 플래시카드 반복(SRS)
- 한자 쓰기·필순

Jessi에게 "초급/중급/고급"을 묻는 UI가 생기면 버그다.

## 데이터 원칙 (협상 불가)

- Google 로그인(Neon Auth). 모든 테이블에 `user_id`, Postgres RLS로 계정 간 분리. 사용자 1명이어도 동일.
- 기본 비공개. 공개는 항목 단위로 사용자가 명시적으로 켤 때만.
- 데이터 유실 = 즉시 이탈. Neon PITR(7일+) + 매일 스냅샷을 별도 스토리지에. 배포 전 자동 백업. 분기마다 복구 리허설.
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

## 저장소 구조

```
.
├── CLAUDE.md            코딩 시 항상 지켜야 하는 지침 (원칙·금지·디자인·MVP 순서)
├── docs/
│   ├── SPEC.md          전체 기획안 (문제 정의 → 원칙 → 모듈 → 언어별 적용 → 로드맵)
│   └── SITEMAP.md       라우트 구조와 API 경계
├── design/
│   ├── tokens.json      디자인 토큰 (색·폰트·반경·간격·곡선·그래프 색)
│   ├── SCREENS.md       화면 목록과 순서
│   ├── screens/*.html   390×844 정적 화면 참고 (문구·위계·버튼 개수를 그대로 옮긴다)
│   ├── screenshots/     위 화면의 PNG
│   └── logo/            확정 로고 A안 (alternatives/는 탈락안, 제품에 쓰지 않음)
├── prompts/kickoff.md   구현 시작 프롬프트 (단계별 진행 순서)
├── src/
│   ├── app/             Next.js App Router (페이지, /api/*, tokens.css, onboarding/)
│   ├── components/ui/   공통 뼈대: Screen·Card·Label·Row·Pill·Button·Ghost
│   ├── lib/auth/        Neon Auth 서버·클라이언트 인스턴스
│   ├── lib/db/          withUser() 트랜잭션 헬퍼 (RLS 컨텍스트)
│   └── proxy.ts         라우트 보호 미들웨어
├── db/
│   ├── migrations/      SQL 마이그레이션 (0001 스키마·역할, 0002 RLS)
│   ├── seed/            공용 참조 노드 (en-seed.json: 영어 씨앗 40장)
│   └── recovery/        복구 시 역할·RLS 재적용
├── scripts/             migrate.ts, backup/neon-snapshot.ts, design/tokens-to-css.ts·check-screen.ts
└── .github/workflows/   backup.yml (매일 pg_dump → 외부 S3)
```

## 화면 흐름

언어는 라우트가 아니라 데이터 속성이다. 세 언어가 같은 화면을 재사용하고, 하단 탭바는 없다.

| 라우트 | 화면 | 하는 일 |
| --- | --- | --- |
| `/` | O01 | Google 로그인 + 데이터 원칙 2줄 |
| `/onboarding/purpose` · `/kana` · `/seed` | O02–O04 | 상황 고르기 → 가나 6개 실제 읽기(마이크) → 영어 뜻 떠올리기 3분 |
| `/today` | F01 | 오늘 만난 것 큐 |
| `/inputs/new` · `/inputs/[id]` · `/inputs/[id]/read` | F02 · F03 · F12 | 자료 넣기 → 모르는 것 추출 → 재만남 읽기 |
| `/cards/[id]` · `/cards/[id]/1..5` · `/cards/[id]/speak` | F04 · Scene1–5 · F10 | 카드 출처 → 발견 5장면 → 듣기·말하기·곡선 비교 |
| `/graph` | F11 | 앵커 그래프, 다음 카드 이유 |
| `/talk` · `/talk/[id]` | F13 · F14 | 못 한 말 한 줄 → 덩어리 + 음성 루프 |
| `/settings` | — | 내보내기(JSON), 계정 삭제, 음성 보관 기간, 항목별 공개, 목소리 선택 |

### 디자인 시스템 요약

- 텍스트 세기 3단계로만 위계: `#2A2D33` / `#6B7078` / `#9AA0A8`. 순수 검정 금지.
- 강조는 글자색이 아니라 배경 틴트 `#E9EEF6`. 채도 높은 색, 그린·앰버 계열 금지.
- 배경 `#F6F6F7`, 카드 흰색 + 1px `#E6E7EA`, 반경 18px. 검은 주 버튼 1개(56px)만.
- 폰트는 Noto Sans KR / Noto Sans JP만. 세리프·모노스페이스 금지.
- 일본어 텍스트에는 항상 よみがな(ruby). 그래프·곡선에는 항상 범례.

## 로드맵 (각 단계는 가설 하나만 검증)

| 단계 | 만드는 것 | 통과 기준 |
| --- | --- | --- |
| MVP (3주) | 영어 대화 루프 초기판 + 일본어 한자 발견 카드 + 앵커 그래프 | 재만남 인식률 70%, 같은 덩어리 5회차 곡선 일치도 상승 |
| v0.5 (2주) | 인풋 레이어(브라우저 확장, 못 한 말 메모) + 재만남 하이라이트 | 인풋 유입 주 4일 이상, 4주 연속 |
| v1 (4주) | 대화 루프 완성 (영·일·서 음성) | 막혔던 덩어리의 재사용률 |
| v1.5 (4주) | 영어 어근 + 스페인어 브릿지, 문법 블록 | 영어 카드 추측 정답률이 일본어와 비슷한 추이 |
| v2 | 이미지 연상, PDF·영상 인풋, 다수 사용자 | — |

### MVP 구현 순서

1. 인증 + 데이터 원칙(RLS, 백업, 내보내기, 계정 삭제). **화면보다 먼저.**
2. 디자인 토큰 → CSS 변수, 공통 레이아웃. O01을 픽셀 수준으로 재현해 토큰 검증.
3. 온보딩 4장 (O01–O04).
4. 일본어 한자 발견 카드 (F04 + Scene1–5) + 앵커 그래프 (F11).
5. 영어 대화 루프 (F13–F14): 못 한 말 → 덩어리 → 듣기/말하기/곡선.
6. 인풋 레이어 (F02–F03) + 재만남 (F12).

## 개발

```bash
pnpm install
cp .env.example .env.local        # 값 채우기 (아래 표)
pnpm db:migrate                    # DATABASE_URL_ADMIN(또는 DATABASE_URL) 로 스키마 + RLS 적용
pnpm db:seed                       # 공용 참조 노드 적재 (지금은 O04 영어 씨앗 40장)
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
| `BACKUP_S3_*` | 매일 pg_dump 를 올릴 Neon 밖 스토리지 (GitHub Secrets) |

```bash
pnpm typecheck && pnpm lint && pnpm build   # 커밋 전
pnpm db:migrate:status                       # 마이그레이션 상태
pnpm design:tokens                           # design/tokens.json → src/app/tokens.css
pnpm design:check O01 http://localhost:3000/?fixed=1   # 참고 HTML 과 픽셀 비교 (.design-check/)
# 로그인이 필요한 화면을 찍을 땐 서버를 ANCHOR_DESIGN_PREVIEW=1 로 띄운다 (예시 데이터, 로컬 전용)
curl localhost:3000/api/health               # DB 역할·RLS 상태 (rls_all_forced 가 true 여야 한다)
```

### 데이터 접근 규칙

- 사용자 데이터 쿼리는 전부 `withUser(userId, tx => …)` 안에서. 트랜잭션마다 `app.user_id` 를 SET LOCAL 하고 RLS 정책이 그 사용자 행만 허용한다. 자세한 건 [db/README.md](./db/README.md).
- 내보내기 `GET /api/export`, 계정 삭제 `POST /api/account/delete`. 백업·복구 절차는 [docs/BACKUP.md](./docs/BACKUP.md).

### 구현 상태

| 단계 | 상태 |
| --- | --- |
| 1. 골격: Next.js + Neon Auth(Google) + 스키마·RLS 마이그레이션 + 내보내기·삭제 엔드포인트 + 백업(스냅샷·pg_dump) | 완료 (Neon 프로젝트 연결 전) |
| 2. 디자인 토큰 → CSS 변수(`pnpm design:tokens`), 공통 레이아웃 컴포넌트, O01 픽셀 재현(`pnpm design:check`) | 완료 |
| 3. 온보딩 O02–O04: 상황 고르기, 가나 6개 마이크 인식(Web Speech API), 영어 씨앗 40장 → `user_node_state` | 완료 |
| 4. 일본어 발견 카드 F04 → Scene1–5 → F11 | 다음 |
| 5. 영어 대화 루프 F13–F14 | |

## 작업 방식

- 기능 하나 = 화면 하나. `design/screens/`의 해당 HTML을 열어 레이아웃·문구를 그대로 옮긴다. 문구를 임의로 늘리지 않는다.
- 새 화면을 만들면 원칙 0–4와 "하지 않는 것"에 걸리는지 스스로 점검하고, 걸리면 만들지 않는다.
- 자세한 지침은 [CLAUDE.md](./CLAUDE.md), 전체 기획은 [docs/SPEC.md](./docs/SPEC.md).

## 토픽

GitHub 저장소 토픽: `vibelog`
