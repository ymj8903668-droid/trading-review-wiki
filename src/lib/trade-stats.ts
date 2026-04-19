export interface TradeStatRecord {
  date: string
  time?: string
  code: string
  name: string
  direction: "buy" | "sell"
  quantity: number
  price: number
  amount: number
  fee: number
  stampTax: number
  transferFee: number
}

export interface TradeDayStats {
  date: string
  records: TradeStatRecord[]
  tradeCount: number
  buyCount: number
  sellCount: number
  buyAmount: number
  sellAmount: number
  totalFee: number
  totalStampTax: number
  totalTransferFee: number
  netPnL: number // 已实现盈亏（基于 FIFO），由 computeDashboardStats 统一回填
}

export interface MonthlyStat {
  month: string // YYYY-MM
  netPnL: number
  tradeCount: number
}

export interface StockStat {
  code: string
  name: string
  tradeCount: number
  buyCount: number
  sellCount: number
  netPnL: number
  totalFee: number
}

export interface OverallStats {
  totalTradeCount: number
  totalBuyAmount: number
  totalSellAmount: number
  totalFee: number
  totalStampTax: number
  totalTransferFee: number
  totalNetPnL: number
  maxDayProfit: number
  maxDayLoss: number
  winDays: number
  lossDays: number
  breakEvenDays: number
  avgDayNetPnL: number
  /** 是否存在卖出超过已知持仓的情况（缺少期初持仓） */
  hasUnknownCost: boolean
  /** 成本未知的卖出总股数 */
  totalUnknownQty: number
}

function parseNumber(str: string): number {
  const cleaned = str.replace(/,/g, "").replace(/[￥$¥+]/g, "").trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parseDirection(str: string): TradeStatRecord["direction"] | null {
  const s = str.trim()
  if (s === "买入") return "buy"
  if (s === "卖出") return "sell"
  return null
}

export function parseTradeMarkdown(date: string, content: string): TradeDayStats {
  const lines = content.split("\n")
  const records: TradeStatRecord[] = []

  let inTable = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("| 时间 ") && trimmed.includes("代码") && trimmed.includes("名称")) {
      inTable = true
      continue
    }
    if (inTable && trimmed.startsWith("|------")) {
      continue
    }
    if (inTable && trimmed.startsWith("|")) {
      const parts = trimmed.split("|").map((s) => s.trim())
      if (parts[0] === "") parts.shift()
      if (parts[parts.length - 1] === "") parts.pop()
      if (parts.length >= 10) {
        const dir = parseDirection(parts[3])
        if (dir == null) continue
        records.push({
          date,
          time: parts[0] === "—" ? undefined : parts[0],
          code: parts[1],
          name: parts[2],
          direction: dir,
          quantity: parseNumber(parts[4]),
          price: parseNumber(parts[5]),
          amount: parseNumber(parts[6]),
          fee: parseNumber(parts[7]),
          stampTax: parseNumber(parts[8]),
          transferFee: parseNumber(parts[9]),
        })
      }
      continue
    }
    if (inTable && !trimmed.startsWith("|")) {
      inTable = false
    }
  }

  const buyRecords = records.filter((r) => r.direction === "buy")
  const sellRecords = records.filter((r) => r.direction === "sell")
  const totalFee = records.reduce((s, r) => s + r.fee, 0)
  const totalStampTax = records.reduce((s, r) => s + r.stampTax, 0)
  const totalTransferFee = records.reduce((s, r) => s + r.transferFee, 0)
  const buyAmount = buyRecords.reduce((s, r) => s + r.amount, 0)
  const sellAmount = sellRecords.reduce((s, r) => s + r.amount, 0)

  // 单日的 markdown 无法独立计算 FIFO 已实现盈亏（需要全局持仓成本）。
  // 正确的 netPnL 由 computeDashboardStats 统一回填。
  const netPnL = 0

  return {
    date,
    records,
    tradeCount: records.length,
    buyCount: buyRecords.length,
    sellCount: sellRecords.length,
    buyAmount,
    sellAmount,
    totalFee,
    totalStampTax,
    totalTransferFee,
    netPnL,
  }
}

// ── Unified FIFO Engine ───────────────────────────────────────────────────────

interface Lot {
  quantity: number
  costPerShare: number // (成交金额 + 买入相关费用) / 数量
}

interface UnknownCostSale {
  date: string
  quantity: number
  proceeds: number // 该部分卖出的净收入（已扣除费用）
}

interface FifoResult {
  /** 每日已实现盈亏（仅卖出日有值） */
  dailyRealizedPnL: Map<string, number>
  /** 每只股票累计已实现盈亏 */
  stockRealizedPnL: Map<string, { name: string; pnl: number; fees: number }>
  /** 当前剩余持仓批次 */
  holdings: Map<string, Lot[]>
  /** 成本未知的卖出记录（缺少期初持仓导致） */
  unknownCostSales: Map<string, UnknownCostSale[]>
  /** 是否存在成本未知的卖出 */
  hasUnknownCost: boolean
}

/**
 * 统一的 FIFO 引擎：遍历全部交易记录，计算
 * 1. 每日已实现盈亏
 * 2. 每只股票累计已实现盈亏
 * 3. 当前持仓批次
 */
function runFifoEngine(records: TradeStatRecord[]): FifoResult {
  const sorted = [...records].sort((a, b) => {
    const dtA = `${a.date}T${a.time || "00:00:00"}`
    const dtB = `${b.date}T${b.time || "00:00:00"}`
    return dtA.localeCompare(dtB)
  })

  const holdings = new Map<string, Lot[]>()
  const dailyRealizedPnL = new Map<string, number>()
  const stockRealizedPnL = new Map<string, { name: string; pnl: number; fees: number }>()
  const unknownCostSales = new Map<string, UnknownCostSale[]>()
  let hasUnknownCost = false

  for (const r of sorted) {
    const lots = holdings.get(r.code) ?? []

    if (r.direction === "buy") {
      // 买入成本 = 成交金额 + 手续费 + 过户费（A股买入无印花税）
      const totalCost = Math.abs(r.amount) + r.fee + r.transferFee
      const costPerShare = r.quantity > 0 ? totalCost / r.quantity : 0
      lots.push({ quantity: r.quantity, costPerShare })
      holdings.set(r.code, lots)
    } else {
      let remaining = r.quantity
      let soldCostBasis = 0

      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0]
        const deduct = Math.min(remaining, lot.quantity)
        soldCostBasis += deduct * lot.costPerShare
        lot.quantity -= deduct
        remaining -= deduct
        if (lot.quantity <= 0) lots.shift()
      }

      holdings.set(r.code, lots)

      if (remaining > 0) {
        // 卖出数量超过已知持仓 — 缺少期初持仓
        hasUnknownCost = true
        const netProceeds = r.amount - r.fee - r.stampTax - r.transferFee
        const unk = unknownCostSales.get(r.code) ?? []
        // 只记录超卖部分对应的净收入（按比例）
        const unkProceeds = r.quantity > 0 ? netProceeds * (remaining / r.quantity) : 0
        unk.push({ date: r.date, quantity: remaining, proceeds: unkProceeds })
        unknownCostSales.set(r.code, unk)

        // 只计算已知成本匹配部分的盈亏（按成交额比例分摊费用）
        const matchedQty = r.quantity - remaining
        if (matchedQty > 0) {
          const ratio = matchedQty / r.quantity
          const matchedAmount = r.amount * ratio
          const matchedFee = r.fee * ratio
          const matchedStamp = r.stampTax * ratio
          const matchedTransfer = r.transferFee * ratio
          const matchedProceeds = matchedAmount - matchedFee - matchedStamp - matchedTransfer
          const realized = matchedProceeds - soldCostBasis
          dailyRealizedPnL.set(r.date, (dailyRealizedPnL.get(r.date) ?? 0) + realized)

          const s = stockRealizedPnL.get(r.code) ?? { name: r.name, pnl: 0, fees: 0 }
          s.pnl += realized
          s.fees += matchedFee + matchedStamp + matchedTransfer
          stockRealizedPnL.set(r.code, s)
        }
      } else {
        // 全部有成本 basis，正常计算
        const proceeds = r.amount - r.fee - r.stampTax - r.transferFee
        const realized = proceeds - soldCostBasis
        dailyRealizedPnL.set(r.date, (dailyRealizedPnL.get(r.date) ?? 0) + realized)

        const s = stockRealizedPnL.get(r.code) ?? { name: r.name, pnl: 0, fees: 0 }
        s.pnl += realized
        s.fees += r.fee + r.stampTax + r.transferFee
        stockRealizedPnL.set(r.code, s)
      }
    }
  }

  return { dailyRealizedPnL, stockRealizedPnL, holdings, unknownCostSales, hasUnknownCost }
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────

export function computeDashboardStats(
  dayStatsList: TradeDayStats[]
): {
  days: TradeDayStats[]
  monthly: MonthlyStat[]
  stocks: StockStat[]
  overall: OverallStats
  unknownCostSales: Map<string, UnknownCostSale[]>
} {
  const sortedDays = [...dayStatsList].sort((a, b) => a.date.localeCompare(b.date))

  // 1. 全局 FIFO 计算正确的已实现盈亏
  const allRecords = sortedDays.flatMap((d) => d.records)
  const fifo = runFifoEngine(allRecords)

  // 2. 回填每日 netPnL
  for (const day of sortedDays) {
    day.netPnL = fifo.dailyRealizedPnL.get(day.date) ?? 0
  }

  // 3. 按月聚合
  const monthMap = new Map<string, MonthlyStat>()
  for (const day of sortedDays) {
    const month = day.date.slice(0, 7)
    const existing = monthMap.get(month) ?? { month, netPnL: 0, tradeCount: 0 }
    existing.netPnL += day.netPnL
    existing.tradeCount += day.tradeCount
    monthMap.set(month, existing)
  }
  const monthly = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month))

  // 4. 按股票聚合（交易次数等）
  const stockMap = new Map<string, StockStat>()
  for (const day of sortedDays) {
    for (const r of day.records) {
      const key = r.code
      const existing = stockMap.get(key) ?? {
        code: r.code,
        name: r.name,
        tradeCount: 0,
        buyCount: 0,
        sellCount: 0,
        netPnL: 0,
        totalFee: 0,
      }
      existing.tradeCount += 1
      if (r.direction === "buy") existing.buyCount += 1
      else existing.sellCount += 1
      existing.totalFee += r.fee + r.stampTax + r.transferFee
      stockMap.set(key, existing)
    }
  }

  // 5. 用 FIFO 结果覆盖每只股票的真实盈亏
  for (const [code, stat] of stockMap.entries()) {
    const fifoStat = fifo.stockRealizedPnL.get(code)
    stat.netPnL = fifoStat?.pnl ?? 0
  }
  const stocks = Array.from(stockMap.values()).sort((a, b) => b.netPnL - a.netPnL)

  // 6. 总体统计
  const totalTradeCount = sortedDays.reduce((s, d) => s + d.tradeCount, 0)
  const totalBuyAmount = sortedDays.reduce((s, d) => s + d.buyAmount, 0)
  const totalSellAmount = sortedDays.reduce((s, d) => s + d.sellAmount, 0)
  const totalFee = sortedDays.reduce((s, d) => s + d.totalFee, 0)
  const totalStampTax = sortedDays.reduce((s, d) => s + d.totalStampTax, 0)
  const totalTransferFee = sortedDays.reduce((s, d) => s + d.totalTransferFee, 0)
  const totalNetPnL = sortedDays.reduce((s, d) => s + d.netPnL, 0)

  const dayPnLs = sortedDays.map((d) => d.netPnL)
  const maxDayProfit = dayPnLs.length > 0 ? Math.max(...dayPnLs) : 0
  const maxDayLoss = dayPnLs.length > 0 ? Math.min(...dayPnLs) : 0
  const winDays = dayPnLs.filter((v) => v > 0).length
  const lossDays = dayPnLs.filter((v) => v < 0).length
  const breakEvenDays = dayPnLs.filter((v) => v === 0).length
  const avgDayNetPnL = sortedDays.length > 0 ? totalNetPnL / sortedDays.length : 0

  // 统计成本未知的卖出总量
  let totalUnknownQty = 0
  for (const sales of fifo.unknownCostSales.values()) {
    totalUnknownQty += sales.reduce((s, v) => s + v.quantity, 0)
  }

  const overall: OverallStats = {
    totalTradeCount,
    totalBuyAmount,
    totalSellAmount,
    totalFee,
    totalStampTax,
    totalTransferFee,
    totalNetPnL,
    maxDayProfit,
    maxDayLoss,
    winDays,
    lossDays,
    breakEvenDays,
    avgDayNetPnL,
    hasUnknownCost: fifo.hasUnknownCost,
    totalUnknownQty,
  }

  return { days: sortedDays, monthly, stocks, overall, unknownCostSales: fifo.unknownCostSales }
}

// ── Current Holdings ──────────────────────────────────────────────────────────

export interface Holding {
  code: string
  name: string
  quantity: number
  avgCost: number // 成本均价（含买入费用）
  totalCost: number // 总成本
  marketPrice: number // 当前市价（用户可编辑）
  unrealizedPnL: number // 浮动盈亏 = (市价 - 成本) * 数量
}

export function calculateCurrentHoldings(
  dayStatsList: TradeDayStats[],
  marketPrices: Record<string, number> = {}
): Holding[] {
  const allRecords = dayStatsList.flatMap((d) => d.records)
  const fifo = runFifoEngine(allRecords)

  const nameMap = new Map<string, string>()
  for (const r of allRecords) {
    nameMap.set(r.code, r.name)
  }

  const result: Holding[] = []
  for (const [code, lots] of fifo.holdings.entries()) {
    const totalQty = lots.reduce((s, l) => s + l.quantity, 0)
    if (totalQty <= 0) continue
    const totalCost = lots.reduce((s, l) => s + l.quantity * l.costPerShare, 0)
    const avgCost = totalQty > 0 ? totalCost / totalQty : 0
    const marketPrice = marketPrices[code] ?? 0
    const unrealizedPnL = marketPrice > 0 ? (marketPrice - avgCost) * totalQty : 0
    result.push({
      code,
      name: nameMap.get(code) || code,
      quantity: totalQty,
      avgCost,
      totalCost,
      marketPrice,
      unrealizedPnL,
    })
  }

  return result.sort((a, b) => b.totalCost - a.totalCost)
}

export function formatMoney(n: number): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
