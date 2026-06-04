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
3. [지표 정의 및 활용 가이드](#3-지표-정의-및-활용-가이드)
4. [프로젝트 구조](#4-프로젝트-구조)
5. [다음 단계 (Roadmap)](#5-다음-단계-roadmap)

---

## 1. 로컬 개발 환경 구성

### 1-1. 사전 요구사항

| 도구 | 최소 버전 | 확인 명령 |
|------|-----------|-----------|
| Node.js | 18.17 이상 | `node -v` |
| npm | 9 이상 | `npm -v` |
| Git | — | `git --version` |

### 1-2. 설치

```bash
# 저장소 클론
git clone <repo-url>
cd PPI_inspire_dashboard

# 패키지 설치
npm install
```

### 1-3. 환경변수 설정

```bash
# 템플릿 복사
cp .env.local.example .env.local
```

`.env.local`을 열고 아래 4개 키를 입력한다:

```env
# FRED API 키 — https://fred.stlouisfed.org/docs/api/api_key.html 에서 무료 발급
FRED_API_KEY=your_fred_api_key_here

# Supabase — https://supabase.com → 프로젝트 Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...   # 클라이언트용 (anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...        # 서버·적재 전용 (절대 클라이언트 노출 금지)
```

> **보안 주의**: `.env.local`은 `.gitignore`에 포함되어 있다. 커밋하지 않는다.

### 1-4. 개발 서버 실행

```bash
npm run dev
# → http://localhost:3000
```

현재 더미 데이터(`lib/data/dummy.ts`)로 대시보드가 동작한다.  
DB 연결 전이므로 실 데이터는 §2를 완료한 후 표시된다.

### 1-5. 주요 명령어

```bash
npm run dev      # 개발 서버 (HMR, localhost:3000)
npm run build    # 프로덕션 빌드 (배포 전 반드시 확인)
npm run lint     # ESLint 검사
npm run ingest   # FRED → Supabase 데이터 적재 (§2 완료 후)
```

---

## 2. DB 초기 설정 및 FRED 데이터 적재

### 2-1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) 로그인 → **New Project** 생성
2. 프로젝트 생성 후 **Settings > API**에서 URL과 키 확인 → `.env.local`에 입력

### 2-2. 테이블 생성 (SQL Editor)

Supabase 대시보드 → **SQL Editor**에서 아래 SQL을 순서대로 실행한다.

#### Step 1 — `series` 테이블 (시리즈 메타)

```sql
CREATE TABLE IF NOT EXISTS series (
  series_id    TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  units        TEXT NOT NULL,
  frequency    TEXT NOT NULL DEFAULT 'Monthly',
  seasonal_adj TEXT NOT NULL CHECK (seasonal_adj IN ('SA', 'NSA')),
  category     TEXT NOT NULL DEFAULT 'headline',
  last_updated TIMESTAMPTZ
);

COMMENT ON TABLE series IS 'FRED PPI 시리즈 메타데이터';
COMMENT ON COLUMN series.series_id   IS 'FRED series_id (예: PPIFIS, PPIFES, PPIACO)';
COMMENT ON COLUMN series.category    IS 'headline | core | energy | food | service | ...';
COMMENT ON COLUMN series.seasonal_adj IS 'SA=계절조정, NSA=비계절조정';
```

#### Step 2 — `observation` 테이블 (월간 관측값)

```sql
CREATE TABLE IF NOT EXISTS observation (
  series_id TEXT NOT NULL REFERENCES series(series_id) ON DELETE CASCADE,
  date      DATE NOT NULL,          -- 해당 월 1일로 정규화 (예: 2026-04-01)
  value     NUMERIC,               -- 지수값. FRED "." 결측 → NULL
  PRIMARY KEY (series_id, date)
);

CREATE INDEX IF NOT EXISTS idx_observation_series_date
  ON observation (series_id, date DESC);

COMMENT ON TABLE observation IS 'FRED 원본 월간 관측값 — 변형 없이 보존';
COMMENT ON COLUMN observation.value IS 'NULL = FRED 결측값("."). 0으로 대체하지 않는다.';
```

#### Step 3 — `consensus` 테이블 (시장 컨센서스 — 수동 입력)

```sql
CREATE TABLE IF NOT EXISTS consensus (
  series_id     TEXT NOT NULL REFERENCES series(series_id) ON DELETE CASCADE,
  date          DATE NOT NULL,          -- 해당 발표월 1일 기준
  consensus_yoy NUMERIC NOT NULL,       -- 시장 예상 YoY (%)
  source        TEXT NOT NULL,          -- 출처 필수 (예: 'Bloomberg', 'Reuters')
  note          TEXT,
  PRIMARY KEY (series_id, date)
);

COMMENT ON TABLE consensus IS '시장 컨센서스(예상치) — FRED 경로와 분리된 수동 입력';
COMMENT ON COLUMN consensus.consensus_yoy IS '시장 예상 전년동월비(%). 없으면 서프라이즈는 대시(—)로 표시';
```

#### Step 4 — Row Level Security (선택, 권장)

```sql
-- 공개 읽기 허용 (anon 키로 조회 가능)
ALTER TABLE series      ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_series"      ON series      FOR SELECT USING (true);
CREATE POLICY "anon_read_observation" ON observation FOR SELECT USING (true);
CREATE POLICY "anon_read_consensus"   ON consensus   FOR SELECT USING (true);
-- 쓰기는 service_role 키만 가능 (ingest 스크립트 전용)
```

### 2-3. FRED 데이터 최초 적재

테이블 생성 후 아래 명령으로 과거 전체 데이터를 적재한다.  
최초 실행 시 수 분 소요될 수 있다 (PPIFIS는 약 200여 개 월간 관측값).

```bash
npm run ingest
```

**내부 동작 (`scripts/ingest.ts`)**:

```
SERIES_IDS = ['PPIACO', 'PPIFIS', 'PPIFES', 'PPIDFS', ...]
  ↓
각 시리즈별:
  1. FRED API → 시리즈 메타 fetch
  2. series 테이블 upsert (있으면 갱신, 없으면 삽입)
  3. FRED API → 전체 관측값 fetch (observation_start 미지정 = 전체)
  4. observation 테이블 upsert (500건 청크)
```

> **멱등성**: 이미 적재된 데이터가 있어도 안전하게 재실행 가능.  
> PPI는 발표 후 소급 개정되므로 **매월 발표일 이후** 재실행해 최신값을 반영한다.

### 2-4. 추가 시리즈 등록

`scripts/ingest.ts`의 `SERIES_IDS` 배열에 추가하면 된다:

```typescript
const SERIES_IDS = [
  'PPIACO',  // 전체 PPI (NSA, 1982=100) — 장기 역사 보강용
  'PPIFIS',  // Final Demand Headline (SA, 2009-11=100) ← 헤드라인 기준
  'PPIFES',  // Final Demand ex Food & Energy, Core (SA)
  'PPIDFS',  // Final Demand — Food (SA)
  // 추가 시리즈는 여기에 FRED series_id를 넣는다
  // FRED 카탈로그: https://fred.stlouisfed.org/categories/32455
]
```

### 2-5. 컨센서스(예상치) 수동 입력

컨센서스는 FRED에 없으므로 매월 발표 전 수동으로 입력한다.  
Bloomberg·Reuters 등 금융 미디어에서 확인 후 Supabase SQL Editor에서 실행:

```sql
INSERT INTO consensus (series_id, date, consensus_yoy, source, note)
VALUES
  ('PPIFIS', '2026-04-01', 2.3, 'Bloomberg', '2026년 5월 발표 사전 컨센서스')
ON CONFLICT (series_id, date) DO UPDATE
  SET consensus_yoy = EXCLUDED.consensus_yoy,
      source        = EXCLUDED.source,
      note          = EXCLUDED.note;
```

> 컨센서스 값이 없으면 대시보드의 서프라이즈 칸은 자동으로 `—`로 표기된다.

### 2-6. 월간 유지보수 체크리스트

매월 PPI 발표일(보통 매월 둘째 주 수요일) 이후:

- [ ] `npm run ingest` 실행 → 최신 관측값 갱신
- [ ] 컨센서스 다음 달치 입력 (위 §2-5 SQL)
- [ ] 대시보드에서 KPI 카드 수치 육안 확인

---

## 3. 지표 정의 및 활용 가이드

### 3-1. PPI란 무엇인가

**생산자물가지수(Producer Price Index, PPI)**는 국내 생산자가 판매하는 재화·서비스의 평균 가격 변동을 측정하는 지수다.

- **소비자물가지수(CPI)와의 차이**: CPI는 소비자가 *사는* 가격, PPI는 생산자가 *파는* 가격.  
  PPI는 소비자 물가에 1~3개월 선행하는 경향이 있어 **인플레이션 선행지표**로 활용된다.
- **발표**: 미국 노동통계국(BLS)이 매월 발표. 전월 데이터를 다음 달 둘째 주에 공표.
- **원천 데이터**: 이 대시보드는 [FRED](https://fred.stlouisfed.org/)를 통해 BLS 공식 데이터를 수집한다.

### 3-2. 핵심 시리즈

| 시리즈 | 이름 | 기준 | 해석 |
|--------|------|------|------|
| **PPIFIS** | PPI Final Demand, Headline | SA, 2009-11=100 | 최종 수요 단계의 전체 PPI. 헤드라인 기준값. |
| **PPIFES** | PPI Final Demand, Core (ex Food & Energy) | SA, 2009-11=100 | 식품·에너지를 제외한 근원 PPI. 변동성 낮아 기저 인플레이션 추세 확인에 유리. |
| **PPIDFS** | PPI Final Demand, Food | SA | 식품 물가 단독 추이. |
| **PPIACO** | PPI All Commodities | NSA, 1982-84=100 | 구 기준 전체 PPI. PPIFIS 이전(~2009.10) 장기 역사 보강에 사용. |

> **SA vs NSA**: SA(Seasonally Adjusted, 계절조정)는 계절 요인을 제거해 추세를 읽기 쉽다.  
> 이 대시보드의 기본 시리즈는 모두 SA. NSA(PPIACO)는 장기 역사 보강에만 사용.

### 3-3. 주요 지표 정의

#### MoM — 전월비 (Month-over-Month)

```
MoM(t) = (Index(t) / Index(t-1) - 1) × 100  [%]
```

- **의미**: 이번 달 지수가 전달 대비 몇 % 변했는가.
- **특징**: 단기 변동성이 크다. 에너지 가격이나 계절 요인에 민감.
- **활용**: 최신 발표치와 컨센서스 비교 → **서프라이즈** 판단. 단기 추세 전환 포착.
- **예시**: MoM +0.3%는 이번 달 생산자 물가가 전달보다 0.3%p 올랐음을 뜻한다.

#### YoY — 전년동월비 (Year-over-Year)

```
YoY(t) = (Index(t) / Index(t-12) - 1) × 100  [%]
```

- **의미**: 이번 달 지수가 1년 전 같은 달 대비 몇 % 변했는가.
- **특징**: 12개월 평균 효과로 단기 노이즈 흡수. 기조적 인플레이션 수준 확인에 적합.
- **활용**: 연준(Fed) 통화정책 방향 예측, 기업 원가 관리 전략 수립.
- **주의**: **베이스 이펙트(Base Effect)**에 유의. 전년 동월 지수가 특이치면 YoY가 왜곡된다.

#### 서프라이즈 (Surprise)

```
Surprise = 실제 MoM - 컨센서스 MoM  [%p]
```

- **의미**: 시장 예상치(컨센서스)를 얼마나 상회·하회했는가.
- **활용**:
  - `+서프라이즈` (Upside Surprise): 예상보다 물가 상승 → 금리 인상 압력, 채권 약세 요인.
  - `-서프라이즈` (Downside Surprise): 예상보다 물가 둔화 → 금리 인하 기대 강화, 채권 강세 요인.
- **표시 조건**: 컨센서스가 입력된 월에만 표시. 없으면 `—`.

#### 코어 PPI (Core PPI)

- **정의**: 식품(Food)·에너지(Energy)를 제외한 PPI. FRED 시리즈: `PPIFES`.
- **왜 중요한가**: 식품·에너지는 공급 충격(날씨, 지정학)에 의해 급등락해 기저 물가 추세를 가린다.  
  코어 PPI는 이 변동성을 제거해 **구조적 인플레이션 압력**을 더 명확히 보여준다.
- **연준 참고 지표**: Fed는 코어 인플레이션을 정책 결정의 주요 참고지표로 활용한다.

#### 기여도 (Contribution)

```
Contribution(i) = ΔIndex(i) × Weight(i)  [%p]
```

- **의미**: 이번 달 헤드라인 MoM 변동 중 각 품목(식품·에너지·재화·서비스 등)이 기여한 %p.
- **활용**: "왜 이번 달 PPI가 올랐는가"를 품목 단위로 분해. 정책·투자 결정에 원인 파악 필수.
- **읽는 법**: 양수(+) = 상승 기여(warm bar), 음수(−) = 하락 기여(cool bar).

### 3-4. 색상 규칙 (중요)

이 대시보드는 **아시아 시장 관행**을 따른다. 미국식 green/red와 반대임에 주의.

| 방향 | 색상 | 글리프 | 의미 |
|------|------|--------|------|
| 상승 (Rising) | 따뜻한 코럴 `#F4715E` | ▲ | 물가 상승 / 컨센서스 상회 |
| 하락 (Falling) | 차분한 스틸 블루 `#54A6D6` | ▼ | 물가 하락 / 컨센서스 하회 |
| 보합 (Flat) | 뮤트 그레이 `#8A94A8` | — | 변동 없음 |

색맹 접근성을 위해 색상과 글리프(▲/▼/—)를 항상 함께 표기한다.

### 3-5. 차트 읽는 법

#### 추이 차트 (Line Chart)

- **X축**: 시간 (월별). 기간 필터(6M/1Y/3Y/5Y/전체)로 조정.
- **Y축**: MoM 또는 YoY 변동률(%). 0선 기준으로 상하 방향 확인.
- **면적 채움**: 최신 데이터 방향(상승/하락)에 따라 warm/cool 반투명 채움.
- **황금선**: 실제 변동률 계열.
- **빈 동그라미 마커**: 컨센서스 오버레이 활성화 시 시장 예상치.
- **스플라이스 주석**: `* 2009.11 이전은 Finished Goods 기준` — 데이터 계열 전환 지점 표기.

#### 기여도 차트 (ContributionBars)

- 중앙 세로선이 0 기준. 우측(+) = 상승 기여, 좌측(−) = 하락 기여.
- 막대 길이는 기여도 절댓값에 비례.

#### 히트맵 (Heatmap)

- 행 = 카테고리 (헤드라인·근원·에너지·식품·재화·서비스).
- 열 = 최근 8개월.
- 셀 색상 = MoM 변동 강도. 진한 warm = 강한 상승, 진한 cool = 강한 하락.
- 가로 스크롤로 과거 데이터 확인 가능.

### 3-6. 대시보드 활용 시나리오

| 사용자 | 시나리오 | 보는 지표 |
|--------|----------|-----------|
| 투자자 | PPI 발표 당일 즉시 시장 영향 판단 | KPI 헤드라인 MoM + 서프라이즈 |
| 애널리스트 | 인플레이션 추세 방향성 보고서 작성 | YoY 추이 차트 (3Y/5Y), 코어 vs 헤드라인 |
| 기업 CFO | 원재료 가격 동향 파악, 원가 전략 수립 | 품목별 기여도 차트, 카테고리 히트맵 |
| 이코노미스트 | 연준 통화정책 경로 예측 | 코어 PPI YoY 장기 추이, 컨센서스 비교 |

---

## 4. 프로젝트 구조

```
PPI_inspire_dashboard/
├─ app/
│  ├─ globals.css          # 디자인 토큰 전체 + 컴포넌트 CSS
│  ├─ layout.tsx           # 루트 레이아웃
│  └─ page.tsx             # 메인 대시보드 (현재: 더미 데이터)
├─ components/
│  ├─ charts/
│  │  ├─ LineChart.tsx     # SVG 추이 차트
│  │  ├─ ContributionBars.tsx
│  │  └─ Heatmap.tsx
│  ├─ Card.tsx
│  ├─ KpiCard.tsx
│  └─ controls.tsx         # Segmented, Toggle, CheckChip
├─ lib/
│  ├─ data/dummy.ts        # 더미 데이터 (M2 연결 전 사용)
│  ├─ supabase/            # DB 클라이언트 + 타입
│  ├─ fred/                # FRED API 클라이언트 (적재 전용)
│  ├─ analytics/           # 순수 함수 (MoM, YoY, Surprise)
│  └─ types.ts             # 프론트↔백 API 계약 (SSoT)
├─ public/
│  ├─ fonts/               # BookkMyungjo, PretendardVariable
│  └─ assets/              # 브랜드 에셋
├─ scripts/
│  └─ ingest.ts            # FRED → Supabase 적재 스크립트
├─ docs/
│  └─ PRD_v2.0.md
├─ .env.local.example      # 환경변수 템플릿 (키 입력 후 .env.local로 복사)
└─ CLAUDE.md               # AI 협업 기준 문서
```

---

## 5. 다음 단계 (Roadmap)

| 단계 | 내용 | 선행 조건 |
|------|------|-----------|
| **M2** | Supabase 테이블 생성 + `npm run ingest` 실데이터 적재 | §2 환경변수 입력 |
| **M3** | `lib/analytics/` 단위 테스트 (Jest/Vitest) | M2 |
| **M4** | `app/api/` Route Handler 구현 → 더미 데이터를 실 DB 쿼리로 교체 | M2 |
| **M5** | Vercel 배포 + 환경변수 설정 | M4 |
| **M6** | 컨센서스 수동 입력 UI (Supabase Studio 또는 간단한 관리 페이지) | M4 |

---

*출처: FRED (Federal Reserve Bank of St. Louis) · might Macro 내부 DB 적재*  
*방향 색상 규칙: 상승 ▲ 따뜻한 색 · 하락 ▼ 차분한 색 (아시아 시장 관행)*
