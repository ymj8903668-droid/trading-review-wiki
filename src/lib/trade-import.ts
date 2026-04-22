import Papa from "papaparse"
import * as XLSX from "xlsx"

export interface TradeRecord {
  date: string // YYYY-MM-DD
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
  totalCost: number // 发生金额：买入为正，卖出为负（或相反，取决于券商）
}

const HEADER_MAP: Record<keyof TradeRecord, string[]> = {
  date: ["日期", "成交日期", "交割日期", "委托日期", "date", "tradedate", "交易日期", "发生日期", "交割日", "业务日期", "日期时间", "交易时间", "成交日", "委托日", "交易日期时间"],
  time: ["时间", "成交时间", "委托时间", "time", "成交时刻", "委托时刻", "交易时间", "成交时分", "委托时分", "时刻"],
  code: ["证券代码", "股票代码", "代码", "code", "stockcode", "证券编号", "合约", "证券代号", "标的代码", "股票编号", "证券号码", "合约代码", "标的编号"],
  name: ["证券名称", "股票名称", "名称", "name", "stockname", "证券简称", "标的名称", "股票简称", "合约名称", "标的简称"],
  direction: ["操作", "买卖方向", "成交方向", "委托方向", "买卖标志", "direction", "side", "买/卖", "交易方向", "买卖", "业务名称", "发生业务", "委托类别", "成交类别", "交易类别", "委托方向", "成交类型", "委托类型", "bs", "b/s", "bs标志", "交易标志", "操作类型", "方向"],
  quantity: ["成交数量", "数量", "quantity", "volume", "成交股数", "股数", "委托数量", "股份余额", "成交股", "数量(股)", "成交数量(股)", "成交股数(股)", "委托股数", "成交份额", "成交数量(手)", "成交手数", "手数", "成交数量(张)", "成交张数"],
  price: ["成交价格", "价格", "price", "成交均价", "均价", "成交单价", "委托价格", "成交价格(元)", "成交均价(元)", "单价", "委托价", "成交价", "成交价格(元)", "成交均价(元)", "委托价格(元)", "价格(元)", "成交单价(元)"],
  amount: ["成交金额", "金额", "amount", "turnover", "成交总额", "成交额", "委托金额", "清算金额", "发生金额", "成交金额(元)", "成交额(元)", "成交总额(元)", "清算金额(元)", "委托金额(元)", "金额(元)"],
  fee: ["手续费", "佣金", "fee", "commission", "交易费用", "规费", "其他费用", "交易佣金", "佣金(元)", "手续费(元)", "交易费用(元)", "交易规费", "佣金费用", "交易手续费", "交易佣金(元)", "手续费合计", "佣金合计"],
  stampTax: ["印花税", "stamptax", "印花", "税收", "印花税(元)", "印花税收", "交易印花税", "印花税费", "税收(元)"],
  transferFee: ["过户费", "transferfee", "过户", "其他杂费", "杂费", "其他费用", "过户费(元)", "过户手续费", "转让费", "过户杂费", "其他杂费(元)", "杂费(元)"],
  totalCost: ["发生金额", "总费用", "totalamount", "清算金额", "发生额", "净额", "资金发生额", "清算额", "资金额", "发生金额(元)", "清算金额(元)", "资金发生额(元)", "发生额(元)", "净额(元)", "资金额(元)", "总费用(元)", "总发生额", "总清算额"],
}

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .replace(/[（(].*?[)）]/g, "")     // 去掉括号及内容：成交均价(元) → 成交均价
    .replace(/[￥$¥,，]/g, "")         // 去掉货币符号、千分位、全角逗号
    .replace(/[\s　]+/g, "")           // 去掉全半角空格
    .replace(/[：:]/g, "")             // 去掉冒号
    .toLowerCase()
}

function findHeaderIndex(headers: string[], keys: string[]): number {
  const normalizedHeaders = headers.map(normalizeHeader)
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/\s+/g, "")
    const idx = normalizedHeaders.indexOf(normalizedKey)
    if (idx !== -1) return idx
  }
  return -1
}

function findHeaderRow(rows: unknown[][]): { rowIndex: number; headers: string[] } | null {
  // 第一层：按原有逻辑扫前 50 行（原 20 行太少，有些券商前面有账户信息）
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i]
    if (!Array.isArray(row) || row.length < 3) continue
    const headers = row.map((h) => String(h ?? ""))
    const hasCode = findHeaderIndex(headers, HEADER_MAP.code) !== -1
    const hasDate = findHeaderIndex(headers, HEADER_MAP.date) !== -1
    const hasName = findHeaderIndex(headers, HEADER_MAP.name) !== -1
    if (hasCode && (hasDate || hasName)) {
      return { rowIndex: i, headers }
    }
  }

  // 第二层 fallback：找"命中字段数最多"的行（最多扫前 100 行）
  let best: { rowIndex: number; headers: string[]; score: number } | null = null
  for (let i = 0; i < Math.min(rows.length, 100); i++) {
    const row = rows[i]
    if (!Array.isArray(row) || row.length < 3) continue
    const headers = row.map((h) => String(h ?? ""))

    let score = 0
    if (findHeaderIndex(headers, HEADER_MAP.code) !== -1) score += 3
    if (findHeaderIndex(headers, HEADER_MAP.date) !== -1) score += 2
    if (findHeaderIndex(headers, HEADER_MAP.name) !== -1) score += 2
    if (findHeaderIndex(headers, HEADER_MAP.direction) !== -1) score += 2
    if (findHeaderIndex(headers, HEADER_MAP.quantity) !== -1) score += 1
    if (findHeaderIndex(headers, HEADER_MAP.price) !== -1) score += 1
    if (findHeaderIndex(headers, HEADER_MAP.amount) !== -1) score += 1

    if (best == null || score > best.score) {
      best = { rowIndex: i, headers, score }
    }
  }

  // 至少命中 5 分（code + date + 任意一个），否则放弃
  if (best && best.score >= 5) return best
  return null
}

function normalizeDate(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "number" && value > 30000 && value < 60000) {
    // Excel serial date → JS Date (1899-12-30 baseline)
    const epoch = new Date(1899, 11, 30)
    const d = new Date(epoch.getTime() + value * 86400000)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  const str = String(value).trim()
  // 2025-04-15 or 2025/04/15
  const isoLike = str.match(/(\d{4})[-\/\.年](\d{1,2})[-\/\.月](\d{1,2})/)
  if (isoLike) {
    const [, y, m, d] = isoLike
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  // 25/04/15 (assume 20xx)
  const short = str.match(/(\d{2})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/)
  if (short) {
    const [, y, m, d] = short
    const year = parseInt(y, 10) >= 50 ? `19${y}` : `20${y}`
    const month = parseInt(m, 10)
    const day = parseInt(d, 10)
    // 校验月份和日期有效性，防止美式 MM/DD/YY 被误解析
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }
  return "" // 无法识别为日期，返回空字符串以便调用方过滤
}

function parseDirection(value: unknown): TradeRecord["direction"] | null {
  const str = String(value ?? "").trim().toLowerCase()
  // 买入别名
  if (["买", "买入", "b", "buy", "buyin", "多头", "多", "证券买入", "+", "+1", "正", "1"].includes(str)) return "buy"
  // 卖出别名（含带 - 号的常见券商格式）
  if (["卖", "卖出", "s", "sell", "sale", "sellout", "空头", "空", "证券卖出", "-", "-1", "负", "融券卖出", "担保品卖出", "卖出还款", "卖券还款"].includes(str)) return "sell"
  // 部分券商用 "卖 出" 或 "卖\t出" 等格式
  if (/^卖\s*出?/.test(str)) return "sell"
  if (/^买\s*入?/.test(str)) return "buy"
  return null // 不再静默 fallback — 避免列错位导致统计全错
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (value == null) return 0
  const str = String(value).replace(/,/g, "").replace(/[￥$¥]/g, "").trim()
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

function isWithdrawn(row: unknown[], headers: string[]): boolean {
  const idxDealQty = findHeaderIndex(headers, ["成交数量", "成交量"])
  const idxEntrustQty = findHeaderIndex(headers, ["委托数量"])
  const idxWithdrawQty = findHeaderIndex(headers, ["已撤数量", "撤单数量", "撤销量"])
  const idxStatus = findHeaderIndex(headers, ["状态", "成交状态", "委托状态", "撤单标志", "备注", "摘要"])

  // 过滤非交易流水（红利、送转股、配股缴款、新股中签、可转债转股等）
  const summary = idxStatus !== -1 ? String(row[idxStatus] ?? "").trim() : ""
  if (/(红利|股息|送转|送股|转增|配股|中签|新股|转债|转股|转托管|回购|质押|解冻)/.test(summary)) return true

  // 撤单/废单/未成交过滤（原有逻辑保留）

  const dealQty = idxDealQty !== -1 ? parseNumber(row[idxDealQty]) : NaN
  const entrustQty = idxEntrustQty !== -1 ? parseNumber(row[idxEntrustQty]) : NaN
  const withdrawQty = idxWithdrawQty !== -1 ? parseNumber(row[idxWithdrawQty]) : NaN
  const status = idxStatus !== -1 ? String(row[idxStatus] ?? "").trim() : ""

  if (idxDealQty !== -1 && dealQty === 0) return true
  if (idxEntrustQty !== -1 && idxWithdrawQty !== -1 && entrustQty > 0 && withdrawQty >= entrustQty) return true
  if (status && /(撤单|废单|未成交|失败|拒绝)/.test(status)) return true
  return false
}

export function parseTradeRecords(rows: unknown[][], fallbackDate?: string): TradeRecord[] {
  if (rows.length < 2) return []

  const headerInfo = findHeaderRow(rows)
  if (!headerInfo) {
    throw new Error("无法找到表头行。请确保文件前50行内包含“证券代码”、“日期”等列名。")
  }

  const { rowIndex, headers } = headerInfo
  const indices: Partial<Record<keyof TradeRecord, number>> = {}
  for (const [key, candidates] of Object.entries(HEADER_MAP)) {
    const idx = findHeaderIndex(headers, candidates)
    if (idx !== -1) {
      indices[key as keyof TradeRecord] = idx
    }
  }

  // Fuzzy fallback for date column
  if (indices.date == null) {
    const idx = headers.findIndex((h) => /(日期|date|day)/i.test(h))
    if (idx !== -1) indices.date = idx
  }

  // Fuzzy fallback for direction column
  if (indices.direction == null) {
    const idx = headers.findIndex((h) => /(买|卖|方向|操作|side|委托类型|类型|b\/s)/i.test(h))
    if (idx !== -1) indices.direction = idx
  }

  // Fallback: some brokers put datetime inside the "time" column (e.g. "2025-04-15 09:23:45")
  if (indices.date == null && indices.time != null) {
    for (let i = rowIndex + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue
      const timeVal = row[indices.time]
      if (timeVal != null && normalizeDate(timeVal)) {
        indices.date = indices.time
        break
      }
    }
  }

  // Fallback: use file date from filename if no date column found but time column exists
  if (indices.date == null && indices.time != null && fallbackDate) {
    indices.date = indices.time
  }

  if (indices.date == null || indices.code == null || indices.name == null) {
    const matched = Object.keys(indices).join(", ") || "无"
    const allKeys = Object.keys(HEADER_MAP) as (keyof TradeRecord)[]
    const unmatched = allKeys.filter((k) => indices[k] == null).join(", ")
    throw new Error(
      `无法识别交割单/委托单格式。已匹配字段：${matched}；未匹配字段：${unmatched}。请检查文件是否包含日期、证券代码、证券名称列。`
    )
  }

  const records: TradeRecord[] = []
  for (let i = rowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue
    if (row.every((cell) => cell == null || String(cell).trim() === "")) continue

    // 过滤未成交/撤单记录（委托单常见）
    if (isWithdrawn(row, headers)) continue

    let date = normalizeDate(row[indices.date!])
    // If date column is actually time column (no separate date column), use fallback date
    if (!date && fallbackDate && indices.time != null && indices.date === indices.time) {
      date = fallbackDate
    }
    if (!date) continue

    let direction = indices.direction != null ? parseDirection(row[indices.direction]) : null

    // Fallback: 若方向列缺失或无法识别，尝试从发生金额正负推断（买入扣钱为负，卖出收钱为正）
    if (direction === null && indices.totalCost != null) {
      const tc = parseNumber(row[indices.totalCost])
      if (tc < 0) direction = "buy"
      else if (tc > 0) direction = "sell"
    }

    // Fallback: 若方向仍无法识别，尝试从数量正负推断（部分券商用负数表示卖出）
    if (direction === null && indices.quantity != null) {
      const rawQty = parseNumber(row[indices.quantity])
      if (rawQty < 0) {
        direction = "sell"
      } else if (rawQty > 0) {
        direction = "buy"
      }
    }

    if (direction === null) {
      // 方向无法识别，跳过该记录（防止静默污染统计）
      const rawDir = String(row[indices.direction ?? 0] ?? "").trim()
      console.warn(`[trade-import] 第 ${i + 1} 行方向无法识别，已跳过: "${rawDir}" (code=${String(row[indices.code!] ?? "").trim()}, date=${date})`)
      continue
    }

    // 某些券商用负数数量表示卖出，统一取绝对值
    const quantity = indices.quantity != null ? Math.abs(parseNumber(row[indices.quantity])) : 0
    const price = indices.price != null ? parseNumber(row[indices.price]) : 0
    // 某些券商 CSV 中买入金额为负数，统一取绝对值
    const amount = Math.abs(indices.amount != null ? parseNumber(row[indices.amount]) : 0)
    const fee = indices.fee != null ? parseNumber(row[indices.fee]) : 0
    const stampTax = indices.stampTax != null ? parseNumber(row[indices.stampTax]) : 0
    const transferFee = indices.transferFee != null ? parseNumber(row[indices.transferFee]) : 0
    let totalCost = indices.totalCost != null ? parseNumber(row[indices.totalCost]) : 0

    // 若缺少发生金额，用成交金额+费用估算（买入记负，卖出记正）
    if (totalCost === 0 && (amount > 0 || fee > 0 || stampTax > 0 || transferFee > 0)) {
      const cost = amount + fee + stampTax + transferFee
      totalCost = direction === "buy" ? -cost : cost
    }

    records.push({
      date,
      time: indices.time != null ? String(row[indices.time] ?? "").trim() || undefined : undefined,
      code: String(row[indices.code!] ?? "").trim(),
      name: String(row[indices.name!] ?? "").trim(),
      direction,
      quantity,
      price,
      amount,
      fee,
      stampTax,
      transferFee,
      totalCost,
    })
  }

  // 合法性校验：即使表头识别成功，也可能列错位
  const validation = validateParsedRecords(records)
  if (!validation.valid) {
    const issues = validation.issues.join("；")
    throw new Error(`交割单解析异常：${issues}。请检查文件格式，或尝试手动调整列映射。`)
  }

  return records
}

export interface ValidationResult {
  valid: boolean
  issues: string[]
}

// ==================== 列类型推断（内容探测）====================

export type ColumnType =
  | "date"
  | "code"
  | "name"
  | "direction"
  | "quantity"
  | "price"
  | "amount"
  | "fee"
  | "stampTax"
  | "transferFee"
  | "totalCost"
  | "time"
  | "ignore"

export interface ColumnGuess {
  colIndex: number
  header: string
  guessedType: ColumnType
  confidence: number // 0-1
  sampleValues: string[]
}

export interface ImportPreview {
  headers: string[]
  guesses: ColumnGuess[]
  sampleRows: unknown[][]
  confidence: number // 整体置信度 0-1
  requiredMissing: ColumnType[] // 缺失的必需字段
}

const REQUIRED_FIELDS: ColumnType[] = ["date", "code", "name"]
const DIRECTION_FIELDS: ColumnType[] = ["direction", "quantity", "totalCost"]

function looksLikeDate(value: unknown): boolean {
  if (value == null) return false
  const str = String(value).trim()
  if (!str) return false
  // Excel serial date
  if (typeof value === "number" && value > 30000 && value < 60000) return true
  // Date patterns
  return /(\d{4})[-\/\.年](\d{1,2})[-\/\.月](\d{1,2})/.test(str) ||
    /(\d{2})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/.test(str)
}

function looksLikeCode(value: unknown): boolean {
  if (value == null) return false
  const str = String(value).trim()
  return /^\d{6}$/.test(str)
}

function looksLikeDirection(value: unknown): boolean {
  if (value == null) return false
  const str = String(value).trim().toLowerCase()
  if (!str) return false
  // 中文方向
  if (/^(买|卖出?|证券买|证券卖|b|s|buy|sell|多|空|正|负|[\+\-]1?)$/.test(str)) return true
  return false
}

function looksLikeNumber(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === "number" && !isNaN(value)) return true
  const str = String(value).replace(/,/g, "").replace(/[￥$¥]/g, "").trim()
  return str !== "" && !isNaN(parseFloat(str))
}

function looksLikePositiveInteger(value: unknown): boolean {
  if (!looksLikeNumber(value)) return false
  const num = parseNumber(value)
  return num > 0 && Number.isInteger(num)
}

function looksLikePrice(value: unknown): boolean {
  if (!looksLikeNumber(value)) return false
  const num = parseNumber(value)
  return num > 0 && num < 100000
}

function looksLikeAmount(value: unknown): boolean {
  if (!looksLikeNumber(value)) return false
  const num = parseNumber(value)
  return num >= 0 && num < 100000000
}

function looksLikeTime(value: unknown): boolean {
  if (value == null) return false
  const str = String(value).trim()
  return /\d{1,2}:\d{2}(:\d{2})?/.test(str)
}

function looksLikeName(value: unknown): boolean {
  if (value == null) return false
  const str = String(value).trim()
  // 中文名称或英文名称，不是纯数字
  return str.length > 0 && str.length <= 20 && !/^\d+(\.\d+)?$/.test(str)
}

function scoreColumn(values: unknown[], header: string): { type: ColumnType; confidence: number }[] {
  const nonNullValues = values.filter((v) => v != null && String(v).trim() !== "")
  if (nonNullValues.length === 0) return [{ type: "ignore", confidence: 1 }]

  const total = nonNullValues.length
  const results: { type: ColumnType; confidence: number }[] = []

  // Header name hint (strong signal)
  const normalizedHeader = normalizeHeader(header)
  const headerHints: Partial<Record<ColumnType, string[]>> = {
    date: ["日期", "date", "day", "时间"],
    time: ["时间", "time", "时刻"],
    code: ["代码", "code", "证券", "股票", "编号", "合约"],
    name: ["名称", "name", "简称", "证券名称", "股票名称"],
    direction: ["方向", "direction", "操作", "买卖", "side", "bs", "类型"],
    quantity: ["数量", "quantity", "volume", "股数", "手数", "份额"],
    price: ["价格", "price", "均价", "单价", "成交价"],
    amount: ["金额", "amount", "成交额", "总额", "清算"],
    fee: ["手续费", "佣金", "fee", "commission", "费用"],
    stampTax: ["印花税", "stamp", "税收", "印花"],
    transferFee: ["过户费", "transfer", "杂费"],
    totalCost: ["发生金额", "total", "净额", "资金"],
  }

  const headerBonus: Partial<Record<ColumnType, number>> = {}
  for (const [type, hints] of Object.entries(headerHints)) {
    for (const hint of hints) {
      if (normalizedHeader.includes(hint.toLowerCase())) {
        headerBonus[type as ColumnType] = 0.3
        break
      }
    }
  }

  // Date
  const dateCount = nonNullValues.filter(looksLikeDate).length
  if (dateCount / total > 0.5) {
    results.push({ type: "date", confidence: Math.min(1, dateCount / total + (headerBonus.date || 0)) })
  }

  // Time
  const timeCount = nonNullValues.filter(looksLikeTime).length
  if (timeCount / total > 0.5 && !normalizedHeader.includes("日期")) {
    results.push({ type: "time", confidence: Math.min(1, timeCount / total + (headerBonus.time || 0)) })
  }

  // Code
  const codeCount = nonNullValues.filter(looksLikeCode).length
  if (codeCount / total > 0.3) {
    results.push({ type: "code", confidence: Math.min(1, codeCount / total + (headerBonus.code || 0)) })
  }

  // Name
  const nameCount = nonNullValues.filter(looksLikeName).length
  if (nameCount / total > 0.5) {
    results.push({ type: "name", confidence: Math.min(1, nameCount / total + (headerBonus.name || 0)) })
  }

  // Direction
  const dirCount = nonNullValues.filter(looksLikeDirection).length
  if (dirCount / total > 0.3) {
    results.push({ type: "direction", confidence: Math.min(1, dirCount / total + (headerBonus.direction || 0)) })
  }

  // Quantity
  const qtyCount = nonNullValues.filter(looksLikePositiveInteger).length
  if (qtyCount / total > 0.5) {
    results.push({ type: "quantity", confidence: Math.min(1, qtyCount / total + (headerBonus.quantity || 0)) })
  }

  // Price
  const priceCount = nonNullValues.filter(looksLikePrice).length
  if (priceCount / total > 0.5) {
    results.push({ type: "price", confidence: Math.min(1, priceCount / total + (headerBonus.price || 0)) })
  }

  // Amount
  const amountCount = nonNullValues.filter(looksLikeAmount).length
  if (amountCount / total > 0.5) {
    results.push({ type: "amount", confidence: Math.min(1, amountCount / total + (headerBonus.amount || 0)) })
  }

  // Fee
  const feeCount = nonNullValues.filter(looksLikeNumber).length
  if (feeCount / total > 0.5 && (headerBonus.fee || normalizedHeader.includes("费") || normalizedHeader.includes("佣"))) {
    results.push({ type: "fee", confidence: Math.min(1, feeCount / total + (headerBonus.fee || 0)) })
  }

  // Stamp tax
  if (feeCount / total > 0.5 && (headerBonus.stampTax || normalizedHeader.includes("印花"))) {
    results.push({ type: "stampTax", confidence: Math.min(1, feeCount / total + (headerBonus.stampTax || 0)) })
  }

  // Transfer fee
  if (feeCount / total > 0.5 && (headerBonus.transferFee || normalizedHeader.includes("过户"))) {
    results.push({ type: "transferFee", confidence: Math.min(1, feeCount / total + (headerBonus.transferFee || 0)) })
  }

  // Total cost
  if (feeCount / total > 0.5 && (headerBonus.totalCost || normalizedHeader.includes("发生") || normalizedHeader.includes("净额"))) {
    results.push({ type: "totalCost", confidence: Math.min(1, feeCount / total + (headerBonus.totalCost || 0)) })
  }

  if (results.length === 0) {
    results.push({ type: "ignore", confidence: 1 })
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}

/**
 * 生成导入预览信息，用于预览对话框。
 * 当表头名匹配失败时，通过内容探测推断列类型。
 */
export function generateImportPreview(rows: unknown[][]): ImportPreview | null {
  if (rows.length < 2) return null

  // 先尝试找表头行
  let headerInfo = findHeaderRow(rows)
  let headers: string[]
  let dataStartIndex: number

  if (headerInfo) {
    headers = headerInfo.headers
    dataStartIndex = headerInfo.rowIndex + 1
  } else {
    // 没有明显表头，用第一行作为表头（如果看起来像表头）
    // 或者生成默认列名
    const firstRow = rows[0]
    if (Array.isArray(firstRow) && firstRow.length >= 3) {
      // 检查第一行是否像数据（比如有日期、代码等）
      const looksLikeDataRow = firstRow.some((cell) => looksLikeDate(cell) || looksLikeCode(cell))
      if (looksLikeDataRow) {
        // 第一行是数据，生成默认列名
        headers = firstRow.map((_, i) => `列${i + 1}`)
        dataStartIndex = 0
      } else {
        // 第一行可能是表头
        headers = firstRow.map((h) => String(h ?? ""))
        dataStartIndex = 1
      }
    } else {
      return null
    }
  }

  // 收集每列的样本数据（最多 5 行）
  const sampleRows: unknown[][] = []
  const columnValues: unknown[][] = Array.from({ length: headers.length }, () => [])

  for (let i = dataStartIndex; i < rows.length && sampleRows.length < 5; i++) {
    const row = rows[i]
    if (!Array.isArray(row) || row.length === 0) continue
    if (row.every((cell) => cell == null || String(cell).trim() === "")) continue
    sampleRows.push(row)
    for (let j = 0; j < headers.length && j < row.length; j++) {
      columnValues[j].push(row[j])
    }
  }

  // 推断每列类型
  const guesses: ColumnGuess[] = []
  for (let i = 0; i < headers.length; i++) {
    const scored = scoreColumn(columnValues[i], headers[i])
    const best = scored[0]
    guesses.push({
      colIndex: i,
      header: headers[i],
      guessedType: best.type,
      confidence: best.confidence,
      sampleValues: columnValues[i].slice(0, 3).map((v) => String(v ?? "").slice(0, 20)),
    })
  }

  // 检查必需字段
  const foundTypes = new Set(guesses.map((g) => g.guessedType))
  const requiredMissing = REQUIRED_FIELDS.filter((f) => !foundTypes.has(f))

  // 检查方向字段（至少需要一个方向识别方式）
  const hasDirection = DIRECTION_FIELDS.some((f) => foundTypes.has(f))
  if (!hasDirection) {
    requiredMissing.push("direction")
  }

  // 计算整体置信度
  const requiredGuesses = guesses.filter((g) =>
    [...REQUIRED_FIELDS, ...DIRECTION_FIELDS].includes(g.guessedType)
  )
  const confidence = requiredGuesses.length > 0
    ? requiredGuesses.reduce((sum, g) => sum + g.confidence, 0) / requiredGuesses.length
    : 0

  return {
    headers,
    guesses,
    sampleRows,
    confidence,
    requiredMissing,
  }
}

/**
 * 根据用户确认的列映射解析交易记录。
 * 用于预览对话框确认后的导入。
 */
export function parseTradeRecordsWithMapping(
  rows: unknown[][],
  mapping: Record<ColumnType, number | null>,
  headerRowIndex: number = 0
): TradeRecord[] {
  const records: TradeRecord[] = []

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue
    if (row.every((cell) => cell == null || String(cell).trim() === "")) continue

    const date = mapping.date != null ? normalizeDate(row[mapping.date]) : ""
    if (!date) continue

    const code = mapping.code != null ? String(row[mapping.code] ?? "").trim() : ""
    if (!code) continue

    let direction: TradeRecord["direction"] | null = null
    if (mapping.direction != null) {
      direction = parseDirection(row[mapping.direction])
    }

    // Fallback: 从发生金额推断
    if (direction === null && mapping.totalCost != null) {
      const tc = parseNumber(row[mapping.totalCost])
      if (tc < 0) direction = "buy"
      else if (tc > 0) direction = "sell"
    }

    // Fallback: 从数量正负推断
    if (direction === null && mapping.quantity != null) {
      const rawQty = parseNumber(row[mapping.quantity])
      if (rawQty < 0) direction = "sell"
      else if (rawQty > 0) direction = "buy"
    }

    if (direction === null) continue

    const quantity = mapping.quantity != null ? Math.abs(parseNumber(row[mapping.quantity])) : 0
    const price = mapping.price != null ? parseNumber(row[mapping.price]) : 0
    const amount = Math.abs(mapping.amount != null ? parseNumber(row[mapping.amount]) : 0)
    const fee = mapping.fee != null ? parseNumber(row[mapping.fee]) : 0
    const stampTax = mapping.stampTax != null ? parseNumber(row[mapping.stampTax]) : 0
    const transferFee = mapping.transferFee != null ? parseNumber(row[mapping.transferFee]) : 0
    let totalCost = mapping.totalCost != null ? parseNumber(row[mapping.totalCost]) : 0

    if (totalCost === 0 && (amount > 0 || fee > 0 || stampTax > 0 || transferFee > 0)) {
      const cost = amount + fee + stampTax + transferFee
      totalCost = direction === "buy" ? -cost : cost
    }

    records.push({
      date,
      time: mapping.time != null ? String(row[mapping.time] ?? "").trim() || undefined : undefined,
      code,
      name: mapping.name != null ? String(row[mapping.name] ?? "").trim() : code,
      direction,
      quantity,
      price,
      amount,
      fee,
      stampTax,
      transferFee,
      totalCost,
    })
  }

  return records
}

function validateParsedRecords(records: TradeRecord[]): ValidationResult {
  const issues: string[] = []
  if (records.length === 0) {
    issues.push("未解析到任何交易记录")
    return { valid: false, issues }
  }

  // 日期格式检查：大部分应该是 YYYY-MM-DD
  const dateLike = records.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)).length
  if (dateLike / records.length < 0.7) {
    issues.push(`日期格式异常（仅 ${Math.round((dateLike / records.length) * 100)}% 符合 YYYY-MM-DD），可能列识别错位`)
  }

  // 代码格式检查：A 股通常是 6 位数字
  const codeLike = records.filter((r) => /^\d{6}$/.test(r.code)).length
  if (codeLike / records.length < 0.5) {
    issues.push(`证券代码格式异常（仅 ${Math.round((codeLike / records.length) * 100)}% 为 6 位数字），可能列识别错位`)
  }

  // 方向检查
  const dirKnown = records.filter((r) => r.direction === "buy" || r.direction === "sell").length
  if (dirKnown / records.length < 0.8) {
    issues.push(`买卖方向识别率过低（仅 ${Math.round((dirKnown / records.length) * 100)}%），建议检查字段映射`)
  }

  // 数量正数检查
  const qtyPositive = records.filter((r) => r.quantity > 0).length
  if (qtyPositive / records.length < 0.8) {
    issues.push(`成交数量存在大量非正值（仅 ${Math.round((qtyPositive / records.length) * 100)}% 为正），可能列识别错位`)
  }

  // 金额合理性检查
  const amountPositive = records.filter((r) => r.amount >= 0).length
  if (amountPositive / records.length < 0.8) {
    issues.push(`成交金额存在大量负值（仅 ${Math.round((amountPositive / records.length) * 100)}% 为非负），可能列识别错位`)
  }

  return { valid: issues.length === 0, issues }
}

export function detectEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  // Check BOM
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return "utf-8"
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return "utf-16le"
  }
  // Heuristic: if contains valid UTF-8 multi-byte sequences, likely UTF-8
  // Otherwise assume GBK (most Chinese broker exports)
  let i = 0
  let utf8MultiByte = 0
  let invalidUtf8 = 0
  while (i < bytes.length) {
    const b = bytes[i]
    if (b >= 0x80) {
      // Potential multi-byte UTF-8
      if (b >= 0xC0 && b <= 0xDF && i + 1 < bytes.length && (bytes[i + 1] & 0xC0) === 0x80) {
        utf8MultiByte++
        i += 2
        continue
      }
      if (b >= 0xE0 && b <= 0xEF && i + 2 < bytes.length &&
          (bytes[i + 1] & 0xC0) === 0x80 && (bytes[i + 2] & 0xC0) === 0x80) {
        utf8MultiByte++
        i += 3
        continue
      }
      invalidUtf8++
    }
    i++
  }
  // If more than 10% of high bytes are invalid UTF-8, assume GBK
  const highBytes = bytes.filter((b) => b >= 0x80).length
  if (highBytes > 0 && invalidUtf8 / highBytes > 0.1) {
    return "gbk"
  }
  return "utf-8"
}

function decodeBuffer(buffer: ArrayBuffer): string {
  const encoding = detectEncoding(buffer)
  try {
    return new TextDecoder(encoding).decode(buffer)
  } catch {
    return new TextDecoder("utf-8").decode(buffer)
  }
}

export function parseTradeCSV(content: string | ArrayBuffer): TradeRecord[] {
  const text = typeof content === "string" ? content : decodeBuffer(content)
  const result = Papa.parse<unknown[]>(text, {
    skipEmptyLines: true,
  })
  return parseTradeRecords(result.data)
}

function fixGbkString(str: string): string {
  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff
  }
  try {
    return new TextDecoder("gbk").decode(bytes)
  } catch {
    return str
  }
}

function fixGbkRows(rows: unknown[][]): unknown[][] {
  return rows.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => (typeof cell === "string" ? fixGbkString(cell) : cell))
      : row
  )
}

export function parseTradeExcel(arrayBuffer: ArrayBuffer, fileName?: string): TradeRecord[] {
  // 先检测是否是伪 Excel（TSV/CSV 文本伪装成 .xls）
  // 特征：文件以 =" 开头（券商常见格式），或包含大量制表符且不是 HTML
  const firstBytes = new Uint8Array(arrayBuffer.slice(0, 20))
  const startsWithQuote = firstBytes[0] === 0x3D && firstBytes[1] === 0x22 // ="

  // 尝试从文件名提取日期（如 20260422当日成交查询.xls → 2026-04-22）
  let fileDate = ""
  if (fileName) {
    const dateMatch = fileName.match(/(\d{4})(\d{2})(\d{2})/)
    if (dateMatch) {
      fileDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    }
  }

  let rows: unknown[][] = []

  // 如果是伪 Excel，直接用 GBK 解码并按 TSV 解析
  if (startsWithQuote) {
    try {
      const text = new TextDecoder("gbk").decode(new Uint8Array(arrayBuffer))
      rows = text.split(/\r?\n/).map((line) =>
        line.split("\t").map((cell) => {
          // 去掉 ="..." 包裹
          const trimmed = cell.trim()
          if (trimmed.startsWith('="') && trimmed.endsWith('"')) {
            return trimmed.slice(2, -1)
          }
          return trimmed
        })
      )
      if (findHeaderRow(rows)) {
        return parseTradeRecords(rows, fileDate)
      }
    } catch {}
  }

  // 第一次尝试默认解析
  let workbook = XLSX.read(arrayBuffer, { type: "array" })
  let sheet = workbook.Sheets[workbook.SheetNames[0]]
  rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  // 如果找不到表头，尝试用中文 codepage 936 重新解析
  if (!findHeaderRow(rows)) {
    try {
      workbook = XLSX.read(arrayBuffer, { type: "array", codepage: 936 })
      sheet = workbook.Sheets[workbook.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
    } catch {}
  }

  // 如果还是找不到，尝试手动 GBK 编码修复
  if (!findHeaderRow(rows)) {
    try {
      rows = fixGbkRows(rows)
    } catch {}
  }

  // 最后尝试 1：有些券商导出的是 HTML 表格伪装成 .xls
  if (!findHeaderRow(rows)) {
    try {
      const text = new TextDecoder("gbk").decode(new Uint8Array(arrayBuffer))
      // 检测 HTML 内容：table 标签、div 表格布局、或任何 HTML 结构
      const isHtml = /<(table|TABLE|div|DIV|html|HTML|body|BODY)/.test(text) ||
                     text.includes("</tr>") ||
                     text.includes("</td>")
      if (isHtml) {
        workbook = XLSX.read(text, { type: "string" })
        sheet = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
      }
    } catch {}
  }

  // 最后尝试 2：纯文本 TSV（制表符分隔）伪装成 .xls（常见于国内券商）
  if (!findHeaderRow(rows)) {
    try {
      const text = new TextDecoder("gbk").decode(new Uint8Array(arrayBuffer))
      if (text.includes("\t") && !text.includes("<table") && !text.includes("<TABLE")) {
        rows = text.split(/\r?\n/).map((line) => line.split("\t"))
      }
    } catch {}
  }

  return parseTradeRecords(rows, fileDate)
}

export function groupRecordsByDate(records: TradeRecord[]): Map<string, TradeRecord[]> {
  const map = new Map<string, TradeRecord[]>()
  for (const r of records) {
    const list = map.get(r.date) ?? []
    list.push(r)
    map.set(r.date, list)
  }
  return map
}

// ==================== FIFO 持仓盈亏计算 ====================

interface Lot {
  quantity: number
  costPerShare: number // (成交金额 + 全部费用) / 数量
}

/**
 * 基于先进先出(FIFO)计算每日已实现盈亏。
 * 买入增加持仓批次，卖出按最早批次扣减并计算盈亏。
 * 返回 Map<日期, 当日已实现盈亏>
 *
 * ⚠️ 边界限制：本算法假设所有记录均为普通买卖交易。
 * 不支持 A 股特殊场景：送股、转增股、现金分红、配股缴款、新股中签/缴款、可转债转股等。
 * 这些行为会导致持仓成本或数量突变，从而使 FIFO 盈亏计算结果错乱。
 * 建议：如交割单中包含此类记录，应通过摘要/备注列提前过滤，或在 wiki 中手动标注并调整持仓成本。
 */
export function calculateFifoPnL(allRecords: TradeRecord[]): { datePnL: Map<string, number>; hasUnknownCost: boolean } {
  const sorted = [...allRecords].sort((a, b) => {
    const dtA = `${a.date}T${a.time || "00:00:00"}`
    const dtB = `${b.date}T${b.time || "00:00:00"}`
    return dtA.localeCompare(dtB)
  })

  const holdings = new Map<string, Lot[]>()
  const datePnL = new Map<string, number>()
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
      let remainingQty = r.quantity
      let soldCost = 0

      while (remainingQty > 0 && lots.length > 0) {
        const lot = lots[0]
        const deduct = Math.min(remainingQty, lot.quantity)
        soldCost += deduct * lot.costPerShare
        lot.quantity -= deduct
        remainingQty -= deduct
        if (lot.quantity <= 0) lots.shift()
      }

      holdings.set(r.code, lots)

      if (remainingQty > 0) {
        // 卖出数量超过已知持仓 — 缺少期初持仓，成本未知
        hasUnknownCost = true
        // 只计算已知成本匹配部分的盈亏（按成交额比例分摊费用）
        const matchedQty = r.quantity - remainingQty
        if (matchedQty > 0) {
          const ratio = matchedQty / r.quantity
          const matchedAmount = r.amount * ratio
          const matchedFee = r.fee * ratio
          const matchedStamp = r.stampTax * ratio
          const matchedTransfer = r.transferFee * ratio
          const realizedPnL = matchedAmount - soldCost - matchedFee - matchedStamp - matchedTransfer
          datePnL.set(r.date, (datePnL.get(r.date) ?? 0) + realizedPnL)
        }
      } else {
        // 全部有成本 basis，正常计算
        const realizedPnL = r.amount - soldCost - r.fee - r.stampTax - r.transferFee
        datePnL.set(r.date, (datePnL.get(r.date) ?? 0) + realizedPnL)
      }
    }
  }

  return { datePnL, hasUnknownCost }
}

// ==================== Markdown 生成 ====================

function formatMoney(n: number): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function buildTradeMarkdown(date: string, records: TradeRecord[], realizedPnL?: number): string {
  const sorted = [...records].sort((a, b) => (a.time || "").localeCompare(b.time || ""))
  const lines: string[] = [`# 交割单 — ${date}`, ""]
  lines.push("| 时间 | 代码 | 名称 | 方向 | 数量 | 价格 | 金额 | 手续费 | 印花税 | 过户费 |")
  lines.push("|------|------|------|------|------|------|------|--------|--------|--------|")

  for (const r of sorted) {
    const time = r.time || "—"
    const dir = r.direction === "buy" ? "买入" : "卖出"
    lines.push(
      `| ${time} | ${r.code} | ${r.name} | ${dir} | ${r.quantity} | ${formatMoney(r.price)} | ${formatMoney(r.amount)} | ${formatMoney(r.fee)} | ${formatMoney(r.stampTax)} | ${formatMoney(r.transferFee)} |`
    )
  }

  // Stats
  const buyRecords = records.filter((r) => r.direction === "buy")
  const sellRecords = records.filter((r) => r.direction === "sell")
  const totalFee = records.reduce((s, r) => s + r.fee, 0)
  const totalStamp = records.reduce((s, r) => s + r.stampTax, 0)
  const totalTransfer = records.reduce((s, r) => s + r.transferFee, 0)
  const buyAmount = buyRecords.reduce((s, r) => s + r.amount, 0)
  const sellAmount = sellRecords.reduce((s, r) => s + r.amount, 0)

  // 若提供了 FIFO 已实现盈亏则使用，否则 fallback 到发生金额求和
  const netPnL = realizedPnL !== undefined ? realizedPnL : records.reduce((s, r) => s + r.totalCost, 0)

  lines.push("")
  lines.push("## 汇总")
  lines.push(`- 成交笔数：${records.length}`)
  lines.push(`- 买入金额：${formatMoney(buyAmount)}`)
  lines.push(`- 卖出金额：${formatMoney(sellAmount)}`)
  lines.push(`- 手续费：${formatMoney(totalFee)}`)
  lines.push(`- 印花税：${formatMoney(totalStamp)}`)
  lines.push(`- 过户费：${formatMoney(totalTransfer)}`)
  lines.push(`- 净盈亏：${netPnL >= 0 ? "+" : ""}${formatMoney(netPnL)}`)
  lines.push("")

  return lines.join("\n")
}

export function buildTradeSummaryForReview(date: string, records: TradeRecord[], realizedPnL?: number): string {
  const buyRecords = records.filter((r) => r.direction === "buy")
  const sellRecords = records.filter((r) => r.direction === "sell")
  const totalFee = records.reduce((s, r) => s + r.fee, 0)
  const totalStamp = records.reduce((s, r) => s + r.stampTax, 0)
  const totalTransfer = records.reduce((s, r) => s + r.transferFee, 0)
  const buyAmount = buyRecords.reduce((s, r) => s + r.amount, 0)
  const sellAmount = sellRecords.reduce((s, r) => s + r.amount, 0)
  const netPnL = realizedPnL !== undefined ? realizedPnL : records.reduce((s, r) => s + r.totalCost, 0)

  return [
    `## 当日交易汇总（${date}）`,
    "",
    `- 成交笔数：${records.length}（买入 ${buyRecords.length} / 卖出 ${sellRecords.length}）`,
    `- 买入金额：${formatMoney(buyAmount)}`,
    `- 卖出金额：${formatMoney(sellAmount)}`,
    `- 交易成本：手续费 ${formatMoney(totalFee)} + 印花税 ${formatMoney(totalStamp)} + 过户费 ${formatMoney(totalTransfer)} = ${formatMoney(totalFee + totalStamp + totalTransfer)}`,
    `- 净盈亏：${netPnL >= 0 ? "+" : ""}${formatMoney(netPnL)}`,
    "",
    "### 持仓变动",
    ...records.map((r) => `- ${r.direction === "buy" ? "买入" : "卖出"} [[${r.name}]]（${r.code}） ${r.quantity} 股 @ ${formatMoney(r.price)}`),
    "",
  ].join("\n")
}
