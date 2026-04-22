import { useState, useMemo, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertTriangle, CheckCircle, HelpCircle } from "lucide-react"
import type { ImportPreview, ColumnType, ColumnGuess } from "@/lib/trade-import"

const TYPE_LABELS: Record<ColumnType, string> = {
  date: "日期",
  time: "时间",
  code: "证券代码",
  name: "证券名称",
  direction: "买卖方向",
  quantity: "成交数量",
  price: "成交价格",
  amount: "成交金额",
  fee: "手续费",
  stampTax: "印花税",
  transferFee: "过户费",
  totalCost: "发生金额",
  ignore: "忽略",
}

const TYPE_OPTIONS: ColumnType[] = [
  "date", "time", "code", "name", "direction",
  "quantity", "price", "amount", "fee", "stampTax",
  "transferFee", "totalCost", "ignore",
]

interface TradeImportPreviewProps {
  open: boolean
  preview: ImportPreview | null
  fileName: string
  onConfirm: (mapping: Record<ColumnType, number | null>) => void
  onCancel: () => void
}

export function TradeImportPreview({
  open,
  preview,
  fileName,
  onConfirm,
  onCancel,
}: TradeImportPreviewProps) {
  const [mapping, setMapping] = useState<Record<number, ColumnType>>({})

  // Reset mapping when preview changes (open new file)
  useEffect(() => {
    if (!preview) return
    const m: Record<number, ColumnType> = {}
    for (const guess of preview.guesses) {
      m[guess.colIndex] = guess.guessedType
    }
    setMapping(m)
  }, [preview])

  if (!preview) return null

  const handleTypeChange = (colIndex: number, type: ColumnType) => {
    setMapping((prev) => ({ ...prev, [colIndex]: type }))
  }

  // Check for conflicts (same type assigned to multiple columns)
  const typeToCols: Record<string, number[]> = {}
  for (const [colIdx, type] of Object.entries(mapping)) {
    if (type === "ignore") continue
    if (!typeToCols[type]) typeToCols[type] = []
    typeToCols[type].push(parseInt(colIdx))
  }
  const conflicts = Object.entries(typeToCols).filter(([_, cols]) => cols.length > 1)

  // Check required fields
  const foundTypes = new Set(Object.values(mapping))
  const requiredMissing = ["date", "code", "name"].filter(
    (f) => !foundTypes.has(f as ColumnType)
  )
  const hasDirection = ["direction", "quantity", "totalCost"].some(
    (f) => foundTypes.has(f as ColumnType)
  )

  const canConfirm = conflicts.length === 0 && requiredMissing.length === 0 && hasDirection

  const handleConfirm = () => {
    const result: Record<ColumnType, number | null> = {
      date: null, time: null, code: null, name: null,
      direction: null, quantity: null, price: null, amount: null,
      fee: null, stampTax: null, transferFee: null, totalCost: null,
      ignore: null,
    }
    for (const [colIdx, type] of Object.entries(mapping)) {
      result[type as ColumnType] = parseInt(colIdx)
    }
    onConfirm(result)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            交割单导入预览
            {preview.confidence >= 0.8 ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : preview.confidence >= 0.5 ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            )}
          </DialogTitle>
          <DialogDescription>
            文件: {fileName}
            {preview.confidence < 0.8 && (
              <span className="text-amber-600 ml-2">
                （自动识别置信度较低，请检查并修正列映射）
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Warnings */}
        {(conflicts.length > 0 || requiredMissing.length > 0 || !hasDirection) && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm space-y-1 mx-6 shrink-0">
            {conflicts.map(([type, cols]) => (
              <div key={type} className="text-amber-800 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {TYPE_LABELS[type as ColumnType]} 被映射到 {cols.length} 列，请只保留一列
              </div>
            ))}
            {requiredMissing.map((f) => (
              <div key={f} className="text-red-700 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                缺少必需字段: {TYPE_LABELS[f as ColumnType]}
              </div>
            ))}
            {!hasDirection && (
              <div className="text-red-700 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                缺少方向识别字段（方向/数量/发生金额至少一个）
              </div>
            )}
          </div>
        )}

        {/* Preview Table */}
        <ScrollArea className="flex-1 min-h-0 px-6 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-medium text-muted-foreground">原始列名</th>
                <th className="text-left p-2 font-medium text-muted-foreground">识别为</th>
                <th className="text-left p-2 font-medium text-muted-foreground">置信度</th>
                <th className="text-left p-2 font-medium text-muted-foreground">样本数据</th>
              </tr>
            </thead>
            <tbody>
              {preview.guesses.map((guess) => {
                const currentType = mapping[guess.colIndex] ?? guess.guessedType
                const isConflict = conflicts.some(([type, cols]) =>
                  type === currentType && cols.length > 1
                )
                const isRequired = ["date", "code", "name"].includes(currentType)

                return (
                  <tr
                    key={guess.colIndex}
                    className={`border-b ${isConflict ? "bg-red-50" : ""}`}
                  >
                    <td className="p-2 font-mono text-xs">{guess.header}</td>
                    <td className="p-2">
                      <select
                        value={currentType}
                        onChange={(e) => handleTypeChange(guess.colIndex, e.target.value as ColumnType)}
                        className={`text-sm border rounded px-2 py-1 ${
                          isConflict
                            ? "border-red-300 bg-red-50"
                            : isRequired
                            ? "border-blue-300"
                            : "border-gray-200"
                        }`}
                      >
                        {TYPE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              guess.confidence >= 0.8
                                ? "bg-green-500"
                                : guess.confidence >= 0.5
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${guess.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(guess.confidence * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground font-mono">
                      {guess.sampleValues.join(", ")}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Sample data preview */}
          {preview.sampleRows.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2 text-muted-foreground">原始数据预览</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border">
                  <thead>
                    <tr className="bg-muted">
                      {preview.headers.map((h, i) => (
                        <th key={i} className="border p-1 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleRows.map((row, ri) => (
                      <tr key={ri} className="border-b">
                        {row.map((cell, ci) => (
                          <td key={ci} className="border p-1 text-muted-foreground">
                            {String(cell ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 px-6 py-4 shrink-0 border-t">
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            确认导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
