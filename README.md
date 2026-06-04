# PPI Insight · 미국 생산자물가 추이 분석 대시보드

미국 PPI(Producer Price Index, 생산자물가지수)를 FRED API로 수집·저장하고,
발표 즉시 MoM·YoY·컨센서스·기여도·히트맵을 다크 반응형 UI로 제공하는 풀스택 분석 대시보드.

**Tech Stack**: Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase · Vercel  
**Data Source**: [FRED (Federal Reserve Bank of St. Louis)](https://fred.stlouisfed.org/)  
**Brand**: might Macro / NEWISE Design System

---

## 목차

1. [로컬 개발 환경 구성](#1-로컬-개발-환경-구성)
2. [DB 초기 설정 및 FRED 데이터 적재](#2-db-초기-설정-및-fred-데이터-적재)
3. [시리즈 탐색 기능](#3-시리즈-탐색-기능)
4. [지표 정의 및 활용 가이드](#4-지표-정의-및-활용-가이드)
5. [프로젝트 구조](#5-프로젝트-구조)
6. [다음 단계 (Roadmap)](#6-다음-단계-roadmap)

---

## 1. 로컬 개발 환경 구성

### 1-1. 사전 요구사항

| 도구 | 최소 버전 | 확인 명령 | 비고 |
|------|-----------|-----------|------|
| Node.js | **20.6 이상** | `node -v` | `npm run ingest`가 `--env-file` 플래그를 사용하므로 Node 20 이상 필수 |
| npm | 9 이상 | `npm -v` | |
| Git | — | `git --version` | |

### 1-2. 설치

```bash
# 저장소 클론
git clone https://github.com/lhs33019/might_macro.git
cd might_macro

# 패키지 설치 (node_modules 생성)
npm install
```

### 1-3. 환경변수 설정

```bash
# 템플릿 복사 후 편집
cp .env.local.example .env.local
```

`.env.local`을 열고 아래 4개 키를 입력한다:

```env
# ─── FRED API ────────────────────────────────────────────────
# 발급: https://fred.stlouisfed.org/docs/api/api_key.html (무료)
FRED_API_KEY=your_fred_api_key_here

# ─── Supabase ────────────────────────────────────────────────
# Supabase 프로젝트 Settings > API 에서 확인
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # 클라이언트용 (anon key)
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...                   # 서버·적재 전용 (절대 클라이언트 노출 금지)
```

> **보안 주의**: `.env.local`은 `.gitignore`에 포함되어 있다. 절대 커밋하지 않는다.

### 1-4. 개발 서버 실행

```bash
npm run dev
# → http://localhost:3000
# 현재 메인 대시보드는 더미 데이터(lib/data/dummy.ts)로 동작한다.
# 실 데이터는 §2(DB 설정 + 적재) 완료 후 /series 페이지에서 확인 가능하다.
```

### 1-5. 주요 명령어

```bash
npm run dev           # 개발 서버 (HMR, localhost:3000)
npm run build         # 프로덕션 빌드 (배포 전 반드시 확인)
npm run lint          # ESLint 검사

# FRED → Supabase 데이터 적재 (§2 완료 후)
npm run ingest        # 전체 PPI 시리즈 자동 발견 + 적재 (최초 실행 / 월간 갱신)
npm run ingest:retry  # 이전 실행에서 실패한 시리즈만 재시도
```

---

## 2. DB 초기 설정 및 FRED 데이터 적재

### 2-1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) 로그인 → **New Project** 생성
2. **Settings > API**에서 URL과 키 확인 → `.env.local`에 입력

### 2-2. 테이블 생성 (SQL Editor)

Supabase 대시보드 → **SQL Editor**에서 아래 SQL을 순서대로 실행한다.

#### Step 1 — `series` 테이블 (시리즈 메타)

```sql
-- PPI 시리즈 메타데이터 (FRED series_id 기준 관리)
-- category는 자동 분류: headline | core | energy | food | service | goods | other
CREATE TABLE IF NOT EXISTS series (
  series_id    TEXT PRIMARY KEY,              -- FRED series_id (예: PPIACO, PPIFIS)
  title        TEXT NOT NULL,                -- 시리즈 이름 (예: "PPI Final Demand")
  units        TEXT NOT NULL,                -- 단위 (예: "Index 2009-11=100")
  frequency    TEXT NOT NULL DEFAULT 'Monthly',
  seasonal_adj TEXT NOT NULL CHECK (seasonal_adj IN ('SA', 'NSA')),
                                             -- SA=계절조정, NSA=비계절조정
  category     TEXT NOT NULL DEFAULT 'headline',
  last_updated TIMESTAMPTZ                   -- FRED 기준 마지막 갱신 시각
);

COMMENT ON TABLE series IS 'FRED PPI 시리즈 메타데이터';
COMMENT ON COLUMN series.category    IS 'headline | core | energy | food | service | goods | other';
COMMENT ON COLUMN series.seasonal_adj IS 'SA=계절조정, NSA=비계절조정';
```

#### Step 2 — `observation` 테이블 (월간 관측값)

```sql
-- FRED 원본 관측값 — 변형 없이 보존
-- MoM·YoY 등 파생 지표는 저장하지 않고 조회 시 계산 (lib/analytics/index.ts)
CREATE TABLE IF NOT EXISTS observation (
  series_id TEXT NOT NULL REFERENCES series(series_id) ON DELETE CASCADE,
  date      DATE NOT NULL,          -- 해당 월 1일로 정규화 (예: 2026-04-01)
  value     NUMERIC,               -- 지수값. FRED "." 결측 → NULL (0 대체 금지)
  PRIMARY KEY (series_id, date)    -- 복합 기본키로 upsert 멱등성 보장
);

-- 시리즈별 최신 데이터 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_observation_series_date
  ON observation (series_id, date DESC);

COMMENT ON TABLE observation IS 'FRED 원본 월간 관측값 — 변형 없이 보존';
COMMENT ON COLUMN observation.value IS 'NULL = FRED 결측값("."). 0으로 대체하지 않는다.';
```

#### Step 3 — `consensus` 테이블 (시장 컨센서스 — 수동 입력)

```sql
-- 시장 예상치(컨센서스)는 FRED에 없으므로 수동 입력
-- 값이 없으면 서프라이즈 칸은 자동으로 "—"로 표기된다
CREATE TABLE IF NOT EXISTS consensus (
  series_id     TEXT NOT NULL REFERENCES series(series_id) ON DELETE CASCADE,
  date          DATE NOT NULL,          -- 해당 발표월 1일 기준 (예: 2026-05-01)
  consensus_yoy NUMERIC NOT NULL,       -- 시장 예상 전년동월비 (%)
  source        TEXT NOT NULL,          -- 출처 필수 (예: 'Bloomberg', 'Reuters')
  note          TEXT,                   -- 비고 (선택)
  PRIMARY KEY (series_id, date)
);

COMMENT ON TABLE consensus IS '시장 컨센서스(예상치) — FRED 경로와 분리된 수동 입력';
COMMENT ON COLUMN consensus.consensus_yoy IS '시장 예상 전년동월비(%). 없으면 서프라이즈는 대시(—)로 표시';
```

#### Step 4 — Row Level Security (권장)

```sql
-- 공개 읽기 허용 (anon 키로 조회 가능)
-- 쓰기는 service_role 키만 가능 (ingest 스크립트 전용)
ALTER TABLE series      ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_series"      ON series      FOR SELECT USING (true);
CREATE POLICY "anon_read_observation" ON observation FOR SELECT USING (true);
CREATE POLICY "anon_read_consensus"   ON consensus   FOR SELECT USING (true);
```

### 2-3. FRED 데이터 적재

#### 전체 적재 (처음 실행 또는 월간 갱신)

```bash
npm run ingest
```

**내부 동작 (`scripts/ingest.ts`)**:

```
1. 시리즈 자동 발견 (PPI 카테고리 트리 재귀 탐색)
   └─ FRED /category/series + /category/children 를 루트(category_id=31,
       "Producer Price Indexes")부터 DFS로 순회
       → 각 카테고리의 직속 Monthly 시리즈를 누적, 하위 카테고리로 계속 하강
       → visited 집합으로 순환/중복 방지, 약 8,100여 개 시리즈 발견
   ※ /series/search 방식은 FRED의 5,000건 페이지네이션 상한에 걸려
      결과가 통째로 폐기되는 문제가 있어 카테고리 재귀 방식으로 전환함

2. 순차 적재 (FRED 레이트 제한 보호 — 병렬 처리 금지)
   [1/N] PPIACO 적재 중... → 1360건 완료
   [2/N] PPIFIS 적재 중... → 198건 완료
   [3/N] WPSFD4131 FAIL: 오류메시지    ← 실패해도 계속 진행
   ...

3. 완료 요약
   [완료] 성공: 144건 / 실패: 3건
   [저장] 실패 목록 → failed-series.json
   [안내] 재시도: npm run ingest:retry
```

**멱등성**: 이미 적재된 데이터가 있어도 upsert로 안전하게 재실행 가능.  
**자동 분류**: 시리즈 ID/이름 패턴으로 `category` 자동 추정 (food/energy/core/service/goods/headline/other).

#### 실패 시리즈 재시도

```bash
# 전체 적재 후 failed-series.json이 생성된 경우에만 의미 있음
npm run ingest:retry

# → failed-series.json의 시리즈 목록만 재시도
# → 모두 성공하면 failed-series.json 자동 삭제
```

### 2-4. 컨센서스(예상치) 수동 입력

컨센서스는 FRED에 없으므로 매월 발표 전 Bloomberg·Reuters 등에서 확인 후 입력:

```sql
-- 컨센서스 입력 (이미 있으면 갱신)
INSERT INTO consensus (series_id, date, consensus_yoy, source, note)
VALUES (
  'PPIFIS',           -- 시리즈 ID
  '2026-05-01',       -- 해당 발표월 1일 (4월 데이터 → 5월 발표)
  2.3,                -- 시장 예상 YoY (%)
  'Bloomberg',        -- 출처
  '2026년 5월 발표 사전 컨센서스'
)
ON CONFLICT (series_id, date) DO UPDATE
  SET consensus_yoy = EXCLUDED.consensus_yoy,
      source        = EXCLUDED.source,
      note          = EXCLUDED.note;
```

> 컨센서스 값이 없으면 대시보드의 서프라이즈 칸은 자동으로 `—`로 표기된다.

### 2-5. 월간 유지보수 체크리스트

매월 PPI 발표일(보통 매월 둘째 주 수요일) 이후:

- [ ] `npm run ingest` 실행 → 전체 시리즈 최신값 갱신 (upsert)
- [ ] 실패 시 `npm run ingest:retry` 로 재시도
- [ ] 컨센서스 다음 달치 입력 (§2-4 SQL)
- [ ] `/series` 페이지에서 Top Movers 수치 육안 확인

---

## 3. 시리즈 탐색 기능

메인 대시보드 헤더의 **"시리즈 탐색"** 버튼 또는 직접 `/series`로 이동한다.

### 3-1. Top Movers (상단 4개 테이블)

DB에 적재된 전체 시리즈를 대상으로 최근 MoM·YoY를 계산하고 상위·하위를 표시한다.

| 테이블 | 기준 | 내용 |
|--------|------|------|
| MoM 상위 5 | 전월비(%) 내림차순 | 이번 달 가장 많이 오른 시리즈 |
| MoM 하위 5 | 전월비(%) 오름차순 | 이번 달 가장 많이 내린 시리즈 |
| YoY 상위 5 | 전년비(%) 내림차순 | 전년 대비 가장 많이 오른 시리즈 |
| YoY 하위 5 | 전년비(%) 오름차순 | 전년 대비 가장 많이 내린 시리즈 |

값 옆의 글리프(▲/▼/—)와 색상이 항상 함께 표시된다 (색맹 접근성).

### 3-2. 시리즈 목록 (20개씩 페이지네이션)

- **전체 기준 정렬**: 컬럼 헤더 클릭 시 전체 시리즈를 정렬 후 페이지 적용
  - `Series ID` / `이름` / `카테고리`: 텍스트 정렬
  - `MoM` / `YoY`: 수치 정렬 (null 값은 항상 마지막)
- **같은 컬럼 재클릭**: 오름차순 ↔ 내림차순 토글
- **행 클릭**: 오른쪽 상세 패널 표시 (재클릭 시 닫힘)

### 3-3. 상세 차트 패널

시리즈 클릭 시 오른쪽에 표시되는 패널:

| 컨트롤 | 옵션 |
|--------|------|
| 기간 | 6M / 1Y / 3Y / 5Y / 전체 |
| 지표 | MoM(전월비) / YoY(전년동월비) |

- 순수 SVG LineChart 사용 (메인 대시보드와 동일한 컴포넌트)
- 호버 시 크로스헤어 + 날짜/값 툴팁 표시
- 면적 채움 색상: 최신 방향(상승=warm / 하락=cool)에 따라 자동 결정

---

## 4. 지표 정의 및 활용 가이드

### 4-1. PPI란 무엇인가

**생산자물가지수(Producer Price Index, PPI)**는 국내 생산자가 판매하는 재화·서비스의 평균 가격 변동을 측정하는 지수다.

- **CPI와의 차이**: CPI는 소비자가 *사는* 가격, PPI는 생산자가 *파는* 가격.  
  PPI는 소비자 물가에 1~3개월 선행하는 경향이 있어 **인플레이션 선행지표**로 활용된다.
- **발표**: 미국 노동통계국(BLS)이 매월 발표. 전월 데이터를 다음 달 둘째 주에 공표.
- **원천 데이터**: [FRED](https://fred.stlouisfed.org/)를 통해 BLS 공식 데이터 수집.

### 4-2. 핵심 시리즈

| 시리즈 | 이름 | 기준 | 해석 |
|--------|------|------|------|
| **PPIFIS** | PPI Final Demand, Headline | SA, 2009-11=100 | 최종 수요 단계의 전체 PPI. 헤드라인 기준값. |
| **PPIFES** | PPI Final Demand, Core (ex Food & Energy) | SA, 2009-11=100 | 식품·에너지를 제외한 근원 PPI. 기저 인플레이션 추세 확인에 유리. |
| **PPIDFS** | PPI Final Demand, Food | SA | 식품 물가 단독 추이. |
| **PPIACO** | PPI All Commodities | NSA, 1982-84=100 | 구 기준 전체 PPI. PPIFIS 이전(~2009.10) 장기 역사 보강에 사용. |

> **SA vs NSA**: SA(Seasonally Adjusted, 계절조정)는 계절 요인을 제거해 추세를 읽기 쉽다.  
> 같은 차트 안에서 SA/NSA 혼용 금지. NSA(PPIACO)는 장기 역사 보강 전용.

### 4-3. 주요 지표 정의

#### MoM — 전월비 (Month-over-Month)

```
MoM(t) = (Index(t) / Index(t-1) - 1) × 100  [%]
```

- **의미**: 이번 달 지수가 전달 대비 몇 % 변했는가.
- **특징**: 단기 변동성이 크다. 에너지 가격이나 계절 요인에 민감.
- **활용**: 최신 발표치와 컨센서스 비교 → 서프라이즈 판단. 단기 추세 전환 포착.

#### YoY — 전년동월비 (Year-over-Year)

```
YoY(t) = (Index(t) / Index(t-12) - 1) × 100  [%]
```

- **의미**: 이번 달 지수가 1년 전 같은 달 대비 몇 % 변했는가.
- **특징**: 12개월 평균 효과로 단기 노이즈 흡수. 기조적 인플레이션 수준 확인에 적합.
- **주의**: **베이스 이펙트(Base Effect)**에 유의. 전년 동월 지수가 특이치면 YoY가 왜곡된다.

#### 서프라이즈 (Surprise)

```
Surprise = 실제 MoM - 컨센서스 MoM  [%p]
```

- **+서프라이즈**: 예상보다 물가 상승 → 금리 인상 압력, 채권 약세 요인.
- **-서프라이즈**: 예상보다 물가 둔화 → 금리 인하 기대 강화, 채권 강세 요인.
- **표시 조건**: 컨센서스가 입력된 월에만 표시. 없으면 `—`.

#### 코어 PPI (Core PPI)

- **정의**: 식품(Food)·에너지(Energy)를 제외한 PPI. FRED 시리즈: `PPIFES`.
- **중요성**: 식품·에너지는 공급 충격(날씨, 지정학)에 의해 급등락해 기저 물가 추세를 가린다.  
  코어 PPI는 이 변동성을 제거해 **구조적 인플레이션 압력**을 더 명확히 보여준다.

#### 기여도 (Contribution)

```
Contribution(i) = ΔIndex(i) × Weight(i)  [%p]
```

- **의미**: 헤드라인 MoM 변동 중 각 품목이 기여한 %p.
- **활용**: "왜 이번 달 PPI가 올랐는가"를 품목 단위로 분해. 정책·투자 결정에 원인 파악 필수.
- **읽는 법**: 양수(+) = 상승 기여(warm bar), 음수(−) = 하락 기여(cool bar).

### 4-4. 색상 규칙 (아시아 시장 관행)

이 대시보드는 **아시아 시장 관행**을 따른다. 미국식 green/red와 반대임에 주의.

| 방향 | 색상 | 글리프 | 의미 |
|------|------|--------|------|
| 상승 (Rising) | 따뜻한 코럴 `#F4715E` | ▲ | 물가 상승 / 컨센서스 상회 |
| 하락 (Falling) | 차분한 스틸 블루 `#54A6D6` | ▼ | 물가 하락 / 컨센서스 하회 |
| 보합 (Flat) | 뮤트 그레이 `#8A94A8` | — | 변동 없음 |

색맹 접근성을 위해 색상과 글리프(▲/▼/—)를 항상 함께 표기한다.

### 4-5. 차트 읽는 법

#### 추이 차트 (Line Chart)

- **X축**: 시간 (월별). 기간 필터(6M/1Y/3Y/5Y/전체)로 조정.
- **Y축**: MoM 또는 YoY 변동률(%). 0선 기준으로 상하 방향 확인.
- **면적 채움**: 최신 데이터 방향(상승/하락)에 따라 warm/cool 반투명 채움.
- **황금선**: 실제 변동률 계열 (`var(--accent)` 색상).
- **빈 동그라미 마커**: 컨센서스 오버레이 활성화 시 시장 예상치.

#### 기여도 차트 (ContributionBars)

- 중앙 세로선이 0 기준. 우측(+) = 상승 기여, 좌측(−) = 하락 기여.
- 막대 길이는 기여도 절댓값에 비례.

#### 히트맵 (Heatmap)

- 행 = 카테고리 (헤드라인·근원·에너지·식품·재화·서비스).
- 열 = 최근 8개월.
- 셀 색상 = MoM 변동 강도. 진한 warm = 강한 상승, 진한 cool = 강한 하락.

### 4-6. 대시보드 활용 시나리오

| 사용자 | 시나리오 | 보는 지표 |
|--------|----------|-----------|
| 투자자 | PPI 발표 당일 시장 영향 판단 | KPI 헤드라인 MoM + 서프라이즈 |
| 애널리스트 | 인플레이션 추세 방향성 보고서 작성 | YoY 추이 차트 (3Y/5Y), 코어 vs 헤드라인 |
| 기업 CFO | 원재료 가격 동향 파악, 원가 전략 수립 | 품목별 기여도 차트, 카테고리 히트맵 |
| 이코노미스트 | 연준 통화정책 경로 예측 | 코어 PPI YoY 장기 추이, 컨센서스 비교 |

---

## 5. 프로젝트 구조

```
PPI_inspire_dashboard/
├─ app/
│  ├─ globals.css          # 디자인 토큰 전체 + 컴포넌트 CSS (.nw-*)
│  ├─ layout.tsx           # 루트 레이아웃 (메타데이터, 폰트)
│  ├─ page.tsx             # 메인 대시보드 (현재: 더미 데이터 / M4에서 실 API 연결 예정)
│  ├─ series/
│  │  ├─ page.tsx          # 시리즈 탐색 페이지 (Server Component — Supabase 직접 조회)
│  │  └─ SeriesExplorer.tsx # 인터랙션 Client Component (정렬·페이지네이션·상세 패널)
│  └─ api/
│     └─ series/
│        ├─ route.ts                      # GET /api/series — 전체 시리즈+통계+movers
│        └─ [id]/observations/route.ts    # GET /api/series/{id}/observations
├─ components/
│  ├─ charts/
│  │  ├─ LineChart.tsx          # 순수 SVG 추이 차트 (ChartPoint 타입 export)
│  │  ├─ ContributionBars.tsx   # 발산형 수평 막대 (기여도)
│  │  └─ Heatmap.tsx            # 카테고리 × 월 히트맵
│  ├─ series/
│  │  ├─ TopMoversTable.tsx     # MoM·YoY 상위/하위 5 미니 테이블
│  │  ├─ SeriesTable.tsx        # 전체 기준 정렬 + 20개씩 페이지네이션 목록
│  │  └─ SeriesDetailPanel.tsx  # 클릭 시 표시되는 오른쪽 상세 차트 패널
│  ├─ Card.tsx          # 카드 쉘 + Legend
│  ├─ KpiCard.tsx       # KPI 카드 + InfoCard + 스켈레톤
│  └─ controls.tsx      # Segmented, Toggle, CheckChip
├─ lib/
│  ├─ queries/
│  │  └─ series.ts      # Supabase 쿼리+집계 로직 (API route · Server Component 공유)
│  ├─ data/dummy.ts     # 합성 PPI 더미 데이터 (메인 대시보드 개발용, M4까지 유지)
│  ├─ supabase/         # DB 클라이언트(client.ts, server.ts) + 타입(types.ts)
│  ├─ fred/client.ts    # FRED API 클라이언트 (적재 전용)
│  │                    #   fetchSeriesMeta, fetchObservations
│  │                    #   fetchSeriesBySearch, fetchCategorySeriesIds
│  ├─ analytics/index.ts # 순수 함수: calcMoM, calcYoY, enrichObservations 등
│  └─ types.ts          # 프론트↔백 API 계약 (SSoT — 변경 시 양쪽 동시 수정)
├─ public/
│  ├─ fonts/            # BookkMyungjo (TTF), PretendardVariable (WOFF2) 자체 호스팅
│  └─ assets/           # ppi-mark.png, mightmacro-lockup.png 등 브랜드 에셋
├─ scripts/
│  └─ ingest.ts         # FRED → Supabase 적재 (자동 발견·진행상황 출력·retry)
├─ docs/
│  ├─ PRD_v2.0.md       # 제품 요구사항 문서
│  └─ DESIGN_SYSTEM.md  # 디자인 토큰·컴포넌트·차트 레퍼런스 전체
├─ .env.local.example   # 환경변수 템플릿
└─ CLAUDE.md            # AI 협업 기준 문서 (프로젝트 컨벤션 전체)
```

---

## 6. 다음 단계 (Roadmap)

| 단계 | 상태 | 내용 | 선행 조건 |
|------|------|------|-----------|
| **M1** | ✅ 완료 | Next.js 15 스캐폴딩, 타입 계약, 폴더 구조 | — |
| **M1.5** | ✅ 완료 | might Macro 디자인 시스템 구현 — 토큰, 컴포넌트, 순수 SVG 차트 | M1 |
| **M2** | ✅ 완료 | Supabase 테이블 생성 + FRED 핵심 4개 시리즈 실데이터 적재 | §2 환경변수 입력 |
| **M2.5** | ✅ 완료 | 시리즈 탐색 페이지(`/series`) + 전체 PPI 시리즈 자동 수집 ingest 고도화 | M2 |
| **M3** | ⏳ 대기 | `lib/analytics/` 단위 테스트 (Jest/Vitest) | M2 |
| **M4** | ⏳ 대기 | 메인 대시보드 실 Supabase API 연결 (더미 데이터 교체) | M2 |
| **M5** | ⏳ 대기 | Vercel 배포 + 환경변수 설정 | M4 |
| **M6** | ⏳ 대기 | 컨센서스 수동 입력 UI (Supabase Studio 또는 간단한 관리 페이지) | M4 |

---

*출처: FRED (Federal Reserve Bank of St. Louis) · might Macro 내부 DB 적재*  
*방향 색상 규칙: 상승 ▲ 따뜻한 색 · 하락 ▼ 차분한 색 (아시아 시장 관행)*
