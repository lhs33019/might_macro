/**
 * lib/insight/generate.ts — AI 발표 해석 한줄평 생성 (서버/적재 전용)
 *
 * Google AI Studio(Gemini) API를 호출해 PPI 헤드라인 지표를 시장 코멘트 한 문장으로 요약한다.
 * 보안: GEMINI_API_KEY는 .env.local·적재 스크립트에서만 사용. 클라이언트 노출 금지.
 * 호출 위치: scripts/ingest.ts 적재 종료 시 1회 → DB(dashboard_insight) 저장.
 *           화면은 저장된 문장만 읽으므로 페이지 로드 시 외부 호출이 없다(빠름 원칙).
 */

import { GoogleGenAI } from '@google/genai'

/** 한줄평 생성에 쓰는 지표 1줄 (시리즈별) */
export interface InsightMetricInput {
  readonly label: string
  readonly yoy: number | null
  readonly mom: number | null
  readonly ann3m: number | null      // Annualized 3M (%)
  readonly accel3m: number | null    // 실질 가속도 (%p)
}

export interface InsightGenInput {
  readonly refDate: string                        // 헤드라인 기준월 (YYYY-MM-DD)
  readonly headline: readonly InsightMetricInput[] // 8개 헤드라인
  readonly coreYoy: number | null                 // 진짜 근원(PPIFES) YoY (헤드라인↔코어 비교용)
  // 추가 맥락 (선택) — 신규 지표로 코멘트를 풍부하게
  readonly breadthPct?: number | null             // 가격 상승 폭(MoM>0 비중, %)
  readonly pceRead?: 'firming' | 'softening' | 'mixed' | null  // 코어 PCE 압력 방향
  readonly marginGap?: number | null              // 헤드라인 PPI−CPI 갭(%p, +면 마진 압박)
  readonly topAccelLabel?: string | null          // 최고 가속 부문
  readonly topAccelValue?: number | null          // 그 실질가속도(%p)
}

export interface InsightGenResult {
  readonly body: string
  readonly model: string
}

/** 한줄평 생성에 사용할 모델 */
const INSIGHT_MODEL = 'gemini-2.0-flash'

function fmt(v: number | null, suffix = '%'): string {
  if (v == null) return 'N/A'
  return (v > 0 ? '+' : '') + v.toFixed(1) + suffix
}

/** 지표를 모델이 읽기 쉬운 표 형태 텍스트로 직렬화 */
function serializeMetrics(input: InsightGenInput): string {
  const lines = input.headline.map(
    (m) =>
      `- ${m.label}: YoY ${fmt(m.yoy)}, MoM ${fmt(m.mom)}, Annualized 3M ${fmt(m.ann3m)}, 실질가속도(3M−YoY) ${fmt(m.accel3m, '%p')}`,
  )
  const core =
    input.coreYoy != null
      ? `\n참고: 근원(식품·에너지 제외) YoY ${fmt(input.coreYoy)}`
      : ''

  // 추가 맥락 (있을 때만)
  const ctx: string[] = []
  if (input.topAccelLabel != null && input.topAccelValue != null)
    ctx.push(`최고 가속 부문: ${input.topAccelLabel}(실질가속 ${fmt(input.topAccelValue, '%p')})`)
  if (input.breadthPct != null)
    ctx.push(`가격 상승 폭: 전체 시리즈 중 MoM 상승 ${input.breadthPct.toFixed(0)}%`)
  if (input.pceRead != null) {
    const r = input.pceRead === 'firming' ? '강화' : input.pceRead === 'softening' ? '완화' : '혼조'
    ctx.push(`코어 PCE 반영 PPI(의료·금융·항공) 압력: ${r}`)
  }
  if (input.marginGap != null)
    ctx.push(`PPI−CPI 갭: ${fmt(input.marginGap, '%p')}(양수=마진 압박)`)
  const ctxBlock = ctx.length ? `\n추가 맥락:\n- ${ctx.join('\n- ')}` : ''

  return `기준월: ${input.refDate}\n${lines.join('\n')}${core}${ctxBlock}`
}

const SYSTEM_INSTRUCTION = `당신은 미국 생산자물가지수(PPI)를 해설하는 한국어 매크로 이코노미스트입니다.
주어진 지표만 근거로 시장 코멘트를 한국어 한 문장으로 작성하세요.

규칙:
- 정확히 한 문장(최대 3개 절). 수치를 1~2개 인용하되 과장·추측 금지.
- "Annualized 3M"(최근 3개월 연율)과 "실질 가속도(3M이 YoY를 추월/하회하는 폭)"를 중심으로 해석.
- 가장 두드러진 부문(가속/둔화)을 1개 짚고, 헤드라인 대비 흐름을 언급.
- "추가 맥락"(가격 상승 폭·코어 PCE 반영 PPI 압력·PPI−CPI 마진 갭)이 주어지면 그중 1개를 자연스럽게 엮어도 됨(주어진 값만, 단정 금지).
- 이모지·마크다운·따옴표 없이 평문 한 문장만 출력.`

/**
 * Google AI Studio(Gemini) API로 한줄평 생성.
 * 키가 없거나 호출 실패 시 throw → 호출부에서 처리.
 */
export async function generateInsight(input: InsightGenInput): Promise<InsightGenResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수 누락')

  const ai = new GoogleGenAI({ apiKey })

  const response = await ai.models.generateContent({
    model: INSIGHT_MODEL,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      maxOutputTokens: 400,
      temperature: 0.3,
    },
    contents: `다음 PPI 지표로 시장 코멘트 한 문장을 작성해줘.\n\n${serializeMetrics(input)}`,
  })

  const text = (response.text ?? '').trim()
  if (!text) throw new Error('한줄평 생성 결과가 비어 있음')

  return { body: text, model: INSIGHT_MODEL }
}
