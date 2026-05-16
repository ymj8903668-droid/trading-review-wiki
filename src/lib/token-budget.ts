export type QueryType = "precise" | "continuation" | "exploratory"

export interface TokenBudget {
  wiki: number
  history: number
  system: number
  index: number
}

const CJK_RANGE = /[一-鿿㐀-䶿豈-﫿]/g
const TOKENS_PER_CJK_CHAR = 1.5
const TOKENS_PER_LATIN_CHAR = 0.25

export function estimateTokens(text: string): number {
  if (!text) return 0
  const cjkChars = (text.match(CJK_RANGE) || []).length
  const latinChars = text.length - cjkChars
  return Math.round(cjkChars * TOKENS_PER_CJK_CHAR + latinChars * TOKENS_PER_LATIN_CHAR)
}

const STOCK_CODE_RE = /\b\d{6}\b/
const FILE_PATH_RE = /wiki\/[^\s]+\.md/
const STOCK_NAME_RE = /[一-鿿]{2,4}(?:今天|为什么|怎么|涨停|跌停|走势|分析)/
const SHORT_QUERY_THRESHOLD = 5
const CONTINUATION_HISTORY_THRESHOLD = 3

export function classifyQuery(query: string, historyLength: number): QueryType {
  const charLen = query.length

  if (charLen <= SHORT_QUERY_THRESHOLD && historyLength >= CONTINUATION_HISTORY_THRESHOLD) {
    return "continuation"
  }

  if (STOCK_CODE_RE.test(query) || FILE_PATH_RE.test(query) || STOCK_NAME_RE.test(query)) {
    return "precise"
  }

  if (charLen <= SHORT_QUERY_THRESHOLD && historyLength === 0) {
    return "exploratory"
  }

  if (charLen <= 10 && historyLength >= 2) {
    return "continuation"
  }

  return "exploratory"
}

const BUDGET_PROFILES: Record<QueryType, { wiki: number; history: number; system: number; index: number }> = {
  precise:      { wiki: 0.70, history: 0.10, system: 0.15, index: 0.05 },
  continuation: { wiki: 0.30, history: 0.45, system: 0.20, index: 0.05 },
  exploratory:  { wiki: 0.55, history: 0.20, system: 0.20, index: 0.05 },
}

export function computeBudget(queryType: QueryType, maxTokens: number): TokenBudget {
  const profile = BUDGET_PROFILES[queryType]
  return {
    wiki: Math.floor(maxTokens * profile.wiki),
    history: Math.floor(maxTokens * profile.history),
    system: Math.floor(maxTokens * profile.system),
    index: Math.floor(maxTokens * profile.index),
  }
}
