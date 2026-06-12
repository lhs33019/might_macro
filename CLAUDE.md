# CLAUDE.md

> **한 줄 소개**: 미국 PPI(생산자물가지수)를 FRED API로 수집·저장하고, 빠르고 정확하며 영감을 주는 생산자 물가 추이 분석 대시보드를 제공하는 풀스택 웹 프로젝트.

이 문서는 본 프로젝트에서 Claude(및 모든 기여자)가 일관되게 작업하기 위한 단일 기준이다.
새 작업을 시작하기 전에 먼저 읽고, 결정이 바뀌면 이 문서를 갱신한다.

---

## 0. 프로젝트 개요

**핵심 요약**: FRED API로 미국 PPI(PPIFIS·PPIFES 등) 시계열을 수집·Supabase 저장하고, 발표 즉시 MoM·YoY·컨센서스·서프라이즈·기여도·히트맵을 다크 반응형 UI로 제공하는 풀스택 분석 대시보드. Next.js 15 · Vercel · might Macro 디자인 시스템.

> **모든 작업은 [`docs/PRD_v2.0.md`](docs/PRD_v2.0.md)에 정렬되어야 한다.** 기능 추가·변경·삭제 전에 PRD를 먼저 확인하고, PRD와 충돌하면 PRD를 갱신하거나 사용자에게 확인한다.

---

## 1. 프로젝트 목적

매달 발표되는 **미국 PPI 지수**를 FRED API로 수집·DB에 저장하고,
이를 분석해 **빠르고 · 정확하고 · 영감을 주는** 생산자 물가 추이 분석 대시보드를 만든다.

핵심 가치 (모든 의사결정의 기준):

- **빠르고 (Fast)** — 데이터는 미리 DB에 적재해두고, 화면은 사전 계산/캐시된 결과를 빠르게 보여준다. 화면 로드 시점에 FRED를 직접 호출하지 않는다.
- **정확하고 (Accurate)** — FRED 원본을 변형 없이 보존하고, 분석 수치(MoM·YoY·코어 등)는 명시된 공식으로 재현 가능하게 계산한다. 데이터 출처·기준연도·발표일을 화면에 표기한다.
- **영감을 주는 (Inspiring)** — 단순 수치 나열이 아니라 추세·전환점·구성요소 기여를 직관적으로 읽히게 시각화한다.

---

## 2. 현재 단계 (Scope)

| 마일스톤 | 상태 | 내용 |
|----------|------|------|
| M1 | ✅ 완료 | Next.js 15 스캐폴딩, 타입 계약, 폴더 구조 |
| M1.5 | ✅ 완료 | **might Macro 디자인 시스템 구현** — 토큰, 폰트, 컴포넌트, 순수 SVG 차트, 더미 데이터 기반 인터랙티브 대시보드 |
| M2 | ✅ 완료 | Supabase 테이블 생성 + `npm run ingest`로 FRED 실데이터 적재 (8,780+ 시리즈) |
| M3 | ✅ 완료 | `lib/analytics/` 단위 테스트 (MoM·YoY·classifyTrend·Annualized 3M·실질가속도·기여도 — 21개 통과) |
| M4 | ✅ 완료 | `app/api/` Route Handler 실 DB 연결 — 메인 대시보드(`/api/dashboard`)·시리즈 탐색 완료. **컨센서스·서프라이즈, 발표 캘린더(D-day), 부문 기여도 분해** 추가. 더미(`lib/data/dummy.ts`)는 제거됨(잔재 정리 완료) |
| M5 | ⏳ 대기 | Vercel 배포 + 환경변수 설정 (GEMINI_API_KEY 포함) |

**M2 시작 전 필요한 것**: `.env.local`에 FRED_API_KEY, Supabase 3개 키 입력 → README §2 참고.

> **이후 개선 로드맵(투자 아이디어 발견 고도화)**: [`docs/ROADMAP_IDEA_DISCOVERY.md`](docs/ROADMAP_IDEA_DISCOVERY.md) — Phase 1(베이스효과 시뮬레이터·극단값 스크리너·ingest 자동화·P1 잔여 3종) → Phase 2(산업 마진 프록시·상품군 diffusion·유사국면) → Phase 3(조건부). 파이프라인 패스스루 패널은 구현 완료(2026-06).

---

## 3. 기술 스택 (사용 예정 후보)

| 영역 | 선택 | 비고 |
|------|------|------|
| 프레임워크 | **Next.js 15 (App Router)** | 프론트 + 백엔드(Route Handler) 단일 코드베이스 |
| 언어 | **TypeScript** | strict 모드, `any` 금지 (§5 참고) |
| 스타일 | **Tailwind CSS** | 다크 기본, 반응형. 색은 CSS 변수/토큰으로 |
| DB / 백엔드 | **Supabase** | 관리형 PostgreSQL + Auth/SDK. FRED 적재 데이터 저장소 |
| 배포 | **Vercel** | Next.js 호스팅. 환경변수는 Vercel Project Settings에서 관리 |
| 데이터 출처 | **FRED API** | https://fred.stlouisfed.org/docs/api/fred/ |
| 차트 | **순수 SVG** (no chart library) | LineChart·ContributionBars·Heatmap 직접 구현. 라이브러리 의존 없음. |
| 아이콘 | **lucide-react** | 1.75px stroke, 16/18/20px. `currentColor` 상속. |
| 폰트 | **BookkMyungjo** + **Pretendard Variable** | 자체 호스팅 (`public/fonts/`). Bodoni Moda는 Google Fonts fallback. |
| 디자인 시스템 | **might Macro / NEWISE** | `app/globals.css`에 토큰 일괄 정의. Claude Design 핸드오프 번들 적용 완료. |

> Supabase는 관리형 Postgres이므로 별도 로컬 DB 컨테이너는 기본적으로 두지 않는다 (로컬 검증이 필요하면 Supabase CLI 사용).

---

## 4. 폴더 구조 컨벤션

```
PPI_inspire_dashboard/
├─ app/
│  ├─ globals.css      # 디자인 토큰 전체 + 컴포넌트 CSS (.nw-*)
│  ├─ layout.tsx       # 루트 레이아웃 (파비콘, metadata)
│  ├─ page.tsx         # 메인 대시보드 (현재: 더미 데이터 / M4: 실 API)
│  └─ api/             # 내부 Route Handler (DB 조회 전용, FRED 직접 호출 금지)
├─ components/
│  ├─ charts/
│  │  ├─ LineChart.tsx         # 순수 SVG, 호버·터치 크로스헤어, 컨센서스 마커
│  │  ├─ ContributionBars.tsx  # 분기 수평 막대 (품목별 기여도)
│  │  └─ Heatmap.tsx           # 카테고리 × 월 히트맵
│  ├─ Card.tsx          # 카드 쉘 + Legend
│  ├─ KpiCard.tsx       # KPI 카드 + InfoCard + 스켈레톤
│  └─ controls.tsx      # Segmented, Toggle, CheckChip
├─ lib/
│  ├─ config/           # SSoT: headline.ts(헤드라인 8종), weights.ts(부문 기여도 상대중요도)
│  ├─ queries/          # Supabase 조회 조립 (dashboard.ts, series.ts)
│  ├─ insight/          # AI 한줄평 생성 (generate.ts, Gemini — 적재 시점 전용)
│  ├─ supabase/         # 클라이언트(client.ts, server.ts) + DB 타입(types.ts)
│  ├─ fred/             # FRED API 클라이언트 (수집 전용)
│  ├─ analytics/        # MoM·YoY·서프라이즈·Annualized 3M·기여도 순수 함수 + 테스트
│  └─ types.ts          # 프론트↔백 API 계약 (Frozen SSoT)
├─ public/
│  ├─ fonts/            # BookkMyungjo_*.ttf, PretendardVariable.woff2
│  └─ assets/           # ppi-logo.png, ppi-mark.png, mightmacro-*.png
├─ scripts/
│  ├─ ingest.ts         # FRED → Supabase 적재 + 발표일정·AI 한줄평 갱신
│  └─ seed-consensus.ts # data/consensus.seed.json → consensus 테이블 (수동 컨센서스)
├─ data/
│  └─ consensus.seed.json # 시장 컨센서스 수동 입력 시드 (출처 표기 필수)
├─ docs/
│  ├─ PRD_v2.0.md
│  └─ DESIGN_SYSTEM.md  # 디자인 토큰·컴포넌트·규칙 전체 — 디자인 작업 시 필독
└─ CLAUDE.md
```

원칙:
- `app` = 라우팅/페이지/서버 API, `components` = UI, `lib` = 로직, `public` = 정적 파일. 역할을 섞지 않는다.
- 합성 더미(`lib/data/dummy.ts`)는 M4 실 DB 연결 완료 후 제거됨. 모든 화면 값은 Supabase 실데이터에서 온다(없으면 명시적 `null`/`—` 처리).

---

## 5. 코딩 규칙

- **함수형 컴포넌트만 사용.** 클래스 컴포넌트 금지. React 컴포넌트는 함수 + Hooks로 작성한다.
- **`any` 금지.** 불가피하면 `unknown` + 좁히기(narrowing)나 제네릭을 쓴다. TypeScript는 strict 모드.
- **단일 책임 원칙(SRP).** 컴포넌트/함수는 한 가지 일만 한다. 커지면 분리한다. UI와 데이터 로직을 한 컴포넌트에 섞지 않는다.
- props·반환값·API 응답에 **명시적 타입**을 부여한다.
- 분석 로직(`lib/analytics/`)은 **순수 함수**로 작성하고 단위 테스트를 동반한다.
- 색·간격 등 디자인 값은 하드코딩하지 않고 Tailwind 토큰/CSS 변수로 (디자인 교체 대비).

---

## 6. 데이터 모델

PPI 시리즈는 **광범위하게 수집**한다. 임의의 FRED 시리즈를 확장할 수 있게 시리즈 메타와 관측값을 분리한다.

**주요 시리즈** (우선순위 순):

| series_id | 이름 | 기준 | 용도 |
|-----------|------|------|------|
| `PPIFIS` | PPI Final Demand (Headline) | SA, Index 2009-11=100 | KPI 헤드라인, 추이 차트 기본 |
| `PPIFES` | PPI Final Demand ex Food & Energy (Core) | SA, Index 2009-11=100 | KPI 코어, 근원 추이 |
| `PPIDFS` | PPI Final Demand — Food | SA | 식품 기여도 |
| `PPIACO` | PPI All Commodities | NSA, Index 1982=100 | **장기 역사 보강** (2009-11 이전 스플라이스) |

> PPIFIS는 2009-11부터 시작하므로 차트에서 그 이전 구간은 PPIACO로 보강하고 "* 2009.11 이전은 Finished Goods 기준" 주석을 표기한다.

**메인 대시보드 헤드라인 8종** (SSoT: `lib/config/headline.ts`, KPI·부문랭킹·히트맵·AI 한줄평 공통):

| 지표 | series_id | basis | 비고 |
|------|-----------|-------|------|
| Headline PPI | `PPIACO` | NSA | All Commodities |
| Core PPI | `PPIFIS` | SA | Final Demand (진짜 근원 `PPIFES`는 한줄평 비교용) |
| Final Demand Goods | `PPIFDG` | NSA | |
| Final Demand Services | `PPIFDS` | NSA | |
| Energy | `WPSFD4121` | SA | Finished Consumer Energy Goods |
| Food | `WPU01` | NSA | Farm Products |
| Transportation | `PCU484484` | NSA | Truck Transportation |
| Construction | `PCU236400236400` | NSA | New Nonresidential Building Construction |

> NSA 계열의 Annualized 3M은 계절성이 섞이므로 화면에 SA/NSA를 표기하고 NSA에는 계절성 주의 캡션을 단다.

```
series          -- 추적 대상 PPI 시리즈 메타
  series_id     PK  -- FRED series_id (대표: PPIACO / 예: PPIFIS, WPSFD4131 등)
  title             -- 사람이 읽는 이름
  units             -- 단위 (Index 1982=100 등)
  frequency         -- Monthly
  seasonal_adj      -- SA / NSA
  category          -- headline / core / energy / food / service ... (분석 그룹)
  last_updated      -- FRED 기준 마지막 갱신

observation     -- 시리즈별 월간 관측값 (FRED 원본 보존)
  series_id     FK
  date          -- 관측 월 (해당 월 1일로 정규화)
  value         -- 지수값 (NULL 허용: FRED "." 결측 처리)
  (series_id, date) UNIQUE

consensus       -- 시장 컨센서스(예상치) — FRED에 없으므로 수동 입력 (구현 완료)
  series_id     FK
  date          -- 해당 발표월 (관측 월 1일 기준)
  consensus_yoy -- 시장 예상 YoY (%, 수동 입력)
  source            -- 출처 표기 필수 (예: Bloomberg, Reuters) — 화면에 그대로 노출
  note              -- 비고 (선택)
  (series_id, date) UNIQUE

release_schedule -- FRED release 발표 일정 (PPI release_id=46) — 적재 시점 저장, 화면 D-day용
  release_id    PK
  release_name
  next_date     -- 오늘 이후 가장 가까운 예정 발표일
  last_date     -- 오늘 이전 가장 최근 발표일
  fetched_at
```

원칙:
- **FRED 원본은 변형 없이 저장**한다. MoM·YoY 등 파생 지표는 저장하지 않고 조회 시 계산하거나 별도 뷰로 둔다.
- 적재는 **과거 전체 → 현재**까지. `observation_start`를 비워 전체 이력을 받는다.
- 재적재는 **upsert**(있으면 갱신, 없으면 삽입)로 멱등하게.
- `consensus`는 FRED 적재 경로와 완전히 분리된 수동 입력이다. `data/consensus.seed.json` 편집 후 `npm run ingest:consensus`로 upsert한다. 서프라이즈 = 실측 YoY − 컨센서스 YoY이며, **기준월(latestDate)과 컨센서스 date가 일치할 때만** 계산한다. 값이 없으면 `—`로 표기하고, 있을 때는 `source`를 항상 화면에 노출한다(샘플/Demo를 진짜처럼 보이지 않게).
- 부문 기여도는 동일 계열(NSA)인 재화·서비스만 BLS 상대중요도(`lib/config/weights.ts`)로 가중해 분해한다(SA/NSA 혼합 금지).
- **CPI(`CPIAUCSL`·`CPILFESL`, SA) + PCE 반영 PPI 라인**(`lib/config/pce-ppi.ts`) + **파이프라인 단계**(`lib/config/pipeline.ts`: `WPSID62`·`WPSID61`·`PPIFIS`)는 ingest 시드에 포함해 항상 갱신한다. CPI는 PPI 카테고리 트리 밖이라 자동 발견되지 않고, 파이프라인 WPSID*는 트리 안에 있지만 헤드라인 모드(`ingest:update`)가 발견을 생략하므로 시드 명시가 필수다. 마진·PCE·파이프라인·모멘텀 패널은 `series_trend_mv` 대신 **관측값에서 직접 계산**(MV 갱신 실패와 무관). 인플레 폭만 MV 집계(best-effort).

---

## 7. FRED API 연동 규칙

- **키 관리**: `FRED_API_KEY`는 로컬 `.env.local` / 배포는 Vercel 환경변수. 코드·로그·커밋에 절대 노출 금지. `.env*`는 gitignore.
- **호출 위치**: FRED 호출은 **`lib/fred/`와 적재 스크립트에서만** 한다. 페이지·API는 FRED를 직접 호출하지 않고 Supabase(DB)만 읽는다. (속도·정확성·요율 제한 보호)
- **주요 엔드포인트**: `series`(메타), `series/observations`(관측값), `release/dates`(발표일).
- **요율 제한**: 과도한 병렬 호출 금지. 시리즈별 순차/소규모 배치 + 실패 시 재시도.
- **결측 처리**: FRED는 결측값을 `"."`로 반환 → `NULL`로 저장.
- **개정(revision)**: PPI는 발표 후 개정된다. 재적재 시 upsert로 최신값 반영, 마지막 적재 시각 기록.

---

## 8. 분석 지표 (정의 고정)

화면에 쓰는 핵심 지표는 아래 공식으로 통일한다. (`lib/analytics/`에 순수 함수로 구현, 테스트 동반)

- **MoM (전월 대비, %)** = `(value_t / value_{t-1} - 1) * 100`
- **YoY (전년 동월 대비, %)** = `(value_t / value_{t-12} - 1) * 100`
- **Annualized 3M (3M SAAR, %)** = `((value_t / value_{t-3})^4 - 1) * 100` — 최근 3개월 모멘텀의 연율. 시장 중요도 높음. SA 계열에서 의미 명확(NSA는 계절성 주의). 대시보드 KPI 주지표.
- **Annualized N (SAAR, %)** = `((value_t / value_{t-N})^(12/N) - 1) * 100` — 일반화 연율(`calcAnnualized`). 모멘텀 래더의 1M/3M/6M에 사용. 3M은 이 함수의 별칭.
- **실질 가속도 (%p)** = `Annualized 3M − YoY` — 단기 모멘텀이 12개월 추세를 추월(+)/하회(−)하는 폭. 기존 ΔYoY(=yoy−yoy3m)보다 전환점에 선행·민감(검증 완료). 태그는 ΔYoY 유지, UI·한줄평은 실질 가속도 사용.
- **베이스효과 캐리오버 (%)** = `(value_t / value_{t-11} - 1) * 100` — "다음 달 MoM=0이면 다음 YoY". 현재 YoY와의 차이가 롤오프(base) 효과.
- **베이스효과 시나리오 (`projectYoyPath`)** = 캐리오버의 다개월 일반화. `v_{t+k} = v_t × (1+m/100)^k`, YoY 분모는 k≤12이면 실측·k>12이면 프로젝션(k=12부터 `((1+m)^12−1)×100` 수렴). 추세 차트 YoY 모드 전용, 클라이언트 계산. **가정 기반 시뮬레이션이며 예측 아님** — 캡션 의무.
- **PPI−CPI 마진 갭 (%p)** = `PPI YoY − CPI YoY` — 투입가 vs 산출가. 양수=마진 압박. **양쪽 SA 계열로만 비교**(헤드라인 CPIAUCSL/PPIFIS, 코어 CPILFESL/PPIFES).
- **인플레이션 폭(diffusion, %)** = 전체 시리즈 중 (MoM 또는 YoY) 상승 비중. `series_trend_mv` 집계.
- **10년 백분위 (극단값 스크리너)** = 최신 YoY/MoM의 최근 10년 월별 분포 내 `percent_rank()×100` — `series_trend_mv`에 사전계산(`yoy_pctile_10y`·`mom_pctile_10y`). 표본 24개월 미만이면 NULL(미표시). `역사적극단` 태그 = P95↑ 또는 P5↓(`isHistoricalExtreme`). **z-score(`yoy_z10y`)는 두꺼운 꼬리 때문에 단독 노출 금지 — 백분위 병기 전용.**
- **PPI→PCE 파이프라인**: 코어 PCE에 PPI가 소스로 반영되는 라인(의료·금융·항공, `lib/config/pce-ppi.ts`)의 방향 종합. **가중치 미공개 → 방향 신호만**(정밀 PCE 수치 미산출).
- **파이프라인 패스스루**: 미가공(`WPSID62`)→가공(`WPSID61`)→최종수요(`PPIFIS`) 단계별 3M 연율 비교(전 단계 SA, `lib/config/pipeline.ts`). 종합 판정 = 상류(1·2단계) 평균 3M 연율 − 하류 3M 연율 갭, **±0.5%p** 임계로 압력 누적/완화/혼조. 구체계 `PPIITM`·`PPICRM`은 2015-12 단종 — **사용 금지**.
- **Headline**: `PPIACO` (전체 PPI 지수, 기준 대표값) / **Core**: 식품·에너지 제외 지수
- 기준연도·SA/NSA를 혼동하지 않는다. 같은 차트 안에서는 동일 계열(SA 또는 NSA)만 비교한다.
- 수치 옆에는 항상 **기준(시리즈명·단위·기준연도·발표월)** 을 표기해 정확성을 드러낸다.

---

## 9. 개발 명령어

```bash
# 앱 개발
npm run dev        # 개발 서버 (http://localhost:3000)
npm run build      # 프로덕션 빌드
npm run lint       # ESLint 검사

# 데이터 적재 (FRED → Supabase)
# .env.local에 FRED_API_KEY, SUPABASE_* 입력 후 실행
npm run ingest             # 전체 발견 → 적재 (과거 전체 → 현재)
npm run ingest:update      # 헤드라인 9종 증분 + 발표일정 + AI 한줄평 (최속 갱신)
npm run ingest:headline    # 헤드라인 9종만 (AI 한줄평 재생성)
npm run ingest:incremental # 전체 발견 + 증분 수집
npm run ingest:retry       # 직전 실패분만 재시도 (failed-series.json)
npm run ingest:consensus   # data/consensus.seed.json → consensus 테이블 (수동 컨센서스)

# 테스트
npm test           # lib/analytics 순수 함수 단위 테스트 (node:test)

# 환경변수 설정
# .env.local.example 을 복사해 .env.local 만들고 키 입력
# cp .env.local.example .env.local
```

> 스크립트가 추가되면 이 섹션을 갱신한다.

---

## 10. 디자인 사용 규칙

> **디자인 작업 전 [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)를 먼저 읽는다.**  
> 색상·폰트·컴포넌트·차트·콘텐츠 규칙 전체가 그곳에 있다.  
> CLAUDE.md §10은 5줄 핵심 요약만 유지한다.

### 디자인 일관성 5줄 원칙

1. **색상은 CSS 변수만.** `#hex` 하드코딩 금지 — `--up`, `--down`, `--accent`, `--surface-*` 등 `app/globals.css`의 `--*` 변수를 그대로 사용한다.
2. **방향은 색+글리프 이중 표현.** 상승/하락을 색상만으로 표현하지 않는다 — 반드시 `▲/▼/—` 글리프를 함께 쓴다 (색맹 접근성).
3. **숫자는 tabular figures 필수.** 모든 숫자 요소에 `font-family: var(--num)`과 `font-feature-settings: "tnum" 1`을 적용해 열 정렬을 보장한다.
4. **새 컴포넌트는 globals.css 먼저.** `.nw-` prefix CSS 클래스를 `app/globals.css`에 정의한 뒤 TSX에서 참조한다. 인라인 스타일은 레이아웃 조정용으로만 제한 사용.
5. **차트는 순수 SVG, 외부 라이브러리 금지.** `LineChart/ContributionBars/Heatmap` 패턴을 유지하고, 방향색(`--up-line`/`--down-line`)을 면적 그라데이션에 반영한다.

### 빠른 참조

| 필요한 것 | 참조 위치 |
|-----------|-----------|
| 색상 토큰 전체 | [DESIGN_SYSTEM.md §2](docs/DESIGN_SYSTEM.md#2-색상-토큰) |
| 타이포그래피 클래스 | [DESIGN_SYSTEM.md §3](docs/DESIGN_SYSTEM.md#3-타이포그래피) |
| 컴포넌트 스펙 | [DESIGN_SYSTEM.md §5](docs/DESIGN_SYSTEM.md#5-컴포넌트-인벤토리) |
| 차트 구현 패턴 | [DESIGN_SYSTEM.md §6](docs/DESIGN_SYSTEM.md#6-차트-컴포넌트) |
| 콘텐츠·카피 규칙 | [DESIGN_SYSTEM.md §8](docs/DESIGN_SYSTEM.md#8-콘텐츠--카피-규칙) |
| 새 컴포넌트 체크리스트 | [DESIGN_SYSTEM.md §12](docs/DESIGN_SYSTEM.md#12-새-컴포넌트-추가-체크리스트) |

---

## 11. 협업 규칙 (Claude에게 부탁하는 작업 방식)

- **한 번에 하나씩.** 여러 변경을 한꺼번에 몰아서 하지 말고, 한 작업을 끝내고 다음으로 넘어간다.
- **변경 후 diff 요약.** 무엇을·왜 바꿨는지 간결히 요약해 보고한다.
- **추측 금지, 모르면 질문.** 불확실하면 진행하지 말고 먼저 물어본다. 임의 가정으로 코드를 만들지 않는다.
- 이 문서의 결정과 충돌하는 작업 전에는 **먼저 이 문서를 갱신**하거나 사용자에게 확인한다.
- 정확성 관련 변경(분석 공식·DB 스키마·FRED 매핑)은 **테스트/검증**을 동반한다.
- 디자인 작업 전에는 반드시 [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)를 참조한다. 거기에 없는 패턴을 임의 추가하지 않는다.
- 비밀값(API 키, DB 키)은 환경변수로만. 커밋 금지. 커밋/푸시는 사용자가 요청할 때만.

---

## 12. 환경변수

로컬은 `.env.local`, 배포는 Vercel Project Settings.

```
FRED_API_KEY=                   # FRED API 키 (https://fred.stlouisfed.org/docs/api/api_key.html)
NEXT_PUBLIC_SUPABASE_URL=       # Supabase 프로젝트 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon 키 (클라이언트용)
SUPABASE_SERVICE_ROLE_KEY=      # 서버/적재 전용 (절대 클라이언트 노출 금지)
GEMINI_API_KEY=                 # AI 한줄평 생성 — Google AI Studio. 적재 시점만 사용, 서버/적재 전용, 절대 클라이언트 노출 금지
```

---

## 13. 모델 스위칭 가이드

이 프로젝트에서 작업 성격에 따라 사용할 Claude 모델을 아래 기준으로 고른다.

| 작업 성격 | 권장 모델 | 예시 |
|-----------|-----------|------|
| 단순 수정 / 오타 / 문서 정리 | **Haiku** | 오타 수정, 주석·문서 다듬기, 사소한 텍스트 변경 |
| 일반 코딩 / UI 제작 **(기본값)** | **Sonnet** | 컴포넌트 작성, 화면 구현, 일반 기능 개발 |
| PRD 작성 / 복잡 디버깅 / 아키텍처 결정 | **Opus** | 요구사항 설계, 까다로운 버그 추적, 구조·기술 의사결정 |

규칙:
- 기본값은 **Sonnet**. 특별한 사유가 없으면 Sonnet으로 진행한다.
- 사용자가 **"지금 작업은 어떤 모델이 좋아?"** 라고 물으면, 위 기준에 따라 **매번 작업에 맞는 모델을 추천**한다. (이유 한 줄 포함)
- Claude는 스스로 모델을 바꿀 수 없으므로, 추천만 하고 실제 전환(`/model`)은 사용자가 한다.
