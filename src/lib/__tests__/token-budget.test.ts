import { describe, it, expect, vi } from "vitest"
import {
  estimateTokens,
  classifyQuery,
  computeBudget,
  type TokenBudget,
  type QueryType,
} from "../token-budget"

describe("estimateTokens", () => {
  it("estimates Chinese text at ~1.5 tokens per character", () => {
    const chinese = "今天龙头股表现如何，情绪周期处于什么阶段"
    const tokens = estimateTokens(chinese)
    // 20 chars * 1.5 = 30 tokens (approximately)
    expect(tokens).toBeGreaterThanOrEqual(25)
    expect(tokens).toBeLessThanOrEqual(35)
  })

  it("estimates English text at ~0.25 tokens per character", () => {
    const english = "What is the current market sentiment and how are leading stocks performing"
    const tokens = estimateTokens(english)
    // 74 chars * 0.25 = ~18.5 tokens
    expect(tokens).toBeGreaterThanOrEqual(15)
    expect(tokens).toBeLessThanOrEqual(25)
  })

  it("handles mixed Chinese and English", () => {
    const mixed = "分析一下NVIDIA的基本面"
    const tokens = estimateTokens(mixed)
    // 6 Chinese chars * 1.5 + 10 English chars * 0.25 = 9 + 2.5 = ~12
    expect(tokens).toBeGreaterThan(8)
    expect(tokens).toBeLessThan(18)
  })

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0)
  })
})

describe("classifyQuery", () => {
  it("classifies short follow-up questions as continuation", () => {
    expect(classifyQuery("为什么", 5)).toBe("continuation")
    expect(classifyQuery("继续", 3)).toBe("continuation")
    expect(classifyQuery("然后呢", 4)).toBe("continuation")
  })

  it("classifies queries referencing specific files/stocks as precise", () => {
    expect(classifyQuery("英维克今天为什么涨停", 0)).toBe("precise")
    expect(classifyQuery("分析 wiki/股票/比亚迪.md", 0)).toBe("precise")
    expect(classifyQuery("000001 平安银行的交易记录", 0)).toBe("precise")
  })

  it("classifies open-ended questions as exploratory", () => {
    expect(classifyQuery("最近一个月我的交易有什么规律", 0)).toBe("exploratory")
    expect(classifyQuery("总结一下我的交易体系", 0)).toBe("exploratory")
  })

  it("uses history length to detect continuation", () => {
    // Short query + long history = likely continuation
    expect(classifyQuery("对", 8)).toBe("continuation")
    // Short query + no history = exploratory (not enough context to be continuation)
    expect(classifyQuery("对", 0)).toBe("exploratory")
  })
})

describe("computeBudget", () => {
  const maxTokens = 128000

  it("allocates more wiki budget for precise queries", () => {
    const budget = computeBudget("precise", maxTokens)
    expect(budget.wiki).toBeGreaterThanOrEqual(maxTokens * 0.65)
    expect(budget.history).toBeLessThanOrEqual(maxTokens * 0.15)
  })

  it("allocates more history budget for continuation queries", () => {
    const budget = computeBudget("continuation", maxTokens)
    expect(budget.history).toBeGreaterThanOrEqual(maxTokens * 0.4)
    expect(budget.wiki).toBeLessThanOrEqual(maxTokens * 0.35)
  })

  it("balances budget for exploratory queries", () => {
    const budget = computeBudget("exploratory", maxTokens)
    expect(budget.wiki).toBeGreaterThanOrEqual(maxTokens * 0.5)
    expect(budget.wiki).toBeLessThanOrEqual(maxTokens * 0.6)
  })

  it("total budget does not exceed maxTokens", () => {
    for (const type of ["precise", "continuation", "exploratory"] as QueryType[]) {
      const budget = computeBudget(type, maxTokens)
      const total = budget.wiki + budget.history + budget.system + budget.index
      expect(total).toBeLessThanOrEqual(maxTokens)
    }
  })

  it("handles small context windows", () => {
    const budget = computeBudget("precise", 4000)
    const total = budget.wiki + budget.history + budget.system + budget.index
    expect(total).toBeLessThanOrEqual(4000)
    expect(budget.wiki).toBeGreaterThan(0)
    expect(budget.system).toBeGreaterThan(0)
  })
})
