# PRD — 미국 PPI 추이 분석 대시보드

| 항목 | 내용 |
|---|---|
| 문서 버전 | **v2.0 (최종본)** |
| 작성일 | 2026-06-04 |
| 상태 | **Approved — 모든 작업은 이 문서에 정렬** |
| 관련 문서 | [CLAUDE.md](../CLAUDE.md) · [lib/types.ts](../lib/types.ts) |

> **한 줄 소개**: FRED API로 미국 PPI(PPIACO) 전체 시리즈를 수집·Supabase 저장하고, 발표 즉시 YoY·컨센서스·서프라이즈·추이 차트를 다크 반응형 UI로 제공하는 풀스택 분석 대시보드. Next.js 15 · Vercel.

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|---|---|---|
| **v1.0** | 2026-06-04 | 초안 작성. 배경·페르소나·P0/P1 기능·데이터모델·마일스톤·프론트/백 역할분리 등 13개 섹션 확립 |
| **v1.1** | 2026-06-04 | 빨간펜 리뷰 반영. ① P0-1 재정의(YoY+컨센서스+서프라이즈) ② P0-3 단일선택·기본값 headline 확정 ③ §6.3 인사이트 규칙 R1~R5 추가 ④ consensus 테이블(수동 입력) 추가 ⑤ 오픈질문 Q1(PPIACO) · Q2(FRED 카테고리) · Q3(localStorage) 전부 확정 ⑥ 결측 처리 "선 끊기, 0 대체 금지" 명확화 |
| **v2.0** | 2026-06-04 | **최종본**. ① §14 부록 A: 프론트↔백 API 계약 타입(Frozen) 추가 ② M1 스캐폴딩 완료 표시 ③ 전체 오픈질문 0건 확인 ④ 기준 문서로 확정 |
| **v2.1** | 2026-06-05 | **구현 정렬**. M3·M4 구현 과정 결정 반영: ① **주지표를 Annualized 3M(+실질가속도)로 격상**(P0-1의 YoY·컨센서스·서프라이즈는 보조로 병기) ② **P1-4 인사이트를 규칙기반→Gemini LLM 한줄평으로 전환**(§6.3 규칙세트·`calcInsight`는 폐기, 적재 시점 1회 생성→`dashboard_insight` 저장) ③ KPI 응답 타입 `KpiItem`→**`HeadlineKpi`**로 대체(부록 A) ④ 신규: 발표 캘린더 D-day(`release_schedule`)·부문 기여도 분해(재화·서비스, BLS 상대중요도) ⑤ 컨센서스 입력 경로 `data/consensus.seed.json` + `npm run ingest:consensus` |
| **v2.2** | 2026-06-07 | **매크로 투자자 고도화**. 실무 PPI 활용법을 기능화: ① **PPI→PCE 파이프라인**(코어 PCE 반영 PPI 라인 방향 종합, `lib/config/pce-ppi.ts`) ② **모멘텀 래더**(1M/3M/6M 연율 + YoY + 베이스효과 캐리오버) ③ **인플레이션 폭**(diffusion, 전체 시리즈 상승 비중) ④ **PPI−CPI 마진 스프레드**(CPI `CPIAUCSL`·`CPILFESL` 신규 적재, 양쪽 SA) ⑤ **발표일 브리핑** 캡스톤 + AI 한줄평을 신규 지표로 강화. 포커스 패널은 MV 비의존(관측값 직접 계산). 신규 순수함수 `calcAnnualized`·`calcCarryover`·`calcMarginGap`·`calcBreadth`(테스트 동반, 총 27개). |
| **v2.3** | 2026-06-11 | **파이프라인 패스스루 패널 + 아이디어 발견 로드맵**. ① 미가공(`WPSID62`)→가공(`WPSID61`)→최종수요(`PPIFIS`) 물가 전이 패널(전 단계 SA, 3M 연율, 상류−하류 갭 ±0.5%p로 압력 누적/완화/혼조 판정, SSoT `lib/config/pipeline.ts`). 구체계 `PPIITM`·`PPICRM`은 2015-12 단종으로 사용 금지. ② 투자 아이디어 발견 고도화 로드맵 수립 — [`docs/ROADMAP_IDEA_DISCOVERY.md`](ROADMAP_IDEA_DISCOVERY.md) (베이스효과 시뮬레이터·극단값 스크리너·산업 마진 프록시·ingest 자동화 등 Phase 1~3). |

---

## 1. 배경 & 문제 정의

매달 발표되는 미국 PPI는 인플레이션·금리 전망의 핵심 선행지표지만, 실무자는 FRED/BLS에 흩어진
시리즈를 직접 받아 엑셀로 MoM/YoY를 재계산한다. 발표일마다 반복되는 이 과정은 **느리고 오류가 잦으며**,
숫자만으로는 "지금 시장이 어떤 상황인지" 해석이 어렵다.

> **문제 한 줄 정의**: 흩어진 미국 PPI 데이터를 매달 수작업으로 모아 재계산하느라 느리고 오류가 잦은 과정을,
> 발표 즉시 정확한 추이와 해석을 한 화면에서 보여주는 대시보드로 대체한다.

---

## 2. 목표 & 비목표

### 2.1 목표 (이번 단계)
- 미국 PPI 시리즈를 과거~현재까지 DB에 적재하고, 화면에서 빠르게 조회.
- 핵심 지표(헤드라인·코어)와 추이 차트를 한 화면에서 확인.
- 다크톤 + 반응형으로 모바일/데스크탑 모두 동작하는 **최소 목업** 완성.

### 2.2 비목표 (이번 단계에서 하지 않음)
- 정교한 비주얼 디자인 — **추후 Claude Design 단계**에서 적용.
- 로그인/계정/권한, 결제, 실시간 알림.
- AI 기반 자연어 해석(P1 인사이트는 규칙 기반부터).
- PPI 외 타 지표(CPI 등) 확장.

---

## 3. 핵심 가치 (성공 기준의 축)

- **빠르고 (Fast)**: 화면 로드 시 FRED 직접 호출 금지, DB의 사전 적재 데이터만 조회. *(p95 응답시간 등 정량 목표: 추후 구체화)*
- **정확하고 (Accurate)**: FRED 원본 무변형 보존, 파생 지표는 명시 공식으로 계산, 출처·기준연도·발표월 표기.
- **영감을 주는 (Inspiring)**: 추세·전환점을 직관적으로 시각화, 인사이트 한 줄 평(P1) 제공.

---

## 4. 사용자 페르소나

| 페르소나 | 역할 | 페인포인트 | 사용 시나리오 |
|---|---|---|---|
| **시장 분석가 (Sell-side)** | 증권사 리서치/데스크 애널리스트 | 발표일마다 FRED를 뒤져 엑셀 재계산. 회의 직전 시간 압박·휴먼 에러 | 발표 직후 데스크 회의에서 헤드라인·코어 추이를 띄워 시장 상황을 즉석 브리핑 |
| **거시 리서처 / 이코노미스트** | 운용사·연구소 리서처 | 구성요소 기여도·장기 추세를 봐야 하나 시리즈가 흩어져 비교가 번거로움 | 인플레이션 리포트 작성 시 하위 카테고리를 한 화면에서 비교, 전환점 식별·캡처 |
| **개인 투자자 / 학습자** | 매크로 관심 개인·학생 | 용어(SA/NSA·기준연도)가 어렵고 숫자 해석이 안 됨 | 모바일로 발표 뉴스 접한 뒤 추이 차트 + 한 줄 해석으로 분위기 파악 |

---

## 5. 사용자 스토리 (대표)

- 분석가로서, 발표 직후 **헤드라인 PPI의 YoY·컨센서스·서프라이즈**를 한눈에 보고 싶다 → 회의에서 바로 말할 수 있게.
- 리서처로서, **특정 PPI 시리즈를 골라 과거 전체 추이 차트**를 보고 전환점을 찾고 싶다.
- 누구든, **FRED 카테고리로 지표를 필터링**해 관심 영역만 빠르게 보고 싶다.
- 모바일 사용자로서, **작은 화면에서도 깨지지 않는 다크 UI**로 확인하고 싶다.

---

## 6. 기능 요구사항

### 6.1 P0 — MVP 필수 (4개)

| ID | 기능 | 설명 | 수용 기준 (Acceptance Criteria) |
|---|---|---|---|
| **P0-1** | 핵심 지표 한눈에 보기 | 대표 지표(헤드라인·코어)의 **전년비(YoY) + 시장 컨센서스 + 차이(서프라이즈)**를 KPI 카드로 상단 노출 | 카드에 시리즈명·발표월·실측 YoY(%)·컨센서스 YoY(%)·차이(실측−컨센, %p) 표기 / 값은 DB 기준 / 상방·하방을 색+부호로 구분 / 컨센서스 없으면 해당 칸 `—` 처리 |

> **구현 반영(v2.1)**: 카드의 **주값은 Annualized 3M(%)**, 델타는 **실질 가속도(%p)**로 격상했고, YoY·컨센서스·서프라이즈는 보조로 병기한다(서프라이즈 배지 + `vs 컨센 X% · 출처`). 헤드라인은 8종(`lib/config/headline.ts`).
| **P0-2** | 시리즈 선택 → 추이 차트 | 지표 선택 시 과거 전체~현재 시계열을 라인 차트로 표시 | 선택 즉시 차트 갱신 / x축 시간·y축 지수 / 결측(NULL)은 **선을 끊고 점 미표시(0 대체 금지)** / 출처·단위·기준연도 표기 |
| **P0-3** | 카테고리 필터 | **FRED 카테고리 체계** 기준으로 지표 목록 필터 | **단일 선택(라디오), 기본값 `headline`** / 카테고리 목록은 DB FRED 분류값에서 동적 로드 |
| **P0-4** | 반응형 다크 UI | 모바일/데스크탑 모두 동작하는 다크톤 반응형 레이아웃 | 모바일(≤640px)·데스크탑 레이아웃 깨짐 없음 / 색은 CSS 변수 토큰화 / 차트가 컨테이너 폭에 반응 |

### 6.2 P1 — 있으면 좋은 기능 (5개)

| ID | 기능 | 설명 | 비고 |
|---|---|---|---|
| **P1-1** | 파생 분석 컬럼 확장 | 3·6개월 연율(annualized), 전고점 대비, 변동성(최근 12개월 MoM 표준편차) 등 | 조회 시 계산, DB 저장 X |
| **P1-2** | 즐겨찾는 지표 | 시리즈 핀/즐겨찾기, 첫 화면 우선 노출 | **localStorage, 로그인 불필요, 최대 5개** |
| **P1-3** | 요약 패널 | 선택 기간 최고/최저·추세 방향·최근 6개월 변화 자동 요약 | `lib/analytics` 순수 함수 |
| **P1-4** | 인사이트 한 줄 평 | ~~규칙 기반 자동 해석 (§6.3)~~ → **Gemini LLM 한줄평으로 구현(v2.1)** | 적재 시점 1회 생성→`dashboard_insight` 저장, 화면은 읽기 전용 |
| **P1-5** | 지표 간 비교/오버레이 | 2개+ 시리즈를 한 차트에 겹쳐 비교 | 동일 SA/NSA 계열 가드 필수 |

### 6.3 인사이트 규칙 세트 (P1-4) — ⚠️ 폐기(v2.1), 역사적 기록

> **v2.1에서 폐기됨**: 아래 규칙기반 `calcInsight`는 구현되지 않고 제거됐다. 한줄평은
> **Gemini LLM**(`lib/insight/generate.ts`)이 적재 시점에 8종 헤드라인+코어 지표를 받아 1건 생성하고
> `dashboard_insight`에 저장하며, 화면은 그 저장값만 읽는다(빠름 원칙). 아래 표는 초기 설계 기록으로만 남긴다.

`lib/analytics` 순수 함수로 계산. **한 지표당 우선순위가 가장 높은 규칙 1개**만 뱃지로 노출.
임계값: 서프라이즈 **±0.2%p** · 모멘텀 **3개월 연속** · 레벨 **12개월 윈도우**.

| 우선순위 | 규칙 | 조건 | 출력 문구 |
|---|---|---|---|
| 1 | **R1 서프라이즈** *(컨센서스 있을 때만)* | 실측 YoY − 컨센서스 ≥ +0.2%p | "예상 상회 (상방 서프라이즈)" |
| | | \|실측 YoY − 컨센서스\| < 0.2%p | "예상 부합" |
| | | 실측 YoY − 컨센서스 ≤ −0.2%p | "예상 하회 (하방 서프라이즈)" |
| 2 | **R2 모멘텀** | MoM 3개월 연속 상승 | "가속 지속" |
| | | MoM 3개월 연속 하락 | "둔화 지속" |
| 3 | **R3 방향전환** | 이번 YoY > 전월 YoY | "전년비 재가속" |
| | | 이번 YoY < 전월 YoY | "전년비 둔화" |
| 4 | **R4 레벨** | YoY가 최근 12개월 내 최고 | "12개월 내 최고" |
| | | YoY가 최근 12개월 내 최저 | "12개월 내 최저" |
| 5 | **R5 헤드라인 vs 코어** | 헤드라인 YoY 하락 & 코어 YoY 상승 | "근원 물가 압력 잔존" |

---

## 7. 데이터 & 분석 정의

### 7.1 데이터 모델

| 테이블 | 용도 | 적재 방식 |
|---|---|---|
| `series` | PPI 시리즈 메타(series_id PK, title, units, frequency, seasonal_adj, category, last_updated) | FRED API → 적재 스크립트, upsert |
| `observation` | 월간 관측값(series_id FK, date, value \| NULL, UNIQUE(series_id,date)) | FRED API → 적재 스크립트, upsert |
| `consensus` | 시장 예상치(series_id FK, date, consensus_yoy, source, note, UNIQUE(series_id,date)) | **수동 입력** (FRED에 없음) |

- **대표(헤드라인) 지수**: `PPIACO` (Producer Price Index by Commodity: All Commodities)
- **카테고리 분류**: FRED 카테고리 체계 그대로 — `series.category`에 저장
- FRED 원본 무변형 보존. 결측 `"."`→`NULL`. 재적재는 upsert(멱등).
- ⚠️ 컨센서스 없으면 서프라이즈 칸은 `—` 표기.

### 7.2 분석 지표 공식 (고정)

- **MoM(%)** = `(value_t / value_{t-1} - 1) × 100`
- **YoY(%)** = `(value_t / value_{t-12} - 1) × 100`
- **서프라이즈(%p)** = `실측 YoY − 컨센서스 YoY`
- 파생 지표는 DB에 저장하지 않고 `lib/analytics` 순수 함수로 조회 시 계산.
- 같은 차트 안에서는 동일 계열(SA 또는 NSA)만 비교.

---

## 8. UX / 화면 구성 (목업)

```
┌─────────────────────────────────────────────────────┐
│  PPI Dashboard                          [다크 헤더]  │
├─────────────────────────────────────────────────────┤
│  KPI 카드  │  KPI 카드  │  KPI 카드      ← P0-1     │
│  PPIACO    │  Core PPI  │  Service PPI              │
│  YoY / 컨센서스 / 서프라이즈                         │
├──────────┬──────────────────────────────────────────┤
│ 카테고리  │                                          │
│ ○headline │   추이 라인 차트 (선택 시리즈)            │
│ ○core     │   x: 시간  y: 지수                       │
│ ○energy   │   결측 = 선 끊기                   P0-2  │
│ ○food     │                                          │
│ ○service  │   [출처: FRED · 단위 · 기준연도]          │
│  P0-3     │                                          │
└──────────┴──────────────────────────────────────────┘
모바일: 세로 스택 / 데스크탑: 사이드 필터 + 메인 2열  P0-4
```

> 비주얼 완성도는 비목표. 레이아웃·데이터 흐름 동작 우선.

---

## 9. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 15 (App Router) | 프론트 + Route Handler 단일 코드베이스 |
| 언어 | TypeScript strict | `any` 금지 |
| 스타일 | Tailwind CSS v4 | 다크 기본, CSS 변수 토큰화 |
| DB / 백엔드 | Supabase (관리형 PostgreSQL) | FRED 적재 데이터 저장소 |
| 배포 | Vercel | 환경변수는 Vercel Project Settings |
| 데이터 수집 | FRED API | `lib/fred/` + `scripts/ingest.ts` 전용 |
| 차트 | Recharts (보조 후보) | 다크테마 커스텀 용이, 확정 시 CLAUDE.md 갱신 |

---

## 10. 성공 지표

| 지표 | 기준 | 측정 방법 |
|---|---|---|
| 정확성 | MoM/YoY가 FRED 원본 재계산값과 일치 (허용오차 \|diff\| < 0.01%p) | `lib/analytics` 단위 테스트 통과 |
| 속도 | 초기 로드 시 FRED 직접 호출 0회 | Network 탭 확인 |
| 반응성 | 레이아웃 깨짐 0건 | 360/768/1280px 3개 브레이크포인트 스냅샷 *(검증 절차 추후 구체화)* |
| 완결성 | P0 4개 기능 end-to-end 동작 (수집→DB→화면) | 수동 체크리스트 |

---

## 11. 마일스톤

| 단계 | 내용 | 산출물 | 상태 |
|---|---|---|---|
| **M1** | 프로젝트 스캐폴딩 | Next.js 15 + Tailwind + Supabase 연결, 폴더 구조, API 계약 타입 | ✅ **완료** |
| **M2** | FRED 수집 파이프라인 | `lib/fred` 클라이언트 + `scripts/ingest.ts`, series/observation DB 적재 | 진행 예정 |
| **M3** | 분석 함수 + 테스트 | `lib/analytics` MoM·YoY·인사이트 순수 함수 + 단위 테스트 | 진행 예정 |
| **M4** | P0 목업 UI | KPI 카드·추이 차트·카테고리 필터·반응형 다크 레이아웃 | 진행 예정 |
| **M5** | 배포 | Vercel 배포, 환경변수 설정, 도메인 | 진행 예정 |

---

## 12. 리스크

| 항목 | 내용 | 대응 |
|---|---|---|
| SA/NSA 혼용 | 계열 혼동 시 잘못된 비교 | 동일 계열 가드 + 화면 표기 |
| FRED 요율 제한 | 대량 적재 시 제한 | 시리즈별 순차/배치 + 재시도 |
| PPI 개정 | 발표 후 값 변경 | upsert 재적재 + 적재 시각 기록 |
| 컨센서스 공백 | 수동 입력 누락 시 서프라이즈 표시 불가 | `—` fallback 처리, 입력 가이드 제공 |
| 디자인 교체 | 추후 Claude Design 적용 | 색·간격 CSS 변수 토큰화로 교체 용이 |

### 오픈 질문 — 0건 (전부 확정)

| # | 질문 | 확정 내용 |
|---|---|---|
| Q1 | 대표 시리즈 목록 | `PPIACO` (헤드라인), 나머지는 광범위 수집·FRED 카테고리 필터 |
| Q2 | 카테고리 분류 기준 | FRED 카테고리 체계 그대로 |
| Q3 | 즐겨찾기 저장 | localStorage, 최대 5개, 로그인 불필요 |

---

## 13. 프론트 / 백 역할 분리

**경계 원칙**: 프론트는 `/api/*`만 호출 · 백엔드 API는 Supabase만 읽음 · FRED 직접 호출은 적재 스크립트 전용.

### (A) 프론트엔드 책임

| 컴포넌트명 | 역할 | 받는 데이터 | 발생 이벤트 |
|---|---|---|---|
| `DashboardLayout` | 반응형 다크 레이아웃 셸 | children | — |
| `KpiCardRow` | KPI 카드 행 컨테이너 (P0-1) | `KpiListResponse` (`GET /api/kpi`) | `onSelectSeries(seriesId)` |
| `KpiCard` | 단일 KPI 카드 | `KpiItem` | `onClick → 시리즈 선택` |
| `CategoryFilter` | FRED 카테고리 필터 (P0-3) | `GET /api/categories` | `onChangeCategory(category)` |
| `SeriesList` | 선택 카테고리 시리즈 목록 | `SeriesListResponse` (`GET /api/series?category=`) | `onSelectSeries(seriesId)` |
| `TrendChart` | 추이 라인 차트 (P0-2) | `ObservationListResponse` (`GET /api/series/{id}/observations`) | `onHover(point)` |
| `SeriesMeta` | 출처·단위·기준연도 표기 | `SeriesItem` 일부 | — |
| `SummaryPanel` *(P1-3)* | 기간 요약 패널 | `GET /api/series/{id}/summary` | — |
| `InsightBadge` *(P1-4)* | 인사이트 한 줄 뱃지 | `KpiItem.insight` | — |

### (B) 백엔드 책임 (Route Handler, `app/api/`)

| API 경로 | 메서드 | 입력 | 출력 타입 | 외부 의존성 |
|---|---|---|---|---|
| `/api/kpi` | GET | `?category=` (선택) | `KpiListResponse` | Supabase + `lib/analytics` |
| `/api/categories` | GET | — | `{ category: string; count: number }[]` | Supabase |
| `/api/series` | GET | `?category=` (선택) | `SeriesListResponse` | Supabase |
| `/api/series/{id}` | GET | path `id` | `SeriesItem` | Supabase |
| `/api/series/{id}/observations` | GET | path `id`, `?from=&to=` | `ObservationListResponse` | Supabase + `lib/analytics` |
| `/api/series/{id}/summary` *(P1-3)* | GET | path `id`, `?from=&to=` | `{ min, max, trend: 'up'\|'flat'\|'down', recentChange }` | Supabase + `lib/analytics` |
| `scripts/ingest.ts` | CLI | 시리즈 목록, env vars | series/observation upsert | **FRED API** + Supabase |

---

## 14. 부록 A — 프론트↔백 API 계약 타입 (Frozen)

> **단일 진실 출처**: [`lib/types.ts`](../lib/types.ts)
> 이 타입을 변경하면 백엔드 Route Handler와 프론트 컴포넌트를 **동시에** 수정해야 한다.
> JSON 키는 camelCase. `readonly` 적용 — 응답 객체를 변이하지 않는다.

### 에러 응답 (공통)

```typescript
type ApiErrorCode =
  | 'SERIES_NOT_FOUND' | 'OBSERVATION_NOT_FOUND'
  | 'INVALID_CATEGORY' | 'INVALID_PARAMS'
  | 'DB_ERROR' | 'INTERNAL_ERROR'

interface ApiError {
  readonly error: {
    readonly code: ApiErrorCode
    readonly message: string   // 사람이 읽는 설명
    readonly status: number    // HTTP 상태 코드
  }
}
```

### SeriesItem · SeriesListResponse

```typescript
interface SeriesItem {
  readonly seriesId: string       // FRED series_id
  readonly title: string
  readonly units: string          // 예: "Index 1982=100"
  readonly seasonalAdj: 'SA' | 'NSA'
  readonly category: string       // FRED 카테고리 값
  readonly lastUpdated: string    // ISO 8601
}

interface SeriesListResponse {
  readonly data: readonly SeriesItem[]
  readonly total: number
  readonly filter: { readonly category: string | null }
}
```

### KpiItem · KpiListResponse — ⚠️ 폐기(v2.1) → `HeadlineKpi`로 대체

> **v2.1에서 대체됨**: 아래 `KpiItem`·`KpiListResponse`는 코드에서 제거됐다. 메인 대시보드는
> `GET /api/dashboard`의 **`HeadlineKpi`**(`lib/types.ts`)를 쓴다. 실제 필드는 Annualized 3M(`ann3m`)을
> 주값으로, `accel3m`(실질가속도)을 델타로 두고 `consensusYoy`·`surprise`·`consensusSource`를 병기한다.
> 규칙기반 `insight` 필드는 없고, 한줄평은 응답의 별도 `insight`(LLM 생성, `DashboardInsight`)로 내려온다.
> 아래 블록은 초기 설계 기록으로만 남긴다.

```typescript
// (폐기) 초기 설계 — 현재는 lib/types.ts 의 HeadlineKpi / DashboardResponse 참조
interface KpiItem {
  readonly seriesId: string
  readonly title: string
  readonly refDate: string              // 기준 발표월 (예: "2024-02-01")
  readonly latestValue: number          // 최신 지수값 (원본)
  readonly yoy: number | null           // 전년 동월 대비 (%)
  readonly consensusYoy: number | null  // 시장 예상 YoY (수동 입력, 없으면 null)
  readonly surprise: number | null      // 실측 YoY − 컨센서스 (없으면 null)
  readonly insight: string | null       // R1~R5 규칙 계산 결과
}

interface KpiListResponse {
  readonly data: readonly KpiItem[]
  readonly filter: { readonly category: string | null }
}
```

### ObservationItem · ObservationListResponse

```typescript
interface ObservationItem {
  readonly date: string          // ISO 8601, 해당 월 1일
  readonly value: number | null  // 결측은 null (0 대체 금지)
  readonly mom: number | null    // MoM % (첫 관측은 null)
  readonly yoy: number | null    // YoY % (12개월 미만은 null)
}

interface ObservationListResponse {
  readonly seriesId: string
  readonly title: string
  readonly units: string
  readonly seasonalAdj: 'SA' | 'NSA'
  readonly data: readonly ObservationItem[]
  readonly range: { readonly from: string | null; readonly to: string | null }
}
```
