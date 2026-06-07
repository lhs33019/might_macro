/**
 * lib/config/pce-ppi.ts — 코어 PCE에 직접 반영되는 PPI 컴포넌트 SSoT
 *
 * BEA의 PCE 물가지수는 일부 서비스 항목을 CPI가 아닌 PPI에서 소스로 가져온다
 * (대표적으로 의료서비스·포트폴리오관리(금융)·항공여객). 따라서 PPI 발표일에
 * 이 라인들의 움직임으로 "코어 PCE 압력"의 방향을 가늠할 수 있다.
 *
 * 정확성(§8): PCE 내 정확한 가중치는 공개 표준이 없으므로 **가중합/정밀 nowcast를 하지 않고
 * 방향 신호(강화/완화)만** 제시한다. 모두 NSA 산업지수이므로 화면에 NSA 주의를 단다.
 * series_id는 DB 적재 확인됨.
 *
 * 출처: BEA PCE(시장기반 항목 PPI 소스), BLS PPI by Industry.
 */

export interface PcePpiDef {
  readonly id: string
  readonly label: string
  readonly group: '헬스케어' | '금융' | '항공운송'
}

export const PCE_PPI_SERIES: readonly PcePpiDef[] = [
  { id: 'PCU621111621111', label: '의사 진료',      group: '헬스케어' },
  { id: 'PCU622110622110', label: '종합병원',        group: '헬스케어' },
  { id: 'PCU523920523920', label: '포트폴리오 관리', group: '금융' },
  { id: 'PCU481111481111', label: '항공 여객',       group: '항공운송' },
] as const

export const PCE_PPI_IDS: readonly string[] = PCE_PPI_SERIES.map((s) => s.id)
