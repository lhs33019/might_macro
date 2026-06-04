# PPI Insight — Design System Reference

> **출처**: might Macro / NEWISE 디자인 시스템.  
> Claude Design 핸드오프 번들(`ppi-insight-design-system`)을 Next.js 15로 구현한 결과물.  
> **디자인 작업 시 이 문서를 먼저 읽는다. 모든 값은 확정이며 임의 변경 금지.**

---

## 0. 디자인 사용 규칙 (5줄 요약)

> 작업 전 반드시 확인. 아래 5개 규칙은 디자인 일관성의 최소 기준이다.

1. **색상은 CSS 변수만.** `#hex` 하드코딩 금지 — `--up`, `--down`, `--accent`, `--surface-*` 등 `app/globals.css`의 `--*` 변수를 그대로 사용한다.
2. **방향은 색+글리프 이중 표현.** 상승/하락을 색상만으로 표현하지 않는다 — 반드시 `▲/▼/—` 글리프를 함께 쓴다 (색맹 접근성).
3. **숫자는 tabular figures 필수.** 모든 숫자 요소에 `font-family: var(--num)`과 `font-feature-settings: "tnum" 1`을 적용해 열 정렬을 보장한다.
4. **새 컴포넌트는 globals.css 먼저.** `.nw-` prefix CSS 클래스를 `app/globals.css`에 정의한 뒤 TSX에서 참조한다. 인라인 스타일은 레이아웃 조정용으로만 제한 사용.
5. **차트는 순수 SVG, 외부 라이브러리 금지.** `LineChart/ContributionBars/Heatmap` 패턴을 유지하고, 방향색(`--up-line`/`--down-line`)을 면적 그라데이션에 반영한다.

---

## 1. 브랜드 & 아이덴티티

### 제품 이름
- **PPI Insight** — might Macro의 PPI 분석 대시보드 제품명
- **might Macro** — 운영사 (부모 브랜드, 푸터·크레딧용으로만 사용)

### 브랜드 에셋 (`public/assets/`)

| 파일 | 용도 | 배경 |
|------|------|------|
| `ppi-mark.png` | 앱 헤더 아이콘, 파비콘, 아바타 | 다크 배경 전용 |
| `ppi-logo.png` | 제품 로고 풀 버전 (바 차트 + 화살표 + FRED 실린더, blue→violet 그라데이션) | 다크 배경 전용 |
| `mightmacro-mark.png` | 회사 모노그램 (브러시드 실버 M) | 다크 배경 전용, 재색상 금지 |
| `mightmacro-logo.png` | 회사 워드마크 풀 버전 | 다크 배경 전용 |
| `mightmacro-lockup.png` | 푸터용 락업 | opacity 0.82 사용 |

**규칙**:
- PPI 로고의 blue→violet 그라데이션은 UI 테마 컬러로 흡수하지 않는다. 로고는 브랜드 서명.
- might Macro 로고의 실버는 절대 재색상(recolor) 금지.
- 두 브랜드를 나란히 배치하지 않는다. PPI 마크가 헤더 주인공, might Macro는 푸터 귀속 표기.

---

## 2. 색상 토큰

모든 색상은 `app/globals.css`의 `:root` 변수로 정의. 이 파일이 SSoT.

### 배경 계층 (Surfaces)

```css
--bg-0:       #070A11   /* 페이지 void, letterbox 뒤 */
--bg-1:       #0B0F18   /* 앱 배경 (body background) */
--surface-1:  #111726   /* 카드, 패널 */
--surface-2:  #18203180 /* hover / inset (반투명) */
--surface-2s: #182031   /* surface-2 불투명 버전 (스켈레톤용) */
--surface-3:  #1F2939   /* 팝오버, 툴팁, 액티브 로우 */
```

**body 배경**: 단순 flat 아님 — 상단에 골드 vignette 그라데이션 겹침:
```css
body {
  background: radial-gradient(120% 80% at 50% -10%, rgba(200,169,106,0.05), transparent 60%),
              var(--bg-1);
}
```

### 테두리 / 구분선

```css
--border-subtle:  rgba(233,238,248,0.06)  /* 카드 테두리 (기본) */
--border-default: rgba(233,238,248,0.10)  /* 컨트롤 테두리 */
--border-strong:  rgba(233,238,248,0.18)  /* hover 시 강조 */
--border-focus:   rgba(200,169,106,0.55)  /* 골드 포커스 링 */
```

### 텍스트 계층

```css
--text-hi:       #F2F5FB   /* 헤드라인, 주요 숫자 */
--text-mid:      #A6B0C2   /* 본문, 레이블 */
--text-lo:       #6B7588   /* 캡션, 축 텍스트, 흐린 레이블 */
--text-disabled: #404a5c   /* 비활성 */
```

### 브랜드 액센트 — 샴페인 골드 (크롬 전용)

```css
--accent:       #C8A96A   /* 기본 (활성 필터, 포커스 링) */
--accent-hover: #D8BD83   /* hover */
--accent-press: #B7965A   /* press */
--accent-soft:  rgba(200,169,106,0.14)  /* 액티브 배경 fill */
--accent-line:  rgba(200,169,106,0.40)  /* 테두리 강조 */
--on-accent:    #1A1406   /* 골드 fill 위 텍스트 */
--glow-accent:  0 0 0 1px var(--border-focus), 0 4px 18px rgba(200,169,106,0.18)
```

> ⚠️ **골드 액센트는 크롬(UI 구조 요소)에만.** 데이터 방향색(상승/하락)과 절대 혼용 금지.

### 방향 색상 — 데이터 의미 (아시아 시장 관행)

> **미국식 green/red가 아니다.** 상승=따뜻한 색, 하락=차분한 색.

```css
/* 상승 (Rising) — 따뜻한 코럴 */
--up:        #F4715E
--up-strong: #FF8473
--up-soft:   rgba(244,113,94,0.15)   /* 배경 틴트 */
--up-line:   rgba(244,113,94,0.45)   /* 차트 면적 그라데이션 */

/* 하락 (Falling) — 차분한 스틸 블루 */
--down:        #54A6D6
--down-strong: #71BCE8
--down-soft:   rgba(84,166,214,0.15)
--down-line:   rgba(84,166,214,0.45)

/* 보합 (Flat) */
--flat:      #8A94A8
--flat-soft: rgba(138,148,168,0.14)
```

방향 적용 CSS 헬퍼:
```css
.is-up   { color: var(--up); }
.is-down { color: var(--down); }
.is-flat { color: var(--flat); }
```

### 데이터 시각화 — 카테고리 팔레트

품목별 기여도 차트, 히트맵 보조 범례에 사용. 뮤트된 에디토리얼 주얼 톤.

```css
--cat-food:      #E0A95E   /* 식품 */
--cat-energy:    #D17B53   /* 에너지 */
--cat-goods:     #6E92C4   /* 재화 */
--cat-services:  #9B86C4   /* 서비스 */
--cat-trade:     #5FB6A6   /* 무역서비스 */
--cat-transport: #C98AA8   /* 운송 */
```

### 차트 크롬

```css
--grid-line: rgba(233,238,248,0.055)  /* y축 격자선 */
--axis-text: #66728A                  /* 축 레이블 */
```

---

## 3. 타이포그래피

### 폰트 패밀리

```css
--font-display: 'BookkMyungjo', 'Bodoni Moda', Georgia, serif
  /* 브랜드·표시용. 한국어 명조 세리프. 영문 fallback: Bodoni Moda (Google Fonts CDN) */

--font-sans: 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', ...
  /* 기능 텍스트 전체. 한·영 혼용에 최적. */

--font-mono: 'SFMono-Regular', ui-monospace, 'Menlo', monospace
  /* 축 레이블, 날짜 포맷 등 등폭 필요 구간. */

--num: 'Pretendard Variable', var(--font-sans)
  /* 숫자 전용 alias. 반드시 --feat-tnum과 함께 사용. */

--feat-tnum: "tnum" 1, "ss01" 1
  /* Tabular figures — 숫자 열 정렬 필수. */
```

**자체 호스팅 파일** (`public/fonts/`):
- `BookkMyungjo_Light.ttf` — weight 300–400
- `BookkMyungjo_Bold.ttf` — weight 500–800
- `PretendardVariable.woff2` — weight 45–920 (variable)

### 타입 역할 클래스 (Type Role Classes)

```css
/* 표시·브랜드 */
.t-display      { font: 500 clamp(40px,5vw,68px)/1.02 var(--font-display); letter-spacing: -0.01em; }
.t-serif-title  { font: 500 24px/1.15 var(--font-display); }

/* 헤딩 */
.t-h1   { font: 600 32px/1.18 var(--font-sans); letter-spacing: -0.02em; }
.t-h2   { font: 600 24px/1.22 var(--font-sans); letter-spacing: -0.015em; }
.t-h3   { font: 600 19px/1.28 var(--font-sans); letter-spacing: -0.01em; }
.t-title{ font: 600 16px/1.35 var(--font-sans); letter-spacing: -0.005em; }

/* 본문 */
.t-body    { font: 400 15px/1.55 var(--font-sans); color: var(--text-mid); }
.t-body-sm { font: 400 13px/1.50 var(--font-sans); color: var(--text-mid); }
.t-caption { font: 400 12px/1.40 var(--font-sans); color: var(--text-lo); }

/* 마이크로 레이블 — 섹션 헤더, 필터 그룹, 축 그룹 */
.t-label {
  font: 600 11px/1.2 var(--font-sans);
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--text-lo);
}

/* 데이터 숫자 — tabular figures 필수 */
.t-data-xl { font: 600 40px/1.00 var(--num); letter-spacing: -0.02em; font-feature-settings: var(--feat-tnum); }
.t-data-lg { font: 600 26px/1.05 var(--num); letter-spacing: -0.015em; font-feature-settings: var(--feat-tnum); }
.t-data    { font: 500 15px/1   var(--num); font-feature-settings: var(--feat-tnum); }
.t-mono    { font: 500 12px/1.4 var(--font-mono); }
```

---

## 4. 간격·반경·그림자 토큰

### 간격 (Spacing) — 4px 기준

```css
--sp-1: 4px   --sp-2: 8px   --sp-3: 12px  --sp-4: 16px
--sp-5: 20px  --sp-6: 24px  --sp-8: 32px  --sp-10: 40px
--sp-12: 48px --sp-16: 64px --sp-20: 80px
```

### 반경 (Border Radius)

```css
--r-xs:   4px    /* 태그, 소형 컨트롤 */
--r-sm:   8px    /* 버튼, 소형 입력 */
--r-md:   12px   /* 인풋, 칩 */
--r-lg:   16px   /* 카드 (기본) */
--r-xl:   20px   /* 대형 카드 */
--r-pill: 999px  /* 필터·토글 pills */
```

### 그림자 (Elevation)

```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.40)          /* 카드 기본 (border로 대체 가능) */
--shadow-md: 0 6px 20px rgba(0,0,0,0.45)          /* 팝오버, 드롭다운 */
--shadow-lg: 0 16px 48px rgba(0,0,0,0.55)         /* 툴팁 */
--glow-accent: 0 0 0 1px var(--border-focus),
               0 4px 18px rgba(200,169,106,0.18)  /* 액티브 필터 골드 글로우 */
```

**규칙**: 정적 카드는 border만 사용, shadow는 띄워진 레이어(팝오버·툴팁)에만 적용.

---

## 5. 컴포넌트 인벤토리

### 5-1. 레이아웃 컴포넌트

#### `.nw-app` — 페이지 래퍼
```css
max-width: 1280px;
margin: 0 auto;
padding: 14px clamp(16px, 4vw, 40px) 48px;
```

#### `.nw-kpi-row` — KPI 카드 그리드
```css
display: grid;
grid-template-columns: repeat(4, 1fr);  /* 4열 기본 */
gap: 16px;

@media (max-width: 1100px) { grid-template-columns: repeat(2, 1fr); }  /* 2열 */
@media (max-width: 560px)  { grid-template-columns: 1fr; }             /* 1열 */
```

#### `.nw-grid` — 메인 콘텐츠 그리드
```css
display: grid;
grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr);  /* 차트 : 기여도 = 1.65 : 1 */
gap: 16px;

@media (max-width: 880px) { grid-template-columns: 1fr; }  /* 단일 열 */
```

히트맵은 `grid-column: 1 / 3` (전체 폭 스팬).

---

### 5-2. KPI 카드 (`components/KpiCard.tsx`)

```tsx
// Props
interface KpiCardProps {
  label: string        // 상단 레이블 (t-label)
  sub?: string         // 우측 보조 레이블 (t-caption)
  value: string        // 주요 수치 (t-data-xl)
  unit?: string        // 단위 (값 오른쪽, 흐린 색)
  dir: 'up'|'down'|'flat'     // 카드 상단 룰 색상
  deltaDir?: 'up'|'down'|'flat'  // 전월 대비 방향
  deltaLabel?: string  // 전월 대비 텍스트 (예: "+0.1%p")
  foot?: string        // 하단 메타 (t-caption)
  loading?: boolean    // true = 스켈레톤 표시
}
```

**CSS 핵심 (`--rule` 변수)**:
```css
.nw-kpi {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  padding: 18px 18px 16px;
  position: relative; overflow: hidden;
}
.nw-kpi::before {  /* 상단 방향색 룰 3px */
  content: ""; position: absolute; inset: 0 0 auto 0;
  height: 3px; background: var(--rule, var(--border-default));
}
```

방향 룰 적용: `style={{ '--rule': 'var(--up)' }}` — `dir` prop이 결정.

**`InfoCard`** (`발표일 카드`): `--rule: var(--accent-line)`, `t-data-lg` 크기.

---

### 5-3. Segmented 필터 (`components/controls.tsx`)

기간 선택 (6M / 1Y / 3Y / 5Y / 전체).

```css
.nw-seg { display: inline-flex; background: var(--bg-1);
  border: 1px solid var(--border-subtle); border-radius: var(--r-pill);
  padding: 4px; gap: 2px; }

.nw-seg-btn { font: 600 13px/1 var(--font-sans); padding: 8px 15px;
  border-radius: var(--r-pill); cursor: pointer;
  transition: all .16s cubic-bezier(.2,.7,.2,1); }

.nw-seg-btn.on {
  background: var(--accent-soft); color: var(--accent);
  box-shadow: var(--glow-accent);   /* 골드 글로우 */
}
```

---

### 5-4. Toggle 2-up (`components/controls.tsx`)

헤드라인 ↔ 근원, MoM ↔ YoY.

```css
.nw-toggle { display: inline-flex; background: var(--bg-1);
  border: 1px solid var(--border-subtle); border-radius: var(--r-sm);
  padding: 3px; gap: 2px; }

.nw-toggle-btn { font: 600 12px/1 var(--font-sans); padding: 8px 13px;
  border-radius: 6px; cursor: pointer; }

.nw-toggle-btn.on { background: var(--surface-3); color: var(--text-hi); }
```

---

### 5-5. CheckChip — 컨센서스 오버레이 (`components/controls.tsx`)

```css
.nw-chip { display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid var(--border-default); border-radius: var(--r-pill);
  font: 600 12px/1 var(--font-sans); padding: 8px 13px 8px 10px; cursor: pointer; }

.nw-chip.on { border-color: var(--accent-line); color: var(--accent); }

.nw-chip-box { width: 16px; height: 16px; border-radius: 4px;
  border: 1.5px solid var(--border-strong); display: inline-flex;
  align-items: center; justify-content: center; }

.nw-chip.on .nw-chip-box { background: var(--accent-soft); border-color: var(--accent-line); }
```

아이콘: `<Check size={12} />` (lucide-react).

---

### 5-6. Card 쉘 (`components/Card.tsx`)

```css
.nw-card {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg);
  padding: 22px 22px 20px;
  min-width: 0;
}
```

카드 헤더 구조: `eyebrow(t-label)` → `title(t-h3)` + `right(controls)`.

**Legend** 컴포넌트 3종:
- `line` — 16×2px 가로선 (차트 계열)
- `ring` — 9px 속빈 원 (컨센서스 마커)
- 기본 — 9×9px 정사각형 (막대/히트맵)

---

### 5-7. App Logo Tile (`.nw-applogo`)

```css
.nw-applogo { width: 46px; height: 46px; border-radius: 13px;
  overflow: hidden; border: 1px solid var(--border-default);
  background: #04060c; box-shadow: var(--shadow-sm); }

.nw-applogo img {
  transform: scale(1.14); transform-origin: 50% 42%;
  object-position: 50% 42%;
}
```

`ppi-mark.png` 사용. 13px radius로 iOS 앱 아이콘 감.

---

### 5-8. Ghost Button (`.nw-btn-ghost`)

```css
.nw-btn-ghost { display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid var(--border-default); border-radius: var(--r-sm);
  font: 600 13px/1 var(--font-sans); padding: 9px 14px; cursor: pointer; }

.nw-btn-ghost:hover { border-color: var(--border-strong); color: var(--text-hi); }
.nw-btn-ghost:active { transform: translateY(1px); }
```

---

### 5-9. Skeleton Shimmer (`.nw-sk`)

```css
.nw-sk {
  background: linear-gradient(100deg,
    var(--surface-2s) 30%, var(--surface-3) 50%, var(--surface-2s) 70%);
  background-size: 200% 100%;
  animation: nw-sh 1.4s ease-in-out infinite;
}
@keyframes nw-sh { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .nw-sk { animation: none; } }
```

사용 패턴:
```tsx
// KPI 스켈레톤
<div className="nw-kpi" style={{ '--rule': 'var(--border-default)' }}>
  <div className="nw-sk" style={{ width: '45%', height: 11, borderRadius: 6 }} />
  <div className="nw-sk" style={{ width: '62%', height: 36, borderRadius: 6, margin: '16px 0 12px' }} />
  <div className="nw-sk" style={{ width: '50%', height: 12, borderRadius: 6 }} />
</div>

// 차트 스켈레톤
<div className="nw-sk" style={{ width: '100%', height: 340, borderRadius: 10 }} />
```

---

## 6. 차트 컴포넌트

모든 차트는 **순수 SVG**. 외부 차트 라이브러리 추가 금지.

### 6-1. LineChart (`components/charts/LineChart.tsx`)

**핵심 구조**:
- `ResizeObserver`로 컨테이너 폭(`W`) 측정 → SVG `viewBox` 동적 계산
- `padL=46, padR=16, padT=18, padB=28` — 축 레이블 여백
- 0선: `--border-default` + `strokeDasharray="4 4"` 점선
- 격자선: `--grid-line`
- **면적 그라데이션**: 최신값 방향(`dir`)에 따라 `--up`/`--down`/`--flat` 색상 → 22%→0% 투명도
- **실선**: `--accent` (샴페인 골드) 2px
- **컨센서스 마커**: `--flat` 속빈 원 (MoM 모드 + `showConsensus=true`일 때만)
- **크로스헤어**: hover/touch 이벤트 → `--border-strong` 수직선 + `--accent` 강조점
- **툴팁**: `--surface-3` 96% + `backdrop-filter: blur(8px)` + `--shadow-lg`

X축 레이블 포맷:
- 30개 이상 데이터: `YY.MM` (예: `26.04`)
- 30개 이하: `M월` (예: `4월`)

**반응형**: `isMobile` prop → height 340→240, x레이블 밀도 조정.

**방향 판단 기준**:
```ts
const dir = lastVal > 0.02 ? 'up' : lastVal < -0.02 ? 'down' : 'flat'
```

---

### 6-2. ContributionBars (`components/charts/ContributionBars.tsx`)

분기 수평 막대 (diverging bar). 0 기준선이 중앙.

```
레이아웃: [품목명 78px] [막대 영역 flex-1] [수치 56px]
막대: position: absolute, left: pos ? '50%' : `${50-w}%`, width: `${w}%`
색상: 양수 → var(--up), 음수 → var(--down), opacity 0.92
수치: fontFamily: var(--num), fontFeatureSettings: '"tnum" 1'
```

---

### 6-3. Heatmap (`components/charts/Heatmap.tsx`)

카테고리 × 최근 8개월 MoM 히트맵.

```ts
// 배경색 계산 (강도 비례)
const a = Math.min(0.42, 0.10 + (Math.abs(v) / maxAbs) * 0.34)
// 상승: rgba(244,113,94, a)  → --up 계열
// 하락: rgba(84,166,214, a)  → --down 계열

// 텍스트색: |v| > 55% maxAbs → '#fff', 아니면 --up/--down
```

셀: `borderRadius: 6`, `padding: 9px 4px`, `fontFeatureSettings: '"tnum" 1`.  
컨테이너: `overflowX: auto` + `minWidth: 520` → 모바일 가로 스크롤.

---

## 7. 아이콘 규칙

- **라이브러리**: `lucide-react` (npm)
- **스트로크**: 1.75px (`strokeWidth` 기본값 유지)
- **크기**: 16px (인라인), 18px (버튼), 20px (강조)
- **색상**: `currentColor` — 부모의 `color` 상속
- **방향 글리프**: `▲/▼/—` (유니코드 U+25B2/U+25BC) — Lucide 아이콘이 아닌 텍스트 문자. 숫자와 인라인으로 배치.

사용 중인 Lucide 아이콘:
- `Download` — 헤더 내보내기 버튼
- `Check` — CheckChip 체크박스

금지: 이모지, 멀티컬러 아이콘, 커스텀 SVG 일러스트레이션.

---

## 8. 콘텐츠 & 카피 규칙

### 언어·톤
- **한국어 기본**, 금융 용어는 영문 약어 유지 (PPI, MoM, YoY, SA, NSA)
- 톤: 침착하고 선언적. 과장 금지.
  - ✅ `근원 PPI는 전월 대비 +0.2% 상승했습니다.`
  - ❌ `와우, 물가가 또 올랐어요!`
- 이모지 사용 금지. 느낌표(`!`) 금지.

### 고정 용어

| 한국어 | 영문 |
|--------|------|
| 헤드라인 PPI(최종수요) | Headline PPI · Final Demand |
| 근원 PPI(식품·에너지 제외) | Core PPI ex Food & Energy |
| 전월비 | MoM |
| 전년동월비 | YoY |
| 컨센서스(예상치) | Consensus |
| 기여도 | Contribution |
| 상승 / 하락 / 보합 | ▲ / ▼ / — |

### 숫자 표기 규칙
- 부호 명시: `+0.3%`, `−0.1%` (bare number 금지)
- 단위 명시: `+0.3% MoM`, `Index 145.2`, `2026.04`
- 소수점: 변동률 `.1f`(KPI), `.2f`(툴팁/테이블)

### 스플라이스 주석
PPIFIS 시작 이전(~2009.10) 구간을 표기할 때:
```
* 2009.11 이전은 Finished Goods 기준 보강
```

### 로딩·빈 상태
- 로딩 중: 스켈레톤 shimmer (텍스트 "로딩 중..." 금지)
- 컨센서스 없음: `—` (빈칸·null 표시 금지)
- 결측 데이터: `–` (em dash)

---

## 9. 인터랙션 & 애니메이션

### 트랜지션
```css
transition: all .16s cubic-bezier(.2,.7,.2,1);  /* 컨트롤 hover/active */
```

### 상태 정의
| 상태 | 처리 |
|------|------|
| hover | surface 밝기 +4% 또는 `border-default → border-strong` 스텝업 |
| active | `transform: translateY(1px)` + 살짝 dim |
| focus-visible | `--border-focus` 골드 링 |
| disabled | `--text-disabled`, 배경 없음 |
| active filter | `--accent-soft` 배경 + `--accent` 텍스트 + `--glow-accent` |

### 모션 금지 사항
- bounce 금지
- 무한 루프 (스켈레톤 shimmer 제외) 금지
- `prefers-reduced-motion` 존중: 스켈레톤 animation none, 숫자 카운트업 없이 최종값 즉시 표시

### DB 지연 패턴 (부팅 시뮬레이션)
```tsx
// 초기 로드: 1.3초 스켈레톤
useEffect(() => {
  const t = setTimeout(() => setBooting(false), 1300)
  return () => clearTimeout(t)
}, [])

// 필터 변경 시: 380ms 리프레시 플래시
useEffect(() => {
  if (booting) return
  setRefreshing(true)
  const t = setTimeout(() => setRefreshing(false), 380)
  return () => clearTimeout(t)
}, [metric, mode, period])
```

---

## 10. 반응형 브레이크포인트

| 브레이크포인트 | 변화 |
|---------------|------|
| `> 1100px` | KPI 4열, 메인 그리드 1.65:1 |
| `≤ 1100px` | KPI 2열 |
| `≤ 880px` | 메인 그리드 단일 열, 기여도 패널이 차트 아래로 |
| `≤ 560px` | KPI 1열 |
| `< 760px` (isMobile) | 차트 높이 340→240, 히트맵 가로 스크롤 |

`isMobile` 훅:
```tsx
function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 760)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return mobile
}
```

---

## 11. 페이지 구성 순서 (화면 우선순위)

```
Header (로고 · 제품명 · 최근 발표일 · 내보내기 버튼)
  ↓
KPI Row (4 cards)
  [Headline PPI MoM] [Headline PPI YoY] [Core PPI MoM] [기준월·발표일]
  ↓
Main Grid
  [LineChart (1.65fr)] | [ContributionBars (1fr)]
         [Heatmap (full width)]
  ↓
Footer (might Macro 락업 · 출처 · 방향색 범례)
```

---

## 12. 새 컴포넌트 추가 체크리스트

디자인 작업 시 아래 순서를 지킨다:

- [ ] 이 문서(`docs/DESIGN_SYSTEM.md`)에서 관련 토큰·컴포넌트 패턴 확인
- [ ] 필요한 CSS 클래스(`.nw-*`)를 `app/globals.css`에 추가
- [ ] `components/` 아래 TSX 파일 생성 (`'use client'` 선언)
- [ ] 색상·간격은 CSS 변수 사용, 하드코딩 금지
- [ ] 숫자 요소에 `var(--num)` + `font-feature-settings: "tnum" 1` 적용
- [ ] 방향 표현: 색상 + 글리프(`▲/▼/—`) 이중 표현
- [ ] 로딩 상태: `.nw-sk` skeleton 구현
- [ ] 반응형: 모바일 브레이크포인트 대응
- [ ] `prefers-reduced-motion` 미디어 쿼리 처리
