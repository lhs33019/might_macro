# PPI Insight · 미국 생산자물가 추이 분석 대시보드

미국 PPI(Producer Price Index, 생산자물가지수)를 FRED API로 수집·저장하고,
발표 즉시 **Annualized 3M(3개월 연율)·실질 가속도·MoM·YoY·히트맵·AI 한줄평**을
다크 반응형 UI로 제공하는 풀스택 분석 대시보드.

**Tech Stack**: Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase · Vercel  
**Data Source**: [FRED (Federal Reserve Bank of St. Louis)](https://fred.stlouisfed.org/)  
**AI Insight**: [Google AI Studio (Gemini)](https://aistudio.google.com/) — 적재 시점 1회 생성 → DB 저장  
**Brand**: might Macro / NEWISE Design System

---

## 목차

1. [로컬 개발 환경 구성](#1-로컬-개발-환경-구성)
2. [DB 초기 설정 및 FRED 데이터 적재](#2-db-초기-설정-및-fred-데이터-적재)
3. [메인 대시보드](#3-메인-대시보드)
4. [시리즈 탐색 기능](#4-시리즈-탐색-기능)
5. [지표 정의 및 활용 가이드](#5-지표-정의-및-활용-가이드)
6. [프로젝트 구조](#6-프로젝트-구조)
7. [다음 단계 (Roadmap)](#7-다음-단계-roadmap)

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

`.env.local`을 열고 아래 키를 입력한다:

```env
# ─── FRED API ────────────────────────────────────────────────
# 발급: https://fred.stlouisfed.org/docs/api/api_key.html (무료)
FRED_API_KEY=your_fred_api_key_here

# ─── Supabase ────────────────────────────────────────────────
# Supabase 프로젝트 Settings > API 에서 확인
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...          # 클라이언트용 (anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # 서버·적재 전용 (절대 클라이언트 노출 금지)

# ─── Google AI Studio (AI 한줄평) ───────────────────────────
# 발급: https://aistudio.google.com/apikey (무료 티어 제공)
# 적재 시점에만 사용. 없으면 한줄평 생성만 스킵되고 적재는 정상 동작.
GEMINI_API_KEY=your_gemini_api_key_here
```

> **보안 주의**: `.env.local`은 `.gitignore`에 포함되어 있다. 절대 커밋하지 않는다.  
> `SUPABASE_SERVICE_ROLE_KEY`·`GEMINI_API_KEY`는 **서버·적재 전용**이다. 클라이언트·웹 런타임에 노출 금지.

### 1-4. 개발 서버 실행

```bash
npm run dev
# → http://localhost:3000
# 메인 대시보드는 실 Supabase 데이터에 연결되어 있다 (§2 적재 완료 후 실데이터 표시).
```

### 1-5. 주요 명령어

```bash
npm run dev           # 개발 서버 (HMR, localhost:3000)
npm run build         # 프로덕션 빌드 (배포 전 반드시 확인)
npm run lint          # ESLint 검사
npm test              # lib/analytics 단위 테스트 (node:test + tsx)

# FRED → Supabase 데이터 적재 (§2 완료 후)
npm run ingest             # 전체 PPI 시리즈 자동 발견 + 전체 이력 적재 (수 시간)
npm run ingest:incremental # 전체 시리즈 + 증분 수집 (신규·갱신분만, 수십 분)
npm run ingest:headline    # 헤드라인 9개만 전체 재수집 + AI 한줄평 (수십 초)
npm run ingest:update      # 헤드라인 9개 증분 + AI 한줄평 (최속, 수십 초)
npm run ingest:retry       # 이전 실행에서 실패한 시리즈만 재시도
```

> 적재 모드 상세는 [§2-3](#2-3-fred-데이터-적재)을 참고한다.

---

## 2. DB 초기 설정 및 FRED 데이터 적재

### 2-1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) 로그인 → **New Project** 생성
2. **Settings > API**에서 URL과 키 확인 → `.env.local`에 입력

### 2-2. 스키마 생성 (SQL Editor)

Supabase 대시보드 → **SQL Editor**에서 아래 SQL을 순서대로 실행한다.
**원본 테이블 3개**(series·observation·consensus) + **추세 지표 뷰**(series_trend_mv) +
**AI 한줄평 테이블**(dashboard_insight) + **RPC 2개**로 구성된다.

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
COMMENT ON COLUMN series.category     IS 'headline | core | energy | food | service | goods | other';
COMMENT ON COLUMN series.seasonal_adj IS 'SA=계절조정, NSA=비계절조정';
```

#### Step 2 — `observation` 테이블 (월간 관측값)

```sql
-- FRED 원본 관측값 — 변형 없이 보존
-- MoM·YoY·Annualized 3M 등 파생 지표는 저장하지 않고 뷰/조회 시 계산
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
```

#### Step 4 — `series_trend_mv` 추세 지표 머티리얼라이즈드 뷰

각 시리즈의 **최신 10년 윈도우** 기준으로 MoM·YoY·**Annualized 3M·실질 가속도(accel3m)**·
10년 YoY 범위를 사전계산한다. 화면은 이 뷰만 읽으므로 빠르다 (조회 시 재계산 없음).

```sql
-- 핵심 산출 컬럼 (전체 정의는 supabase/migrations 참조):
--   mom         = (latest / value_{-1}  - 1) * 100
--   yoy         = (latest / value_{-12} - 1) * 100
--   ann3m       = (power(latest / value_{-3}, 4) - 1) * 100   ← Annualized 3M (3M SAAR)
--   ann3m_prev  = (power(value_{-3} / value_{-6}, 4) - 1) * 100 ← 직전 3M 연율 (가속도 보조)
--   accel3m     = ann3m - yoy                                  ← 실질 가속도 (%p)
--   yoy_min_10y / yoy_max_10y                                  ← 최근 10년 YoY 범위
CREATE MATERIALIZED VIEW series_trend_mv AS
  -- latest(시리즈별 최신값) → 1/2/3/6/12/15/18개월 전 관측값 LEFT JOIN → 위 지표 계산
  -- ... (마이그레이션 series_trend_metrics + series_trend_mv_add_ann3m_accel 참조)
  SELECT ... ;

-- CONCURRENTLY 갱신을 위한 유니크 인덱스
CREATE UNIQUE INDEX series_trend_mv_pkey ON series_trend_mv (series_id);
```

> 이 뷰는 **자동 갱신되지 않는다.** 적재 후 `refresh_series_trend_mv()` RPC로 새로고침해야
> 화면 지표·태그가 최신화된다. `npm run ingest`가 적재 종료 시 자동 호출한다.

#### Step 5 — `dashboard_insight` 테이블 (AI 한줄평 저장)

```sql
-- AI(Gemini) 한줄평 — 적재 시점 1회 생성 → 저장. 화면은 저장값만 읽는다.
CREATE TABLE IF NOT EXISTS dashboard_insight (
  ref_date     DATE PRIMARY KEY,        -- 헤드라인 기준월
  body         TEXT NOT NULL,           -- LLM 생성 한줄평 (한국어)
  model        TEXT NOT NULL,           -- 사용 모델 id (예: gemini-2.0-flash)
  metrics      JSONB,                   -- 생성에 쓴 입력 스냅샷 (재현·감사용)
  generated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE dashboard_insight IS 'AI 발표 해석 한줄평 — 적재 시점 생성, 화면은 읽기 전용';
```

#### Step 5.5 — `release_schedule` 테이블 (발표 일정 — D-day)

```sql
-- FRED release/dates(PPI release_id=46)에서 받은 발표 일정. 화면 D-day 표기용.
CREATE TABLE IF NOT EXISTS release_schedule (
  release_id   INTEGER PRIMARY KEY,     -- FRED release_id (PPI = 46)
  release_name TEXT NOT NULL,
  next_date    DATE,                    -- 오늘 이후 가장 가까운 예정 발표일
  last_date    DATE,                    -- 오늘 이전 가장 최근 발표일
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE release_schedule IS 'FRED release 발표 일정 — 적재 시점 저장, 화면 D-day용. anon 비노출';
```

#### Step 6 — RPC 함수 2개

```sql
-- (A) 추세 뷰 동시 새로고침 — 적재 종료 시 호출
CREATE OR REPLACE FUNCTION refresh_series_trend_mv()
RETURNS void LANGUAGE sql AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY series_trend_mv;
$$;

-- (B) 시리즈별 DB 최신 관측 날짜 일괄 반환 — 증분 적재(--incremental)의 시작점 계산용
CREATE OR REPLACE FUNCTION get_series_latest_dates()
RETURNS TABLE(series_id text, latest_date date)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT ON (series_id) series_id, date AS latest_date
  FROM observation
  ORDER BY series_id, date DESC;
$$;
```

#### Step 7 — Row Level Security (권장)

```sql
-- 공개 읽기 허용 (anon 키로 조회 가능). 쓰기는 service_role 키만 (ingest 전용)
ALTER TABLE series      ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_series"      ON series      FOR SELECT USING (true);
CREATE POLICY "anon_read_observation" ON observation FOR SELECT USING (true);
CREATE POLICY "anon_read_consensus"   ON consensus   FOR SELECT USING (true);
```

#### Step 8 — 신규 객체 anon 권한 잠금 (⚠️ 필수)

> **반드시 실행한다.** Supabase는 `public` 스키마의 새 테이블·함수·머티리얼라이즈드 뷰에
> `anon`/`authenticated` 권한을 **기본 부여**한다. 배포 시 anon 키는 클라이언트 번들에서
> 누구나 추출 가능하므로, Step 4~6에서 만든 `dashboard_insight`·RPC·뷰를 잠그지 않으면
> 금전·데이터 피해 경로가 열린다 (예: `refresh_series_trend_mv()` 무제한 호출 → 컴퓨트 과금 폭증,
> `dashboard_insight` anon DELETE/TRUNCATE → 데이터 파괴).
>
> 이 앱의 화면은 **전부 `SUPABASE_SERVICE_ROLE_KEY`(서버)로 DB를 읽으므로** anon 권한을
> 회수해도 동작에 영향이 없다. anon 권한은 순수 공격 표면일 뿐이다.

```sql
-- (1) dashboard_insight: RLS 활성화 + 공개 읽기만, 쓰기는 service_role 전용
ALTER TABLE dashboard_insight ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON dashboard_insight FROM anon, authenticated;
CREATE POLICY "anon_read_dashboard_insight" ON dashboard_insight FOR SELECT USING (true);

-- (2) RPC anon/authenticated 실행 차단 (적재는 service_role로 호출 → 영향 없음)
REVOKE EXECUTE ON FUNCTION refresh_series_trend_mv()  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION get_series_latest_dates()  FROM anon, authenticated, public;

-- (3) SECURITY DEFINER 함수 search_path 고정 (injection 방지)
ALTER FUNCTION refresh_series_trend_mv() SET search_path = public, pg_temp;
ALTER FUNCTION get_series_latest_dates() SET search_path = public, pg_temp;

-- (4) 머티리얼라이즈드 뷰 API 직접 노출 차단 (화면은 service_role로 읽음)
REVOKE SELECT ON series_trend_mv FROM anon, authenticated;

-- (5) release_schedule: RLS 활성 + anon/authenticated 권한 회수 (화면은 service_role로 읽음)
ALTER TABLE release_schedule ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON release_schedule FROM anon, authenticated;
```

> 적용 후 Supabase 대시보드의 **Advisors > Security**(또는 데이터베이스 린터)에서
> 경고가 0건인지 확인한다. 새 테이블·함수를 추가할 때마다 이 단계를 반복한다.

> 전체 마이그레이션 SQL은 Supabase 프로젝트의 마이그레이션 이력
> (`series_trend_metrics_function`, `series_trend_materialized_view`,
> `series_trend_mv_add_ann3m_accel`, `create_dashboard_insight`,
> `create_get_series_latest_dates_rpc`, `lock_down_public_anon_access`)에 보존되어 있다.

### 2-3. FRED 데이터 적재

적재 스크립트(`scripts/ingest.ts`)는 5가지 모드를 제공한다.

| 명령 | 범위 | 수집 방식 | 소요 | 용도 |
|------|------|-----------|------|------|
| `npm run ingest` | 전체 (~8,100개) | 전체 이력 | 수 시간 | 최초 적재 |
| `npm run ingest:incremental` | 전체 (~8,100개) | 증분 (신규·갱신분) | 수십 분 | 정기 전체 갱신 |
| `npm run ingest:headline` | 헤드라인 9개 | 전체 이력 | 수십 초 | 한줄평 재생성 |
| `npm run ingest:update` | 헤드라인 9개 | 증분 | 수십 초 | **월간 최속 갱신** |
| `npm run ingest:retry` | 이전 실패분 | 전체 이력 | 가변 | 실패 복구 |
| `npm run ingest:consensus` | 컨센서스 | `data/consensus.seed.json` upsert | 즉시 | 시장 예상치 입력 (§2-4) |

**공통 동작 (적재 종료 후 자동 실행 — consensus 제외)**:
1. `series_trend_mv` 새로고침 → 화면 지표·태그 최신화
2. **다음 PPI 발표일**(FRED release/dates, release_id=46) → `release_schedule` 저장 (화면 D-day)
3. `GEMINI_API_KEY`가 있으면 헤드라인 지표로 **AI 한줄평 1건 생성 → `dashboard_insight` 저장**
   (키 없거나 실패해도 적재 자체는 성공 — 경고만 출력)

#### 전체 적재 (처음 실행)

```bash
npm run ingest
```

```
1. 시리즈 자동 발견 (PPI 카테고리 트리 재귀 탐색)
   └─ FRED /category/series + /category/children 를 루트(category_id=31)부터 DFS 순회
       → 각 카테고리의 직속 Monthly 시리즈를 누적, 하위 카테고리로 계속 하강
       → visited 집합으로 순환/중복 방지, 약 8,100여 개 시리즈 발견
       → 헤드라인 9개 시드를 항상 union (트리에서 누락돼도 대시보드 지표 보장)

2. 순차 적재 (FRED 레이트 제한 보호 — 병렬 처리 금지)
   [   1/8123] PPIACO 적재 중... → 1360건 완료
   [   2/8123] PPIFIS 적재 중... → 198건 완료
   ...

3. 추세 뷰 새로고침 → AI 한줄평 생성·저장 → 완료 요약
   [갱신] series_trend_mv 새로고침 완료
   [한줄평] 생성·저장 완료
     └ "헤드라인 PPI의 3개월 연율이 ... 식품 부문이 가속을 주도했다."
```

#### 증분 적재 (정기 갱신)

```bash
npm run ingest:incremental   # 전체 시리즈, 신규·갱신분만
npm run ingest:update        # 헤드라인 9개만, 최속
```

- 각 시리즈의 **DB 최신 날짜**를 `get_series_latest_dates()` RPC로 일괄 조회
- FRED `observation_start`를 **최신 날짜 −3개월**로 설정해 요청
  (PPI는 발표 후 과거치가 개정되므로 3개월 버퍼로 리비전을 함께 반영)
- DB에 없는 신규 시리즈는 전체 이력을 받아온다
- upsert이므로 멱등 — 안전하게 반복 실행 가능

> **AI 한줄평만 빠르게 다시 생성**하려면 `npm run ingest:update`가 가장 실용적이다.

#### 실패 시리즈 재시도

```bash
npm run ingest:retry
# → failed-series.json의 시리즈 목록만 재시도
# → 모두 성공하면 failed-series.json 자동 삭제
```

### 2-4. 컨센서스(예상치) 수동 입력

컨센서스는 FRED에 없으므로 매월 발표 전 Bloomberg·Reuters 등에서 확인 후 입력한다.
권장 경로는 **시드 파일 편집 + 스크립트 upsert**다 (출처를 반드시 정확히 적는다 — 화면에 그대로 노출됨):

```bash
# 1) data/consensus.seed.json 편집 — series_id·date·consensus_yoy·source(필수)·note
# 2) upsert 실행 (멱등)
npm run ingest:consensus
```

`data/consensus.seed.json` 예시 (1건):

```json
{ "series_id": "PPIFIS", "date": "2026-05-01", "consensus_yoy": 2.3, "source": "Bloomberg", "note": "5월 발표 사전 컨센서스" }
```

> 직접 SQL `INSERT ... ON CONFLICT (series_id, date) DO UPDATE` 로 넣어도 된다.
> 서프라이즈 = 실측 YoY − 컨센서스 YoY 이며, **기준월(시리즈 최신 관측월)과 `date`가 일치할 때만** 계산된다.
> 컨센서스 값이 없거나 월이 어긋나면 서프라이즈 칸은 `—`로 표기되고, 있을 때는 `source`가 함께 노출된다.
> 시드의 기본값은 `source: "Demo"` 샘플이므로 실제 컨센서스로 교체할 것.

### 2-5. 월간 유지보수 체크리스트

매월 PPI 발표일(보통 매월 둘째 주 수요일) 이후:

- [ ] `npm run ingest:update` 실행 → 헤드라인 최신값 갱신 + AI 한줄평 재생성 (최속)
- [ ] 또는 `npm run ingest:incremental` → 전체 시리즈 증분 갱신
- [ ] 컨센서스 다음 달치 입력 (§2-4 SQL)
- [ ] 메인 대시보드 KPI·한줄평, `/series` Top Movers 육안 확인

---

## 3. 메인 대시보드

루트(`/`)에서 표시되는 메인 화면. **Server Component가 `fetchDashboard()`로 실 Supabase 데이터를
사전계산**해 `DashboardView`에 전달한다 (ISR `revalidate=3600` — 1시간 캐시).

### 3-1. AI 한줄평 배너

상단에 `dashboard_insight`의 최신 한줄평을 표시한다. 발표 데이터를 Annualized 3M·실질 가속도
중심으로 해석한 한국어 한 문장 + `모델 · 기준월 · 생성시각` 캡션. 값이 없으면 안내 문구를 보여준다.

> 적재 시점에만 생성·저장하므로 **페이지 로드 시 외부 LLM 호출이 없다** (빠름·정확 원칙).

### 3-2. 헤드라인 8종 KPI (주값 = Annualized 3M)

시장에서 실제로 보는 8개 헤드라인 지표. SSoT는 [`lib/config/headline.ts`](lib/config/headline.ts).

| 표시명 | series_id | basis | 내용 |
|--------|-----------|-------|------|
| 헤드라인 PPI | `PPIACO` | NSA | All Commodities |
| 코어 PPI(FD) | `PPIFIS` | SA | Final Demand (진짜 근원 `PPIFES`는 한줄평 비교용) |
| 최종수요 재화 | `PPIFDG` | NSA | Final Demand Goods |
| 최종수요 서비스 | `PPIFDS` | NSA | Final Demand Services |
| 에너지 | `WPSFD4121` | SA | Finished Consumer Energy Goods |
| 식품(농산물) | `WPU01` | NSA | Farm Products |
| 운송(트럭) | `PCU484484` | NSA | Truck Transportation |
| 건설 | `PCU236400236400` | NSA | New Nonresidential Building Construction |

각 카드: **주값 = Annualized 3M(%)**, 델타 = 실질 가속도(`accel3m`, ▲/▼ 글리프),
컨센서스가 있으면 **서프라이즈 배지**(`서프 ▲/▼ ±N%p · vs 컨센 X% · 출처`),
하단 = `series_id · YoY · MoM`. NSA 계열은 **계절성 주의** 캡션을 단다.

> **정확성 주의**: Annualized 3M은 SA 계열에서 의미가 명확하다. NSA 계열은 계절성이 연율에 증폭되어
> 큰 값이 나올 수 있으므로 카드에 SA/NSA를 표기하고 NSA에는 주의 캡션을 단다.

### 3-3. 추세 라인 차트

헤드라인 9개 중 선택 + 모드 토글(**3M연율 / MoM / YoY**) + 기간(1Y/3Y/5Y/전체).
`3M연율` 모드는 관측값에서 롤링 3M SAAR을 계산해 그린다. NSA 계열 3M연율 선택 시 계절성 주석 표기.

### 3-4. 부문별 Annualized 3M 랭킹

8개 헤드라인을 `ann3m` 내림차순 수평 막대로 표시. 양수(상승 모멘텀, warm)·음수(하락 모멘텀, cool).
서로 다른 지수를 모멘텀 기준으로 줄 세운 **랭킹**이며(분해 아님), 정직하게 산출 가능한 부문별 모멘텀이다.

### 3-5. 헤드라인 변동률 히트맵

8개 헤드라인 × 최근 8개월 MoM. 셀 색상 강도로 상승·하락 강도를 표현한다 (실데이터).

### 3-6. 부문 기여도 분해 (Final Demand)

정확히 분할되는 **최종수요 = 재화(`PPIFDG`) + 서비스(`PPIFDS`)** 만 BLS 상대중요도로 가중해
MoM 기여도(`기여도 = 상대중요도 × MoM`, %p)를 좌우 발산 막대로 보여준다.
가중치 SSoT는 [`lib/config/weights.ts`](lib/config/weights.ts)이며, 화면에 **"BLS 상대중요도 N년 기준(근사)"** 캡션을 단다.
계열 일치를 위해 둘 다 NSA만 사용하고(SA/NSA 혼합 금지), 건설(~2%)은 제외해 "재화·서비스(FD의 약 98%)"로 표기한다.

### 3-7. 다음 발표 D-day

헤더에 **다음 PPI 발표일과 D-day**를 표기한다. 적재 시점에 FRED `release/dates`(release_id=46)에서 받아
`release_schedule`에 저장한 값을 화면이 읽는다(런타임 FRED 호출 금지). 예정일이 없으면 표기를 생략한다.

---

## 4. 시리즈 탐색 기능

메인 대시보드 헤더의 **"시리즈 탐색"** 버튼 또는 직접 `/series`로 이동한다.

### 4-1. Top Movers (상단 4개 테이블)

DB 적재 전체 시리즈 대상 최근 MoM·YoY 상위·하위 5종. 글리프(▲/▼/—)+색상 동시 표시(색맹 접근성).

### 4-2. 검색 · 태그 필터

- **검색창**: 시리즈 ID 또는 이름으로 즉시 필터링 (예: `PPIFIS`, `Final Demand`)
- **특징 필터**: 추세 태그(상승가속·하락둔화·추세반전·10년최고 등)로 다중 선택(OR) 필터

### 4-3. 시리즈 목록 (20개씩 페이지네이션)

- **전체 기준 정렬**: 컬럼 헤더 클릭 시 전체 시리즈 정렬 후 페이지 적용
  - `Series ID` / `이름` / `카테고리`: 텍스트 정렬
  - `MoM` / `YoY` / **`3M(연율)`**: 수치 정렬 (null 값은 항상 마지막)
- **같은 컬럼 재클릭**: 오름차순 ↔ 내림차순 토글
- **행 클릭**: 오른쪽 상세 패널 표시 (재클릭 시 닫힘)

### 4-4. 상세 차트 패널

시리즈 클릭 시 오른쪽 패널에 추세 요약 + 차트 표시:

- **트렌드 요약 5칸**: 최신 YoY · **Annualized 3M** · **실질가속도(3M−YoY)** · 가속도 ΔYoY · 10년 YoY 범위
- **컨트롤**: 기간(6M/1Y/3Y/5Y/전체) · 지표(MoM/YoY)
- 순수 SVG LineChart, 호버 크로스헤어, 방향별 면적 채움 색상

---

## 5. 지표 정의 및 활용 가이드

### 5-1. PPI란 무엇인가

**생산자물가지수(Producer Price Index, PPI)**는 국내 생산자가 판매하는 재화·서비스의 평균 가격 변동을 측정하는 지수다.

- **CPI와의 차이**: CPI는 소비자가 *사는* 가격, PPI는 생산자가 *파는* 가격.
  PPI는 소비자 물가에 1~3개월 선행하는 경향이 있어 **인플레이션 선행지표**로 활용된다.
- **발표**: 미국 노동통계국(BLS)이 매월 발표. 전월 데이터를 다음 달 둘째 주에 공표.
- **원천 데이터**: [FRED](https://fred.stlouisfed.org/)를 통해 BLS 공식 데이터 수집.

### 5-2. 주요 지표 정의

#### MoM — 전월비 (Month-over-Month)

```
MoM(t) = (Index(t) / Index(t-1) - 1) × 100  [%]
```

이번 달 지수가 전달 대비 몇 % 변했는가. 단기 변동성이 크다.

#### YoY — 전년동월비 (Year-over-Year)

```
YoY(t) = (Index(t) / Index(t-12) - 1) × 100  [%]
```

1년 전 같은 달 대비 변동률. 단기 노이즈를 흡수해 기조적 인플레이션 수준 확인에 적합.
**베이스 이펙트(Base Effect)** 주의.

#### Annualized 3M — 3개월 연율 (3M SAAR) ★ 대시보드 주지표

```
Annualized 3M(t) = (power(Index(t) / Index(t-3), 4) - 1) × 100  [%]
```

- **의미**: 최근 3개월 모멘텀을 연율로 환산. "지금 속도가 1년 지속되면?"을 보여준다.
- **중요성**: 시장이 가장 주목하는 단기 모멘텀 지표. YoY보다 전환점에 민감하게 반응한다.
- **주의**: **SA(계절조정) 계열에서 의미가 명확**하다. NSA 계열은 계절성이 연율에 증폭되므로
  대시보드에서 SA/NSA를 표기하고 NSA에는 계절성 주의 캡션을 단다.

#### 실질 가속도 (accel3m) ★ 모멘텀 전환 포착

```
accel3m(t) = Annualized 3M(t) − YoY(t)  [%p]
```

- **의미**: 단기 모멘텀(3M 연율)이 12개월 추세(YoY)를 **추월(+)·하회(−)하는 폭**.
  "3M이 12M보다 뜨겁다 → 물가가 가속 중"이라는 시장 표준 해석.
- **특징**: 기존 ΔYoY(`yoy − yoy3m`) 태그보다 전환점에 **선행·민감**(검증 완료).
  태그 분류는 회귀 안전을 위해 ΔYoY를 유지하고, UI·AI 한줄평은 실질 가속도를 주지표로 사용한다.

#### 서프라이즈 · 코어 PPI

```
Surprise = 실측 YoY − 컨센서스 YoY  [%p]   (기준월과 컨센서스 date 일치 시에만 표시, 없으면 —)
```

- KPI 카드에 서프라이즈 배지(`서프 ▲/▼ ±N%p`)와 `vs 컨센 X% · 출처`를 함께 표기한다. YoY 추이 차트에는 최신 월에 컨센서스 마커가 찍힌다.
- **+서프라이즈**: 예상보다 물가 상승 → 금리 인상 압력. **−서프라이즈**: 물가 둔화 → 인하 기대.
- **코어 PPI(`PPIFES`)**: 식품·에너지 제외. 공급 충격 변동성을 걷어내 **구조적 인플레이션 압력**을 본다.
  AI 한줄평에서 헤드라인↔코어 비교에 사용한다.

### 5-3. 색상 규칙 (아시아 시장 관행)

이 대시보드는 **아시아 시장 관행**을 따른다. 미국식 green/red와 반대임에 주의.

| 방향 | 색상 | 글리프 | 의미 |
|------|------|--------|------|
| 상승 (Rising) | 따뜻한 코럴 `--up` | ▲ | 물가 상승 / 컨센서스 상회 |
| 하락 (Falling) | 차분한 스틸 블루 `--down` | ▼ | 물가 하락 / 컨센서스 하회 |
| 보합 (Flat) | 뮤트 그레이 `--flat` | — | 변동 없음 |

색맹 접근성을 위해 색상과 글리프(▲/▼/—)를 항상 함께 표기한다. 색은 `app/globals.css`의 CSS 변수만 사용.

### 5-4. 대시보드 활용 시나리오

| 사용자 | 시나리오 | 보는 지표 |
|--------|----------|-----------|
| 투자자 | PPI 발표 당일 시장 영향 판단 | 헤드라인 Annualized 3M + 실질 가속도 + AI 한줄평 |
| 애널리스트 | 인플레이션 추세 방향성 보고서 | YoY 추이 차트, 코어 vs 헤드라인, 부문 랭킹 |
| 기업 CFO | 원재료 가격 동향, 원가 전략 | 부문별 Annualized 3M 랭킹, 카테고리 히트맵 |
| 이코노미스트 | 연준 통화정책 경로 예측 | 코어 PPI YoY 장기 추이, 실질 가속도 전환 |

---

## 6. 프로젝트 구조

```
PPI_inspire_dashboard/
├─ app/
│  ├─ globals.css          # 디자인 토큰 전체 + 컴포넌트 CSS (.nw-*)
│  ├─ layout.tsx           # 루트 레이아웃 (메타데이터, 폰트)
│  ├─ page.tsx             # 메인 대시보드 Server Component — fetchDashboard() → DashboardView
│  ├─ series/
│  │  ├─ page.tsx          # 시리즈 탐색 페이지 (Server Component — Supabase 직접 조회)
│  │  └─ SeriesExplorer.tsx # 인터랙션 Client Component (검색·태그·정렬·상세 패널)
│  └─ api/
│     ├─ dashboard/route.ts                # GET /api/dashboard — 헤드라인·랭킹·히트맵·한줄평 (revalidate 3600)
│     └─ series/
│        ├─ route.ts                       # GET /api/series — 전체 시리즈+통계+movers
│        └─ [id]/observations/route.ts     # GET /api/series/{id}/observations
├─ components/
│  ├─ charts/
│  │  ├─ LineChart.tsx          # 순수 SVG 추이 차트 (ChartPoint 타입 export)
│  │  ├─ ContributionBars.tsx   # 발산형 수평 막대
│  │  └─ Heatmap.tsx            # 카테고리 × 월 히트맵
│  ├─ dashboard/
│  │  ├─ DashboardView.tsx      # 메인 대시보드 클라이언트 로직 (KPI·차트·히트맵 인터랙션)
│  │  ├─ SectorAnn3mBars.tsx    # 부문별 Annualized 3M 랭킹 수평 막대
│  │  └─ InsightBanner.tsx      # AI 한줄평 배너
│  ├─ series/
│  │  ├─ TopMoversTable.tsx     # MoM·YoY 상위/하위 5 미니 테이블
│  │  ├─ SeriesTable.tsx        # 전체 기준 정렬 + 페이지네이션 (3M연율 컬럼 포함)
│  │  └─ SeriesDetailPanel.tsx  # 상세 차트 패널 (Annualized 3M·실질가속도 표시)
│  ├─ Card.tsx · KpiCard.tsx · controls.tsx
├─ lib/
│  ├─ config/headline.ts # 헤드라인 8종 SSoT (KPI·랭킹·히트맵·한줄평·ingest 시드 공유)
│  ├─ queries/
│  │  ├─ series.ts       # 시리즈 목록+통계+movers 쿼리 (ann3m/accel3m 포함)
│  │  └─ dashboard.ts    # fetchDashboard — 헤드라인·랭킹·히트맵·한줄평 사전계산
│  ├─ insight/generate.ts # Google AI Studio(Gemini) 한줄평 생성 (서버·적재 전용)
│  ├─ data/dummy.ts      # 합성 PPI 더미 데이터 (dev fallback)
│  ├─ supabase/          # DB 클라이언트(client.ts, server.ts) + 타입(types.ts)
│  ├─ fred/client.ts     # FRED API 클라이언트 (적재 전용, observation_start 증분 지원)
│  ├─ analytics/         # 순수 함수: calcMoM·calcYoY·calcAnnualized3M·calcAccel3M 등 (+ 단위 테스트)
│  └─ types.ts           # 프론트↔백 API 계약 (SSoT)
├─ public/
│  ├─ fonts/             # BookkMyungjo (TTF), PretendardVariable (WOFF2) 자체 호스팅
│  └─ assets/            # ppi-mark.png, mightmacro-lockup.png 등 브랜드 에셋
├─ scripts/
│  └─ ingest.ts          # FRED → Supabase 적재 (발견·증분·헤드라인·retry + 뷰갱신 + AI 한줄평)
├─ docs/
│  ├─ PRD_v2.0.md        # 제품 요구사항 문서
│  └─ DESIGN_SYSTEM.md   # 디자인 토큰·컴포넌트·차트 레퍼런스 전체
├─ .env.local.example    # 환경변수 템플릿
└─ CLAUDE.md             # AI 협업 기준 문서 (프로젝트 컨벤션 전체)
```

---

## 7. 다음 단계 (Roadmap)

| 단계 | 상태 | 내용 | 선행 조건 |
|------|------|------|-----------|
| **M1** | ✅ 완료 | Next.js 15 스캐폴딩, 타입 계약, 폴더 구조 | — |
| **M1.5** | ✅ 완료 | might Macro 디자인 시스템 — 토큰, 컴포넌트, 순수 SVG 차트 | M1 |
| **M2** | ✅ 완료 | Supabase 테이블 + FRED 전체 시리즈(8,000+) 실데이터 적재 | §2 환경변수 |
| **M2.5** | ✅ 완료 | 시리즈 탐색 페이지(`/series`) + 검색·태그 + 자동 발견 ingest | M2 |
| **M3** | 🟡 진행 | `lib/analytics/` 단위 테스트 (MoM·YoY·Annualized 3M·실질가속도, 19개 통과) | M2 |
| **M4** | 🟡 진행 | 메인 대시보드 실 DB 연결 + 8종 KPI·Annualized 3M·AI 한줄평 | M2 |
| **M5** | ⏳ 대기 | Vercel 배포 + 환경변수 설정 (GEMINI_API_KEY 포함) | M4 |
| **M6** | ⏳ 대기 | 컨센서스 수동 입력 UI | M4 |

---

*출처: FRED (Federal Reserve Bank of St. Louis) · might Macro 내부 DB 적재*  
*AI 한줄평: Google AI Studio (Gemini) — 적재 시점 생성, 화면은 읽기 전용*  
*방향 색상 규칙: 상승 ▲ 따뜻한 색 · 하락 ▼ 차분한 색 (아시아 시장 관행)*
