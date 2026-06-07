/**
 * lib/config/macro.ts — PPI−CPI 마진 스프레드 SSoT
 *
 * 투입가(PPI) vs 산출가(CPI) YoY 갭. PPI가 CPI를 추월하면(+) 기업 마진 압박,
 * CPI가 PPI를 추월하면(−) 가격 전가력·마진 여력. 주식 섹터 로테이션 시그널.
 *
 * 정확성(§8): 계열 일치를 위해 **양쪽 모두 SA**로 비교한다.
 *   - 헤드라인: CPI All Items(CPIAUCSL, SA) vs PPI Final Demand(PPIFIS, SA)
 *   - 코어    : CPI ex F&E(CPILFESL, SA) vs PPI ex F&E(PPIFES, SA)
 *
 * CPI 시리즈는 PPI 카테고리 트리 밖이라 자동 발견되지 않으므로 ingest 시드에 명시 포함한다.
 * 출처: BLS CPI / BLS PPI Final Demand.
 */

export interface MarginPairDef {
  readonly key: 'headline' | 'core'
  readonly label: string
  readonly cpiId: string   // 소비자물가 (산출가)
  readonly ppiId: string   // 생산자물가 (투입가)
}

export const MARGIN_PAIRS: readonly MarginPairDef[] = [
  { key: 'headline', label: '헤드라인', cpiId: 'CPIAUCSL', ppiId: 'PPIFIS' },
  { key: 'core',     label: '코어',     cpiId: 'CPILFESL', ppiId: 'PPIFES' },
] as const

/** 마진 스프레드용 CPI 시리즈 — ingest 시드에 추가(자동 발견 대상 아님). 모두 SA. */
export const CPI_SERIES: readonly { readonly id: string; readonly title: string }[] = [
  { id: 'CPIAUCSL', title: 'Consumer Price Index for All Urban Consumers: All Items (SA)' },
  { id: 'CPILFESL', title: 'Consumer Price Index for All Urban Consumers: All Items Less Food and Energy (SA)' },
] as const

export const CPI_IDS: readonly string[] = CPI_SERIES.map((c) => c.id)
