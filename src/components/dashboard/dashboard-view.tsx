import { useEffect, useState, useMemo } from "react"
import { useWikiStore } from "@/stores/wiki-store"
import { listDirectory, readFile } from "@/commands/fs"
import { normalizePath, getFileName } from "@/lib/path-utils"
import {
  parseTradeMarkdown,
  computeDashboardStats,
  calculateCurrentHoldings,
  formatMoney,
  type TradeDayStats,
  type MonthlyStat,
  type StockStat,
  type OverallStats,
  type Holding,
  type OpeningPosition,
} from "@/lib/trade-stats"
import { loadOpeningPositions, saveOpeningPositions } from "@/lib/trade-persist"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts"
import { TrendingUp, TrendingDown, Activity, Percent, Calendar, BarChart3, Wallet, Package, Trash2, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function DashboardView() {
  const project = useWikiStore((s) => s.project)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dayStats, setDayStats] = useState<TradeDayStats[]>([])
  const [activeTab, setActiveTab] = useState<"stats" | "holdings">("stats")
  const [marketPrices, setMarketPrices] = useState<Record<string, string>>({})
  const [openingPositions, setOpeningPositions] = useState<OpeningPosition[]>([])
  const [showOpForm, setShowOpForm] = useState(false)
  const [opForm, setOpForm] = useState<OpeningPosition>({
    code: "",
    name: "",
    quantity: 0,
    avgCost: 0,
    asOfDate: new Date().toISOString().slice(0, 10),
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!project) {
        if (!cancelled) setLoading(false)
        return
      }
      const pp = normalizePath(project.path)
      const tradeDir = `${pp}/raw/交割单`

      let files: { name: string; path: string; is_dir: boolean }[] = []
      try {
        const tree = await listDirectory(tradeDir)
        files = flattenFiles(tree).filter((f) => f.name.endsWith("-交割单.md"))
      } catch {
        // Directory may not exist yet
        if (!cancelled) {
          setDayStats([])
          setOpeningPositions([])
          setLoading(false)
        }
        return
      }

      const statsList: TradeDayStats[] = []
      for (const file of files) {
        try {
          const content = await readFile(file.path)
          const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})-交割单\.md/)
          const date = dateMatch ? dateMatch[1] : file.name.replace("-交割单.md", "")
          statsList.push(parseTradeMarkdown(date, content))
        } catch (err) {
          console.error("Failed to parse trade file:", file.path, err)
        }
      }

      if (cancelled) return
      setDayStats(statsList)

      try {
        const ops = await loadOpeningPositions(pp)
        if (cancelled) return
        setOpeningPositions(ops)
      } catch (err) {
        console.warn("[Dashboard] Failed to load opening positions:", err)
      }

      if (!cancelled) setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [project])

  const { monthly, stocks, overall } = useMemo(
    () => computeDashboardStats(dayStats, openingPositions),
    [dayStats, openingPositions]
  )

  const hasUnknownCost = overall.hasUnknownCost

  const priceRecord: Record<string, number> = {}
  for (const [code, val] of Object.entries(marketPrices)) {
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0) priceRecord[code] = n
  }
  const holdings = useMemo(() => calculateCurrentHoldings(dayStats, priceRecord, openingPositions), [dayStats, marketPrices, openingPositions])

  const winRate = overall.winDays + overall.lossDays + overall.breakEvenDays > 0
    ? ((overall.winDays / (overall.winDays + overall.lossDays + overall.breakEvenDays)) * 100).toFixed(1)
    : "0.0"

  async function handleAddOpeningPosition() {
    const code = opForm.code.trim()
    const name = opForm.name.trim()
    if (!project || !code || !name || opForm.quantity <= 0 || opForm.avgCost <= 0) return
    const item: OpeningPosition = { code, name, quantity: opForm.quantity, avgCost: opForm.avgCost, asOfDate: opForm.asOfDate }
    const next = [...openingPositions, item]
    try {
      await saveOpeningPositions(normalizePath(project.path), next)
      setOpeningPositions(next)
      setShowOpForm(false)
      setOpForm({ code: "", name: "", quantity: 0, avgCost: 0, asOfDate: new Date().toISOString().slice(0, 10) })
    } catch (err) {
      window.alert(`保存失败: ${err}`)
    }
  }

  async function handleRemoveOpeningPosition(index: number) {
    if (!project) return
    const next = openingPositions.filter((_, i) => i !== index)
    try {
      await saveOpeningPositions(normalizePath(project.path), next)
      setOpeningPositions(next)
    } catch (err) {
      window.alert(`删除失败: ${err}`)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        加载交易数据中...
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        请先打开或创建一个交易复盘项目
      </div>
    )
  }

  if (dayStats.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <BarChart3 className="h-12 w-12 opacity-50" />
        <p className="text-lg font-medium">暂无交割单数据</p>
        <p className="text-sm">在 Sources 面板中导入交割单后，统计看板将自动汇总</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold">交易统计看板</h2>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-1">
            <button
              onClick={() => setActiveTab("stats")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === "stats"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              收益统计
            </button>
            <button
              onClick={() => setActiveTab("holdings")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === "holdings"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Package className="h-4 w-4" />
              当前持仓
              {holdings.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0 text-[10px] text-primary">
                  {holdings.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeTab === "stats" && (
          <>
            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="总盈亏"
                value={`${overall.totalNetPnL >= 0 ? "+" : ""}${formatMoney(overall.totalNetPnL)}`}
                icon={overall.totalNetPnL >= 0 ? TrendingUp : TrendingDown}
                tone={overall.totalNetPnL >= 0 ? "positive" : "negative"}
              />
              <KpiCard
                title="总成交笔数"
                value={String(overall.totalTradeCount)}
                icon={Activity}
                tone="neutral"
              />
              <KpiCard
                title="日均盈亏"
                value={`${overall.avgDayNetPnL >= 0 ? "+" : ""}${formatMoney(overall.avgDayNetPnL)}`}
                icon={Calendar}
                tone={overall.avgDayNetPnL >= 0 ? "positive" : "negative"}
              />
              <KpiCard
                title="胜率（按日）"
                value={`${winRate}%`}
                icon={Percent}
                tone={parseFloat(winRate) >= 50 ? "positive" : "negative"}
              />
            </div>

            {/* 缺少期初持仓警告 */}
            {hasUnknownCost && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
                <span className="font-medium">⚠️ 提示：</span>
                部分卖出记录缺少期初持仓数据（共 {overall.totalUnknownQty} 股），区间首日/早期卖出盈亏可能失真。
                建议导入完整历史交割单，或在"设置"中录入期初持仓以修正统计。
              </div>
            )}

            {/* Charts Row */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Monthly P&L */}
              <div className="rounded-xl border bg-card p-4">
                <h3 className="mb-4 font-semibold">月度盈亏</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly.map((m) => ({ ...m, label: m.month.slice(5) + "月" }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} />
                      <YAxis
                        tickFormatter={(v) => `${(v / 10000).toFixed(1)}w`}
                        tick={{ fill: "hsl(var(--muted-foreground))" }}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                      />
                      <Tooltip
                        formatter={(value: number) => [`${value >= 0 ? "+" : ""}${formatMoney(value)}`, "已实现盈亏"]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          color: "hsl(var(--card-foreground))",
                        }}
                      />
                      <Bar dataKey="netPnL" radius={[4, 4, 0, 0]}>
                        {monthly.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.netPnL >= 0 ? "#10b981" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Stock Ranking */}
              <div className="rounded-xl border bg-card p-4">
                <h3 className="mb-4 font-semibold">股票盈亏排行 Top 10</h3>
                <div className="h-64 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-2">排名</th>
                        <th className="py-2 pr-2">股票</th>
                        <th className="py-2 pr-2 text-right">成交笔数</th>
                        <th className="py-2 text-right">已实现盈亏</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stocks.slice(0, 10).map((s, i) => (
                        <tr key={s.code} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 pr-2 font-medium">{s.name}</td>
                          <td className="py-2 pr-2 text-right">{s.tradeCount}</td>
                          <td className={`py-2 text-right font-medium ${s.netPnL >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {s.netPnL >= 0 ? "+" : ""}{formatMoney(s.netPnL)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Recent Trading Days */}
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-4 font-semibold">最近交易日</h3>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">日期</th>
                      <th className="py-2 pr-4 text-right">成交笔数</th>
                      <th className="py-2 pr-4 text-right">买入金额</th>
                      <th className="py-2 pr-4 text-right">卖出金额</th>
                      <th className="py-2 pr-4 text-right">手续费</th>
                      <th className="py-2 text-right">已实现盈亏</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dayStats].reverse().map((d) => (
                      <tr key={d.date} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-4 font-medium">{d.date}</td>
                        <td className="py-2 pr-4 text-right">{d.tradeCount}</td>
                        <td className="py-2 pr-4 text-right">{formatMoney(d.buyAmount)}</td>
                        <td className="py-2 pr-4 text-right">{formatMoney(d.sellAmount)}</td>
                        <td className="py-2 pr-4 text-right">{formatMoney(d.totalFee + d.totalStampTax + d.totalTransferFee)}</td>
                        <td className={`py-2 text-right font-medium ${d.netPnL >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {d.netPnL >= 0 ? "+" : ""}{formatMoney(d.netPnL)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === "holdings" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="持仓股票数"
                value={String(holdings.length)}
                icon={Package}
                tone="neutral"
              />
              <KpiCard
                title="持仓总市值"
                value={formatMoney(
                  holdings.reduce((s, h) => s + (h.marketPrice > 0 ? h.marketPrice * h.quantity : 0), 0)
                )}
                icon={Wallet}
                tone="neutral"
              />
              <KpiCard
                title="持仓总成本"
                value={formatMoney(holdings.reduce((s, h) => s + h.totalCost, 0))}
                icon={Activity}
                tone="neutral"
              />
              <KpiCard
                title="总浮动盈亏"
                value={`${
                  holdings.reduce((s, h) => s + h.unrealizedPnL, 0) >= 0 ? "+" : ""
                }${formatMoney(holdings.reduce((s, h) => s + h.unrealizedPnL, 0))}`}
                icon={TrendingUp}
                tone={
                  holdings.reduce((s, h) => s + h.unrealizedPnL, 0) >= 0 ? "positive" : "negative"
                }
              />
            </div>

            {/* 期初持仓管理 */}
            <div className="rounded-xl border bg-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">期初持仓</h3>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowOpForm((v) => !v)}>
                  <Plus className="h-3.5 w-3.5" />
                  {showOpForm ? "取消" : "添加"}
                </Button>
              </div>

              {showOpForm && (
                <div className="mb-4 grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-5">
                  <Input
                    placeholder="代码"
                    value={opForm.code}
                    onChange={(e) => setOpForm((p) => ({ ...p, code: e.target.value }))}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="名称"
                    value={opForm.name}
                    onChange={(e) => setOpForm((p) => ({ ...p, name: e.target.value }))}
                    className="h-8 text-sm"
                  />
                  <Input
                    type="number"
                    placeholder="数量"
                    value={opForm.quantity || ""}
                    onChange={(e) => setOpForm((p) => ({ ...p, quantity: parseInt(e.target.value) || 0 }))}
                    className="h-8 text-sm"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="成本单价"
                    value={opForm.avgCost || ""}
                    onChange={(e) => setOpForm((p) => ({ ...p, avgCost: parseFloat(e.target.value) || 0 }))}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={opForm.asOfDate}
                      onChange={(e) => setOpForm((p) => ({ ...p, asOfDate: e.target.value }))}
                      className="h-8 text-sm"
                    />
                    <Button size="sm" className="h-8 px-2 text-xs" onClick={handleAddOpeningPosition}>
                      保存
                    </Button>
                  </div>
                </div>
              )}

              {openingPositions.length === 0 ? (
                <div className="py-2 text-center text-sm text-muted-foreground">
                  无期初持仓。若统计出现"缺少期初持仓"警告，可在此录入。
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">代码</th>
                        <th className="py-2 pr-4">名称</th>
                        <th className="py-2 pr-4 text-right">数量</th>
                        <th className="py-2 pr-4 text-right">成本单价</th>
                        <th className="py-2 pr-4 text-right">截止日期</th>
                        <th className="py-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openingPositions.map((op, i) => (
                        <tr key={`${op.code}-${i}`} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-4 font-medium">{op.code}</td>
                          <td className="py-2 pr-4">{op.name}</td>
                          <td className="py-2 pr-4 text-right">{op.quantity}</td>
                          <td className="py-2 pr-4 text-right">{formatMoney(op.avgCost)}</td>
                          <td className="py-2 pr-4 text-right">{op.asOfDate}</td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => handleRemoveOpeningPosition(i)}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-4 font-semibold">当前持仓明细</h3>
              {holdings.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  当前无持仓。导入交割单后将自动计算持仓。
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">代码</th>
                        <th className="py-2 pr-4">名称</th>
                        <th className="py-2 pr-4 text-right">持股数</th>
                        <th className="py-2 pr-4 text-right">成本均价</th>
                        <th className="py-2 pr-4 text-right">市价</th>
                        <th className="py-2 pr-4 text-right">市值</th>
                        <th className="py-2 text-right">浮动盈亏</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h) => {
                        const marketValue = h.marketPrice > 0 ? h.marketPrice * h.quantity : 0
                        return (
                          <tr key={h.code} className="border-b border-border/50 last:border-0">
                            <td className="py-2 pr-4 font-medium">{h.code}</td>
                            <td className="py-2 pr-4">{h.name}</td>
                            <td className="py-2 pr-4 text-right">{h.quantity}</td>
                            <td className="py-2 pr-4 text-right">{formatMoney(h.avgCost)}</td>
                            <td className="py-2 pr-4 text-right">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={marketPrices[h.code] ?? ""}
                                placeholder="—"
                                className="h-7 w-24 text-right text-sm"
                                onChange={(e) => {
                                  setMarketPrices((prev) => ({
                                    ...prev,
                                    [h.code]: e.target.value,
                                  }))
                                }}
                              />
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {h.marketPrice > 0 ? formatMoney(marketValue) : "—"}
                            </td>
                            <td
                              className={`py-2 text-right font-medium ${
                                h.unrealizedPnL > 0
                                  ? "text-emerald-500"
                                  : h.unrealizedPnL < 0
                                  ? "text-red-500"
                                  : ""
                              }`}
                            >
                              {h.marketPrice > 0
                                ? `${h.unrealizedPnL >= 0 ? "+" : ""}${formatMoney(h.unrealizedPnL)}`
                                : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KpiCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string
  value: string
  icon: typeof TrendingUp
  tone: "positive" | "negative" | "neutral"
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "negative"
      ? "text-red-500"
      : "text-primary"

  return (
    <div className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function flattenFiles(nodes: { name: string; path: string; is_dir: boolean; children?: unknown[] }[]): { name: string; path: string; is_dir: boolean }[] {
  const files: { name: string; path: string; is_dir: boolean }[] = []
  for (const node of nodes) {
    if (node.is_dir && Array.isArray(node.children)) {
      files.push(...flattenFiles(node.children as { name: string; path: string; is_dir: boolean; children?: unknown[] }[]))
    } else {
      files.push({ name: node.name, path: node.path, is_dir: node.is_dir })
    }
  }
  return files
}
