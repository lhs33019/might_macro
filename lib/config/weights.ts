/**
 * lib/config/weights.ts — PPI 최종수요(Final Demand) 상대중요도 가중치 SSoT
 *
 * 부문 기여도 분해(대시보드)에 사용한다.
 *   기여도ᵢ(%p) = 상대중요도ᵢ × 부문 MoMᵢ
 *
 * 정확성(§8): 가중치는 BLS가 매년 갱신하는 "상대중요도(Relative Importance)"의 근사값이다.
 *   - 최종수요는 재화 + 서비스 + 건설로 구성되며, 재화·서비스가 약 98%를 차지한다.
 *   - 본 분해는 재화·서비스 2개 부문만 다루며(건설 제외), 화면에 "BLS 상대중요도 근사"와
 *     기준연도를 캡션으로 표기한다. 값이 바뀌면 출처를 확인해 갱신한다.
 *
 * 출처: BLS Producer Price Index — Final Demand Relative Importance.
 *       (https://www.bls.gov/ppi/ — 상대중요도 표 연 1회 갱신)
 */

export interface FdComponentWeight {
  readonly key: string
  readonly seriesId: string   // HEADLINE_SERIES 와 동일한 FRED ID
  readonly label: string
  readonly weight: number     // 상대중요도 (0~1)
}

/** 최종수요(PPIFIS) 내 부문 상대중요도 — 근사값. asOf 기준연도 표기 필수. */
export const FD_RELATIVE_IMPORTANCE = {
  asOf: '2024',                          // BLS 상대중요도 기준연도(근사)
  source: 'BLS PPI Final Demand 상대중요도',
  components: [
    { key: 'goods',    seriesId: 'PPIFDG', label: '최종수요 재화',   weight: 0.33 },
    { key: 'services', seriesId: 'PPIFDS', label: '최종수요 서비스', weight: 0.65 },
  ] as readonly FdComponentWeight[],
} as const
