import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWikiStore } from "@/stores/wiki-store"
import {
  scanWiki,
  generatePlan,
  executePlan,
  type DoctorIssue,
  type DoctorPlan,
  type DoctorResult,
  type LinkFix,
} from "@/lib/wiki-doctor"
import { Stethoscope, CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp } from "lucide-react"

interface WikiDoctorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = "scanning" | "analyzed" | "preview" | "executing" | "done"

export function WikiDoctorDialog({ open, onOpenChange }: WikiDoctorDialogProps) {
  const project = useWikiStore((s) => s.project)
  const bumpDataVersion = useWikiStore((s) => s.bumpDataVersion)

  const [step, setStep] = useState<Step>("scanning")
  const [issues, setIssues] = useState<DoctorIssue[]>([])
  const [plan, setPlan] = useState<DoctorPlan | null>(null)
  const [result, setResult] = useState<DoctorResult | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [conflictResolutions, setConflictResolutions] = useState<
    Record<string, "keep-a" | "keep-b" | "keep-both">
  >({})
  const [pinyinRenames, setPinyinRenames] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState(0)

  const reset = useCallback(() => {
    setStep("scanning")
    setIssues([])
    setPlan(null)
    setResult(null)
    setExpanded({})
    setConflictResolutions({})
    setPinyinRenames({})
    setProgress(0)
  }, [])

  useEffect(() => {
    if (open) {
      reset()
      runScan()
    }
  }, [open])

  async function runScan() {
    if (!project) return
    setStep("scanning")

    try {
      const wikiPath = `${project.path}/wiki`
      const foundIssues = await scanWiki(wikiPath)
      setIssues(foundIssues)
      setStep("analyzed")
    } catch (e) {
      setIssues([])
      setStep("analyzed")
    }
  }

  async function runGeneratePlan() {
    if (!project) return
    setStep("preview")

    try {
      const wikiPath = `${project.path}/wiki`
      const generatedPlan = await generatePlan(wikiPath)
      setPlan(generatedPlan)

      // Initialize pinyin renames with suggestions
      const initialRenames: Record<string, string> = {}
      for (const pf of generatedPlan.pinyinFiles) {
        if (pf.suggestedName) {
          initialRenames[pf.path] = pf.suggestedName
        }
      }
      setPinyinRenames(initialRenames)
    } catch (e) {
      setPlan({
        autoOps: [],
        moves: [],
        conflicts: [],
        indexMerge: null,
        pinyinFiles: [],
        linkFixes: [],
        prefixFixes: [],
      })
    }
  }

  async function runExecute() {
    if (!project || !plan) return

    // Check if all conflicts are resolved
    const unresolved = plan.conflicts.filter((c) => !conflictResolutions[c.basename])
    if (unresolved.length > 0) {
      alert(`请先解决 ${unresolved.length} 个文件冲突`)
      return
    }

    setStep("executing")
    setProgress(0)

    try {
      const wikiPath = `${project.path}/wiki`
      const execResult = await executePlan(wikiPath, plan, conflictResolutions, pinyinRenames)
      setResult(execResult)
      setStep("done")
      bumpDataVersion()
    } catch (e) {
      setResult({
        success: false,
        backupPath: "",
        operationsApplied: 0,
        errors: [`执行失败: ${e}`],
      })
      setStep("done")
    }
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const hasIssues = issues.length > 0
  const autoOpCount = plan?.autoOps.length ?? 0
  const moveCount = plan?.moves.filter((m) => m.to !== "__DELETE__").length ?? 0
  const deleteCount = plan?.moves.filter((m) => m.to === "__DELETE__").length ?? 0
  const conflictCount = plan?.conflicts.length ?? 0
  const pinyinCount = plan?.pinyinFiles.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="size-5 text-primary" />
            Wiki 整理医生
          </DialogTitle>
          <DialogDescription>
            {step === "scanning" && "正在扫描 Wiki 目录结构..."}
            {step === "analyzed" && (hasIssues ? `发现 ${issues.length} 类问题` : "Wiki 结构良好，无需整理")}
            {step === "preview" && "请确认以下整理方案"}
            {step === "executing" && "正在执行整理..."}
            {step === "done" && (result?.success ? "整理完成" : "整理完成（有错误）")}
          </DialogDescription>
        </DialogHeader>

        {step === "scanning" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">正在扫描 Wiki 目录...（不会修改任何文件）</p>
          </div>
        )}

        {step === "analyzed" && (
          <div className="space-y-4">
            {hasIssues ? (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
                  <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="size-4" />
                    发现 {issues.length} 类问题，涉及多个文件
                  </div>
                </div>

                <div className="space-y-2">
                  {issues.map((issue, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <button
                        className="flex w-full items-center justify-between text-left"
                        onClick={() => toggleExpand(`issue-${i}`)}
                      >
                        <div className="flex items-center gap-2">
                          {issue.severity === "auto" ? (
                            <CheckCircle className="size-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="size-4 text-amber-500" />
                          )}
                          <span className="text-sm font-medium">{issue.description}</span>
                        </div>
                        {expanded[`issue-${i}`] ? (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        )}
                      </button>

                      {expanded[`issue-${i}`] && (
                        <ul className="mt-2 space-y-1 pl-6 text-xs text-muted-foreground">
                          {issue.details.map((d, j) => (
                            <li key={j}>{d}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8">
                <CheckCircle className="size-8 text-green-500" />
                <p className="text-sm text-muted-foreground">Wiki 结构良好，未发现需要整理的问题</p>
              </div>
            )}
          </div>
        )}

        {step === "preview" && plan && (
          <div className="space-y-4">
            {/* Auto ops summary */}
            {autoOpCount > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
                <div className="flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-200">
                  <CheckCircle className="size-4" />
                  将自动处理 {autoOpCount} 项（无需确认）
                </div>
                <ul className="mt-2 space-y-1 pl-6 text-xs text-green-700 dark:text-green-300">
                  {plan.autoOps.map((op, i) => (
                    <li key={i}>{op.description}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Moves summary */}
            {(moveCount > 0 || deleteCount > 0) && (
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">
                  文件移动/删除（{moveCount + deleteCount} 项）
                </div>
                <ul className="mt-2 space-y-1 pl-6 text-xs text-muted-foreground">
                  {plan.moves.slice(0, 5).map((m, i) => (
                    <li key={i}>
                      {m.to === "__DELETE__"
                        ? `删除: ${m.from.split("/").pop()}`
                        : `移动: ${m.from.split("/").pop()} → ${m.to.split("/").pop()}`}
                    </li>
                  ))}
                  {plan.moves.length > 5 && (
                    <li>...还有 {plan.moves.length - 5} 项</li>
                  )}
                </ul>
              </div>
            )}

            {/* Conflicts */}
            {conflictCount > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                <div className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200">
                  <AlertTriangle className="size-4" />
                  需要确认：{conflictCount} 个文件冲突
                </div>
                <div className="mt-2 space-y-2">
                  {plan.conflicts.map((c) => (
                    <div key={c.basename} className="rounded border bg-background p-2">
                      <div className="text-xs font-medium">{c.basename}</div>
                      <div className="mt-1 flex gap-1">
                        {([
                          { key: "keep-a", label: "保留A" },
                          { key: "keep-b", label: "保留B" },
                          { key: "keep-both", label: "两个都保留" },
                        ] as const).map((opt) => (
                          <Button
                            key={opt.key}
                            size="xs"
                            variant={
                              conflictResolutions[c.basename] === opt.key
                                ? "default"
                                : "outline"
                            }
                            onClick={() =>
                              setConflictResolutions((prev) => ({
                                ...prev,
                                [c.basename]: opt.key,
                              }))
                            }
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Link fixes */}
            {plan.linkFixes.length > 0 && (
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">
                  链接格式修复（{plan.linkFixes.length} 个）
                </div>
                <div className="mt-2 space-y-1">
                  {(() => {
                    // Group by file
                    const byFile = new Map<string, LinkFix[]>()
                    for (const fix of plan.linkFixes) {
                      const list = byFile.get(fix.filePath) ?? []
                      list.push(fix)
                      byFile.set(fix.filePath, list)
                    }
                    return Array.from(byFile.entries()).slice(0, 3).map(([filePath, fixes]) => (
                      <div key={filePath} className="text-xs">
                        <span className="text-muted-foreground">{filePath.split("/").pop()}</span>
                        <ul className="mt-0.5 pl-3 space-y-0.5">
                          {fixes.slice(0, 2).map((fix, i) => (
                            <li key={i} className="text-muted-foreground/70">
                              {fix.oldLink} → {fix.newLink}
                            </li>
                          ))}
                          {fixes.length > 2 && (
                            <li className="text-muted-foreground/50">...还有 {fixes.length - 2} 个</li>
                          )}
                        </ul>
                      </div>
                    ))
                  })()}
                  {new Set(plan.linkFixes.map((f) => f.filePath)).size > 3 && (
                    <div className="text-xs text-muted-foreground/50">
                      ...还有 {new Set(plan.linkFixes.map((f) => f.filePath)).size - 3} 个文件
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pinyin files */}
            {pinyinCount > 0 && (
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">拼音文件名确认（{pinyinCount} 个）</div>
                <div className="mt-2 space-y-2">
                  {plan.pinyinFiles.map((pf) => (
                    <div key={pf.path} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{pf.basename}</span>
                      <span className="text-xs">→</span>
                      <Input
                        size="sm"
                        className="h-7 text-xs"
                        value={pinyinRenames[pf.path] ?? pf.basename}
                        onChange={(e) =>
                          setPinyinRenames((prev) => ({
                            ...prev,
                            [pf.path]: e.target.value,
                          }))
                        }
                        placeholder={pf.suggestedName ?? "输入中文名"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prefix fixes */}
            {plan.prefixFixes.length > 0 && (
              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">
                  链接前缀统一（{plan.prefixFixes.length} 个）
                </div>
                <div className="mt-2 space-y-1">
                  {(() => {
                    const byFile = new Map<string, LinkFix[]>()
                    for (const fix of plan.prefixFixes) {
                      const list = byFile.get(fix.filePath) ?? []
                      list.push(fix)
                      byFile.set(fix.filePath, list)
                    }
                    return Array.from(byFile.entries()).slice(0, 3).map(([filePath, fixes]) => (
                      <div key={filePath} className="text-xs">
                        <span className="text-muted-foreground">{filePath.split("/").pop()}</span>
                        <ul className="mt-0.5 pl-3 space-y-0.5">
                          {fixes.slice(0, 2).map((fix, i) => (
                            <li key={i} className="text-muted-foreground/70">
                              {fix.oldLink} → {fix.newLink}
                            </li>
                          ))}
                          {fixes.length > 2 && (
                            <li className="text-muted-foreground/50">...还有 {fixes.length - 2} 个</li>
                          )}
                        </ul>
                      </div>
                    ))
                  })()}
                  {new Set(plan.prefixFixes.map((f) => f.filePath)).size > 3 && (
                    <div className="text-xs text-muted-foreground/50">
                      ...还有 {new Set(plan.prefixFixes.map((f) => f.filePath)).size - 3} 个文件
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* No changes */}
            {autoOpCount === 0 &&
              moveCount === 0 &&
              conflictCount === 0 &&
              pinyinCount === 0 &&
              plan.linkFixes.length === 0 &&
              plan.prefixFixes.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  无需任何整理操作
                </div>
              )}
          </div>
        )}

        {step === "executing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="size-8 animate-spin text-primary" />
            <div className="w-full max-w-xs">
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">正在执行整理，请勿关闭窗口...（已自动备份）</p>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4">
            {result.success ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <CheckCircle className="size-10 text-green-500" />
                <p className="text-sm font-medium">整理完成</p>
                <p className="text-xs text-muted-foreground">已执行 {result.operationsApplied} 项操作</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4">
                <AlertTriangle className="size-10 text-amber-500" />
                <p className="text-sm font-medium">整理完成，但有错误</p>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                <div className="text-sm font-medium text-red-800 dark:text-red-200">错误日志</div>
                <ul className="mt-1 space-y-1 pl-4 text-xs text-red-700 dark:text-red-300">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.backupPath && (
              <div className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
                备份位置: {result.backupPath}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "analyzed" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
              {hasIssues && (
                <Button onClick={runGeneratePlan}>生成整理方案</Button>
              )}
            </>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("analyzed")}>
                返回
              </Button>
              <Button
                onClick={runExecute}
                disabled={
                  plan?.conflicts.some((c) => !conflictResolutions[c.basename]) ?? false
                }
              >
                确认整理（已自动备份）
              </Button>
            </>
          )}

          {step === "done" && (
            <Button onClick={() => onOpenChange(false)}>关闭</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
