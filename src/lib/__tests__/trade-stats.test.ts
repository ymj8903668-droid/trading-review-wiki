import { describe, it, expect } from "vitest"
import { parseTradeMarkdown, computeDashboardStats } from "../trade-stats"

const sampleMarkdown = `# 交割单 — 2025-04-14

| 时间 | 代码 | 名称 | 方向 | 数量 | 价格 | 金额 | 手续费 | 印花税 | 过户费 |
|------|------|------|------|------|------|------|--------|--------|--------|
| 09:31:22 | 000001 | 平安银行 | 买入 | 1000 | 10.50 | 10,500.00 | 5.25 | 0.00 | 0.10 |
| 14:30:05 | 000001 | 平安银行 | 卖出 | 500 | 10.80 | 5,400.00 | 2.70 | 5.40 | 0.05 |
| 10:15:33 | 300750 | 宁德时代 | 买入 | 200 | 220.00 | 44,000.00 | 22.00 | 0.00 | 0.20 |

## 汇总
- 成交笔数：3
- 买入金额：54,500.00
- 卖出金额：5,400.00
- 手续费：29.95
- 印花税：5.40
- 过户费：0.35
- 净盈亏：+49,135.40
`

const sampleMarkdown2 = `# 交割单 — 2025-04-15

| 时间 | 代码 | 名称 | 方向 | 数量 | 价格 | 金额 | 手续费 | 印花税 | 过户费 |
|------|------|------|------|------|------|------|--------|--------|--------|
| 09:45:10 | 600519 | 贵州茅台 | 买入 | 100 | 1500.00 | 150,000.00 | 75.00 | 0.00 | 0.20 |
| 13:20:45 | 300750 | 宁德时代 | 卖出 | 200 | 225.50 | 45,100.00 | 22.55 | 45.10 | 0.20 |

## 汇总
- 成交笔数：2
- 买入金额：150,000.00
- 卖出金额：45,100.00
- 手续费：97.55
- 印花税：45.10
- 过户费：0.40
- 净盈亏：-105,042.85
`

describe("Trade Stats", () => {
  it("parses markdown trade table", () => {
    const stats = parseTradeMarkdown("2025-04-14", sampleMarkdown)
    expect(stats.date).toBe("2025-04-14")
    expect(stats.tradeCount).toBe(3)
    expect(stats.buyCount).toBe(2)
    expect(stats.sellCount).toBe(1)
    expect(stats.records[0].code).toBe("000001")
    expect(stats.records[0].name).toBe("平安银行")
    expect(stats.records[0].direction).toBe("buy")
    expect(stats.records[0].amount).toBe(10500)
    expect(stats.records[1].direction).toBe("sell")
    expect(stats.records[2].name).toBe("宁德时代")
  })

  it("parseTradeMarkdown netPnL is placeholder (computed by computeDashboardStats)", () => {
    const stats = parseTradeMarkdown("2025-04-14", sampleMarkdown)
    // parseTradeMarkdown 不再做单日盈亏估算，正确的 netPnL 由 computeDashboardStats 统一 FIFO 计算回填
    expect(stats.netPnL).toBe(0)
  })

  it("computes dashboard stats across multiple days", () => {
    const day1 = parseTradeMarkdown("2025-04-14", sampleMarkdown)
    const day2 = parseTradeMarkdown("2025-04-15", sampleMarkdown2)
    const { monthly, stocks, overall } = computeDashboardStats([day1, day2])

    expect(monthly.length).toBe(1)
    expect(monthly[0].month).toBe("2025-04")
    expect(monthly[0].tradeCount).toBe(5)

    expect(overall.totalTradeCount).toBe(5)
    // FIFO 已实现盈亏：day1 平安银行卖出盈利，day2 宁德时代卖出盈利
    expect(overall.winDays).toBe(2)
    expect(overall.lossDays).toBe(0)
    expect(overall.totalBuyAmount).toBe(54500 + 150000)
    expect(overall.totalSellAmount).toBe(5400 + 45100)
    // day1: 5391.85 - 5252.675 = 139.175
    // day2: 45032.15 - 44022.20 = 1009.95
    expect(overall.totalNetPnL).toBeCloseTo(1149.125, 1)

    // Stocks sorted by PnL desc
    const catl = stocks.find((s) => s.code === "300750")
    expect(catl).toBeDefined()
    expect(catl!.tradeCount).toBe(2)
    expect(catl!.netPnL).toBeCloseTo(1009.95, 1)
  })

  it("flags hasUnknownCost when selling without prior holdings", () => {
    // 第一天就卖出 1000 股，没有买入记录 → 超卖
    const sellOnlyMd = `# 交割单 — 2025-04-14

| 时间 | 代码 | 名称 | 方向 | 数量 | 价格 | 金额 | 手续费 | 印花税 | 过户费 |
|------|------|------|------|------|------|------|--------|--------|--------|
| 09:31:22 | 000001 | 平安银行 | 卖出 | 1000 | 10.80 | 10,800.00 | 5.40 | 10.80 | 0.10 |

## 汇总
- 成交笔数：1
`
    const day = parseTradeMarkdown("2025-04-14", sellOnlyMd)
    const { overall, unknownCostSales } = computeDashboardStats([day])

    expect(overall.hasUnknownCost).toBe(true)
    expect(overall.totalUnknownQty).toBe(1000)
    expect(overall.totalNetPnL).toBeCloseTo(0, 2) // 没有匹配成本，盈亏为 0
    expect(unknownCostSales.get("000001")?.[0].quantity).toBe(1000)
  })

  it("partially matches FIFO when sell exceeds holdings", () => {
    // 买入 500，卖出 1000 → 500 正常匹配，500 超卖
    const buyMd = `# 交割单 — 2025-04-14

| 时间 | 代码 | 名称 | 方向 | 数量 | 价格 | 金额 | 手续费 | 印花税 | 过户费 |
|------|------|------|------|------|------|------|--------|--------|--------|
| 09:31:22 | 000001 | 平安银行 | 买入 | 500 | 10.50 | 5,250.00 | 2.63 | 0.00 | 0.05 |

## 汇总
- 成交笔数：1
`
    const sellMd = `# 交割单 — 2025-04-15

| 时间 | 代码 | 名称 | 方向 | 数量 | 价格 | 金额 | 手续费 | 印花税 | 过户费 |
|------|------|------|------|------|------|------|--------|--------|--------|
| 14:30:00 | 000001 | 平安银行 | 卖出 | 1000 | 10.80 | 10,800.00 | 5.40 | 10.80 | 0.10 |

## 汇总
- 成交笔数：1
`
    const day1 = parseTradeMarkdown("2025-04-14", buyMd)
    const day2 = parseTradeMarkdown("2025-04-15", sellMd)
    const { overall, stocks, unknownCostSales } = computeDashboardStats([day1, day2])

    expect(overall.hasUnknownCost).toBe(true)
    expect(overall.totalUnknownQty).toBe(500)
    // 500 匹配部分的盈亏（正常计算）
    expect(overall.totalNetPnL).not.toBe(0)
    expect(overall.totalNetPnL).toBeGreaterThan(0)

    const stock = stocks.find((s) => s.code === "000001")
    expect(stock).toBeDefined()
    expect(stock!.netPnL).toBeGreaterThan(0)

    // 超卖部分单独记录
    expect(unknownCostSales.get("000001")?.[0].quantity).toBe(500)
  })
})
