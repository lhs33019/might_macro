/**
 * lib/config/pipeline.ts — PPI 파이프라인 패스스루 단계 SSoT
 *
 * 생산자 물가는 미가공(원재료) → 가공 중간수요 → 최종수요로 수개월에 걸쳐
 * 전이되는 경향이 있다. 상류가 가속하는데 하류가 아직 조용하면 수개월 뒤
 * 헤드라인 상승의 선행신호, 상류 급락은 디스인플레 선행신호로 읽는다.
 *
 * 정확성(§8): 전 단계 SA 계열로 통일(SA/NSA 혼합 금지). 구(舊) 가공단계 체계
 * PPIITM·PPICRM은 2015-12 단종(DISCONTINUED)이므로 사용 금지 — 현행 WPSID
 * 체계를 쓴다. series_id는 DB 적재 확인됨(WPSID61/62는 1947년부터 현행).
 *
 * 확장 여지: 생산흐름 4단계(WPSID51~54, 2009-11~)로 세분화 가능하나
 * v1은 읽기 쉬운 3단계(미가공→가공→최종수요)만 노출한다.
 */

export interface PipelineStageDef {
  readonly id: string     // FRED series_id
  readonly label: string  // 단계 표시명
  readonly stage: number  // 1=최상류 → 3=최하류 (표시 순서)
}

export const PIPELINE_STAGES: readonly PipelineStageDef[] = [
  { id: 'WPSID62', label: '미가공 중간수요', stage: 1 },
  { id: 'WPSID61', label: '가공 중간수요',   stage: 2 },
  { id: 'PPIFIS',  label: '최종수요',        stage: 3 },
] as const

export const PIPELINE_IDS: readonly string[] = PIPELINE_STAGES.map((s) => s.id)
