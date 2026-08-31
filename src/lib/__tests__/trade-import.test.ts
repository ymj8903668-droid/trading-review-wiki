import { describe, it, expect } from "vitest"
import {
  parseTradeCSV,
  parseTradeFile,
  groupRecordsByDate,
  buildTradeMarkdown,
  buildTradeSummaryForReview,
} from "../trade-import"

describe("Trade Import", () => {
  const sampleCSV = [
    "日期,时间,证券代码,证券名称,买卖方向,成交数量,成交价格,成交金额,手续费,印花税,过户费,发生金额",
    "2025-04-14,09:31:00,000001,平安银行,买入,1000,10.50,10500.00,5.25,0.00,0.10,10505.35",
    "2025-04-14,14:30:00,000001,平安银行,卖出,500,10.80,5400.00,2.70,5.40,0.05,-5392.15",
    "2025-04-15,10:00:00,600519,贵州茅台,买入,100,1500.00,150000.00,75.00,0.00,0.20,150075.20",
  ].join("\n")

  it("parses CSV with Chinese headers", () => {
    const records = parseTradeCSV(sampleCSV)
    expect(records).toHaveLength(3)

    const first = records[0]
    expect(first.date).toBe("2025-04-14")
    expect(first.time).toBe("09:31:00")
    expect(first.code).toBe("000001")
    expect(first.name).toBe("平安银行")
    expect(first.direction).toBe("buy")
    expect(first.quantity).toBe(1000)
    expect(first.price).toBe(10.5)
    expect(first.amount).toBe(10500)
    expect(first.fee).toBe(5.25)
    expect(first.stampTax).toBe(0)
    expect(first.transferFee).toBe(0.1)
    expect(first.totalCost).toBe(10505.35)

    const second = records[1]
    expect(second.direction).toBe("sell")
    expect(second.totalCost).toBe(-5392.15)
  })

  it("groups records by date", () => {
    const records = parseTradeCSV(sampleCSV)
    const grouped = groupRecordsByDate(records)
    expect(grouped.size).toBe(2)
    expect(grouped.get("2025-04-14")?.length).toBe(2)
    expect(grouped.get("2025-04-15")?.length).toBe(1)
  })

  it("builds markdown with summary", () => {
    const records = parseTradeCSV(sampleCSV).filter((r) => r.date === "2025-04-14")
    const md = buildTradeMarkdown("2025-04-14", records)

    expect(md).toContain("# 交割单 — 2025-04-14")
    expect(md).toContain("平安银行")
    expect(md).toContain("买入")
    expect(md).toContain("卖出")
    expect(md).toContain("汇总")
    expect(md).toContain("成交笔数：2")
    expect(md).toContain("买入金额：10,500.00")
    expect(md).toContain("卖出金额：5,400.00")
    expect(md).toContain("净盈亏：")
  })

  it("builds review summary", () => {
    const records = parseTradeCSV(sampleCSV).filter((r) => r.date === "2025-04-14")
    const summary = buildTradeSummaryForReview("2025-04-14", records)

    expect(summary).toContain("当日交易汇总（2025-04-14）")
    expect(summary).toContain("成交笔数：2")
    expect(summary).toContain("买入")
    expect(summary).toContain("卖出")
    expect(summary).toContain("平安银行")
  })

  it("normalizes slash-separated dates", () => {
    const csv = [
      "日期,证券代码,证券名称,买卖方向,成交数量,成交价格,成交金额,手续费,印花税,过户费,发生金额",
      "2025/04/14,000001,平安银行,买入,100,10,1000,1,0,0,1001",
    ].join("\n")
    const records = parseTradeCSV(csv)
    expect(records[0].date).toBe("2025-04-14")
  })

  it("handles missing optional columns gracefully", () => {
    const csv = [
      "日期,证券代码,证券名称,买卖方向,成交数量,成交价格,成交金额",
      "2025-04-14,000001,平安银行,买入,100,10,1000",
    ].join("\n")
    const records = parseTradeCSV(csv)
    expect(records).toHaveLength(1)
    expect(records[0].fee).toBe(0)
    expect(records[0].stampTax).toBe(0)
    expect(records[0].transferFee).toBe(0)
    expect(records[0].totalCost).toBe(-1000)
  })

  it("throws when required headers are missing", () => {
    const csv = [
      "未知列1,未知列2",
      "a,b",
    ].join("\n")
    expect(() => parseTradeCSV(csv)).toThrow("无法找到表头行")
  })

  it("infers direction from totalCost sign when direction column is absent", () => {
    const csv = [
      "日期,证券代码,证券名称,成交数量,成交价格,成交金额,发生金额",
      "2025-04-14,000001,平安银行,100,10,1000,-1005",
      "2025-04-15,000001,平安银行,100,10,1000,995",
    ].join("\n")
    const records = parseTradeCSV(csv)
    expect(records).toHaveLength(2)
    expect(records[0].direction).toBe("buy")
    expect(records[1].direction).toBe("sell")
  })

  it("filters non-trade records (dividends, bonuses, rights)", () => {
    // 方向列和摘要列分开，避免 direction fallback 误判
    const csv = [
      "日期,时间,证券代码,证券名称,买卖方向,成交数量,成交价格,成交金额,手续费,印花税,过户费,发生金额,备注",
      "2025-04-14,09:31:00,000001,平安银行,买入,100,10,1000,1,0,0,1001,",
      "2025-04-14,10:00:00,000001,平安银行,,0,0,0,0,0,0,0,红利入账",
      "2025-04-14,11:00:00,000001,平安银行,,0,0,0,0,0,0,0,送股",
      "2025-04-15,09:31:00,000001,平安银行,卖出,100,11,1100,1,1,0,1098,",
    ].join("\n")
    const records = parseTradeCSV(csv)
    expect(records).toHaveLength(2)
    expect(records[0].direction).toBe("buy")
    expect(records[1].direction).toBe("sell")
  })

  it("throws on validation failure for malformed data", () => {
    const csv = [
      "日期,证券代码,证券名称,买卖方向,成交数量,成交价格,成交金额",
      "not-a-date,ABC123,Test,未知,0,0,0",
    ].join("\n")
    expect(() => parseTradeCSV(csv)).toThrow("交割单解析异常")
  })

  it("finds header row beyond line 20", () => {
    // 模拟券商文件：前面有账户信息、空行，表头在第25行
    const lines: string[] = []
    for (let i = 0; i < 24; i++) {
      lines.push(`账户信息行${i + 1},,,,,,,,,,,`)
    }
    lines.push("日期,时间,证券代码,证券名称,买卖方向,成交数量,成交价格,成交金额,手续费,印花税,过户费,发生金额")
    lines.push("2025-04-14,09:31:00,000001,平安银行,买入,100,10,1000,1,0,0,1001")
    const csv = lines.join("\n")
    const records = parseTradeCSV(csv)
    expect(records).toHaveLength(1)
    expect(records[0].code).toBe("000001")
  })

  const issue1Header = "日期,时间,证券代码,证券名称,买卖方向,成交数量,成交编号,成交价格,成交金额,余额,发生金额,手续费,印花税,发生金额,合同编号,过户费,交易市场,市场代码"
  const issue1Row = "20260417,09:39:46,000973,佛塑科技,证券买入,200,123456789,18.74,3748,10000,-3753.04,5,0,-3753.04,C1,0.04,深圳A股,0"

  it("parses issue #1 headers with 证券买入 and compact YYYYMMDD dates", () => {
    const records = parseTradeCSV([issue1Header, issue1Row].join("\n"))
    expect(records).toHaveLength(1)
    expect(records[0].date).toBe("2026-04-17")
    expect(records[0].code).toBe("000973")
    expect(records[0].direction).toBe("buy")
    expect(records[0].quantity).toBe(200)
    expect(records[0].price).toBe(18.74)
  })

  it("parses tab-separated content even when named like a csv", () => {
    const tsv = [
      issue1Header.replaceAll(",", "\t"),
      issue1Row.replaceAll(",", "\t"),
    ].join("\n")
    const records = parseTradeCSV(tsv)
    expect(records).toHaveLength(1)
    expect(records[0].code).toBe("000973")
    expect(records[0].direction).toBe("buy")
  })

  it("parses semicolon-separated european-style csv", () => {
    const csv = [
      issue1Header.replaceAll(",", ";"),
      issue1Row.replaceAll(",", ";"),
    ].join("\n")
    const records = parseTradeCSV(csv)
    expect(records).toHaveLength(1)
    expect(records[0].code).toBe("000973")
  })

  const mixedHtml = `<html><body><table>
<tr><td>日期</td><td>时间</td><td>证券代码</td><td>证券名称</td><td>买卖方向</td><td>成交数量</td><td>成交价格</td><td>成交金额</td></tr>
<tr><td>20260417</td><td>09:39:46</td><td>000973</td><td>佛塑科技</td><td>证券买入</td><td>200</td><td>18.74</td><td>3748</td></tr>
<tr><td>2025-04-15</td><td>10:00:00</td><td>002415</td><td>海康威视</td><td>买入</td><td>100</td><td>31.50</td><td>3,150.00</td></tr>
<tr><td>2025/04/16</td><td>11:00:00</td><td>300750</td><td>宁德时代</td><td>卖出</td><td>50</td><td>180.20</td><td>9010</td></tr>
<tr><td>2025.04.17</td><td>14:00:00</td><td>600519</td><td>贵州茅台</td><td>买入</td><td>10</td><td>1500.00</td><td>15000</td></tr>
</table></body></html>`

  it("parses an HTML table saved as csv", () => {
    const html = `<html><body><table>
<tr><td>日期</td><td>时间</td><td>证券代码</td><td>证券名称</td><td>买卖方向</td><td>成交数量</td><td>成交价格</td><td>成交金额</td></tr>
<tr><td>20260417</td><td>09:39:46</td><td>000973</td><td>佛塑科技</td><td>证券买入</td><td>200</td><td>18.74</td><td>3748</td></tr>
</table></body></html>`
    const records = parseTradeCSV(html)
    expect(records).toHaveLength(1)
    expect(records[0].code).toBe("000973")
    expect(records[0].direction).toBe("buy")
    expect(records[0].date).toBe("2026-04-17")
  })

  it("preserves leading-zero A-share codes in a mixed HTML table", () => {
    const records = parseTradeCSV(mixedHtml)
    expect(records.map((r) => r.code)).toEqual(["000973", "002415", "300750", "600519"])
    expect(records[0].date).toBe("2026-04-17")
    expect(records[0].price).toBe(18.74)
    expect(records[0].amount).toBe(3748)
    expect(records[1].date).toBe("2025-04-15")
    expect(records[1].amount).toBe(3150)
    expect(records[2].date).toBe("2025-04-16")
    expect(records[2].direction).toBe("sell")
    expect(records[3].date).toBe("2025-04-17")
    expect(records[3].price).toBe(1500)
  })

  it("preserves leading-zero codes when HTML is sniffed from an ArrayBuffer", () => {
    const buffer = new TextEncoder().encode(mixedHtml).buffer
    const records = parseTradeFile(buffer, "交割单.csv")
    expect(records.map((r) => r.code)).toEqual(["000973", "002415", "300750", "600519"])
  })

  it("surfaces the real HTML validation error instead of a missing-header red herring", () => {
    const html = `<html><body><table>
<tr><td>日期</td><td>证券代码</td><td>证券名称</td><td>买卖方向</td><td>成交数量</td><td>成交价格</td><td>成交金额</td></tr>
<tr><td>2026-04-17</td><td>ABC</td><td>测试</td><td>买入</td><td>100</td><td>10</td><td>1000</td></tr>
</table></body></html>`
    expect(() => parseTradeCSV(html)).toThrow(/交割单解析异常|证券代码格式异常/)
    expect(() => parseTradeCSV(html)).not.toThrow("无法找到表头行")
  })

  it("sniffs a TSV ArrayBuffer regardless of .csv filename", () => {
    const tsv = [
      issue1Header.replaceAll(",", "\t"),
      issue1Row.replaceAll(",", "\t"),
    ].join("\n")
    const buffer = new TextEncoder().encode(tsv).buffer
    const records = parseTradeFile(buffer, "交割单.csv")
    expect(records).toHaveLength(1)
    expect(records[0].name).toBe("佛塑科技")
    expect(records[0].quantity).toBe(200)
  })

  it("throws instead of returning empty when the file has no table", () => {
    expect(() => parseTradeCSV("not a table")).toThrow("无法找到表头行")
  })
})
