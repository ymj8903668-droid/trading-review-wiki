import { useState, useEffect, useCallback } from "react"
import { open } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"
import { Plus, FileText, RefreshCw, BookOpen, Trash2, Folder, ChevronRight, ChevronDown, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useWikiStore } from "@/stores/wiki-store"
import { copyFile, listDirectory, readFile, readFileBinary, writeFile, deleteFile, findRelatedWikiPages, preprocessFile, createDirectory, parseTradeExcel as parseTradeExcelBackend } from "@/commands/fs"
import type { FileNode } from "@/types/wiki"
import { startIngest } from "@/lib/ingest"
import { enqueueIngest, enqueueBatch } from "@/lib/ingest-queue"
import { parseTradeCSV, parseTradeRecords, parseTradeExcel, groupRecordsByDate, buildTradeMarkdown, buildTradeSummaryForReview, calculateFifoPnL } from "@/lib/trade-import"
import { parseTradeMarkdown as parseTradeMarkdownStats } from "@/lib/trade-stats"
import { useTranslation } from "react-i18next"
import { normalizePath, getFileName } from "@/lib/path-utils"

export function SourcesView() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const selectedFile = useWikiStore((s) => s.selectedFile)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const setChatExpanded = useWikiStore((s) => s.setChatExpanded)
  const llmConfig = useWikiStore((s) => s.llmConfig)
  const [sources, setSources] = useState<FileNode[]>([])
  const [importing, setImporting] = useState(false)
  const [ingestingPath, setIngestingPath] = useState<string | null>(null)

  const loadSources = useCallback(async () => {
    if (!project) return
    const pp = normalizePath(project.path)
    try {
      const tree = await listDirectory(`${pp}/raw`)
      // Filter out hidden files/dirs and cache
      const filtered = filterTree(tree)
      setSources(filtered)
    } catch (err) {
      console.warn("[SourcesView] Failed to load sources:", err)
      setSources([])
    }
  }, [project])

  useEffect(() => {
    loadSources()
  }, [loadSources])

  async function handleImport() {
    if (!project) return

    const selected = await open({
      multiple: true,
      title: "导入原始资料",
      filters: [
        {
          name: "Documents",
          extensions: [
            "md", "mdx", "txt", "rtf", "pdf",
            "html", "htm", "xml",
            "doc", "docx", "xls", "xlsx", "ppt", "pptx",
            "odt", "ods", "odp", "epub", "pages", "numbers", "key",
          ],
        },
        {
          name: "Data",
          extensions: ["json", "jsonl", "csv", "tsv", "yaml", "yml", "ndjson"],
        },
        {
          name: "Code",
          extensions: [
            "py", "js", "ts", "jsx", "tsx", "rs", "go", "java",
            "c", "cpp", "h", "rb", "php", "swift", "sql", "sh",
          ],
        },
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "avif", "heic"],
        },
        {
          name: "Media",
          extensions: ["mp4", "webm", "mov", "avi", "mkv", "mp3", "wav", "ogg", "flac", "m4a"],
        },
        { name: "All Files", extensions: ["*"] },
      ],
    })

    if (!selected || selected.length === 0) return

    setImporting(true)
    const pp = normalizePath(project.path)
    const paths = Array.isArray(selected) ? selected : [selected]

    const importedPaths: string[] = []
    for (const sourcePath of paths) {
      const originalName = getFileName(sourcePath) || "unknown"
      const destPath = await getUniqueDestPath(`${pp}/raw/sources`, originalName)
      try {
        await copyFile(sourcePath, destPath)
        importedPaths.push(destPath)
        // Pre-process file (extract text from PDF, etc.) for instant preview later
        preprocessFile(destPath).catch(() => {})
      } catch (err) {
        console.error(`Failed to import ${originalName}:`, err)
      }
    }

    setImporting(false)
    await loadSources()

    // Enqueue for serial ingest (runs in background via ingest queue)
    if (llmConfig.apiKey || llmConfig.provider === "ollama" || llmConfig.provider === "custom") {
      for (const destPath of importedPaths) {
        enqueueIngest(pp, destPath).catch((err) =>
          console.error(`Failed to enqueue ingest:`, err)
        )
      }
    }
  }

  async function handleImportFolder() {
    if (!project) return

    const selected = await open({
      directory: true,
      title: "导入文件夹",
    })

    if (!selected || typeof selected !== "string") return

    setImporting(true)
    const pp = normalizePath(project.path)
    const folderName = getFileName(selected) || "imported"
    const destDir = `${pp}/raw/sources/${folderName}`

    try {
      // Recursively copy the folder
      const copiedFiles: string[] = await invoke("copy_directory", {
        source: selected,
        destination: destDir,
      })

      console.log(`[Folder Import] Copied ${copiedFiles.length} files from ${folderName}`)

      // Preprocess all files
      for (const filePath of copiedFiles) {
        preprocessFile(filePath).catch(() => {})
      }

      setImporting(false)
      await loadSources()

      // Build ingest tasks with folder context
      if (llmConfig.apiKey || llmConfig.provider === "ollama" || llmConfig.provider === "custom") {
        const tasks = copiedFiles
          .filter((fp) => {
            const ext = fp.split(".").pop()?.toLowerCase() ?? ""
            // Only ingest text-based files, skip images/media
            return ["md", "mdx", "txt", "pdf", "docx", "pptx", "xlsx", "xls",
                    "csv", "json", "html", "htm", "rtf", "xml", "yaml", "yml"].includes(ext)
          })
          .map((filePath) => {
            // Build folder context from relative path
            const relPath = filePath.replace(destDir + "/", "")
            const parts = relPath.split("/")
            parts.pop() // remove filename
            const context = parts.length > 0
              ? `${folderName} > ${parts.join(" > ")}`
              : folderName
            return { sourcePath: filePath, folderContext: context }
          })

        if (tasks.length > 0) {
          await enqueueBatch(pp, tasks)
          console.log(`[Folder Import] Enqueued ${tasks.length} files for ingest`)
        }
      }
    } catch (err) {
      console.error(`Failed to import folder:`, err)
      setImporting(false)
    }
  }

  async function handleImportTrade() {
    if (!project) return

    const selected = await open({
      multiple: true,
      title: "导入交割单",
      filters: [
        { name: "交割单文件", extensions: ["csv", "xlsx", "xls"] },
        { name: "All Files", extensions: ["*"] },
      ],
    })

    if (!selected || selected.length === 0) return

    setImporting(true)
    const pp = normalizePath(project.path)
    const paths = Array.isArray(selected) ? selected : [selected]

    const results: { path: string; status: "ok" | "empty" | "error"; msg?: string; dates?: string[] }[] = []

    try {
      // 预读取历史交割单记录（用于 FIFO 盈亏计算）
      const historyRecords: import("@/lib/trade-import").TradeRecord[] = []
      try {
        const deliveryDir = `${pp}/raw/交割单`
        const files = await listDirectory(deliveryDir)
        for (const f of files) {
          if (f.name.endsWith("-交割单.md")) {
            const content = await readFile(`${deliveryDir}/${f.name}`)
            const dateStr = f.name.replace("-交割单.md", "")
            const stats = parseTradeMarkdownStats(dateStr, content)
            for (const r of stats.records) {
              historyRecords.push({
                date: r.date,
                time: r.time,
                code: r.code,
                name: r.name,
                direction: r.direction,
                quantity: r.quantity,
                price: r.price,
                amount: r.amount,
                fee: r.fee,
                stampTax: r.stampTax,
                transferFee: r.transferFee,
                totalCost: 0,
              })
            }
          }
        }
      } catch (err) {
        console.warn("[SourcesView] Failed to load historical delivery records:", err)
      }

      for (const sourcePath of paths) {
        const fileName = sourcePath.split(/[\\/]/).pop() || sourcePath
        const ext = (sourcePath.split(".").pop() || "").toLowerCase()
        let records: import("@/lib/trade-import").TradeRecord[] = []
        try {
          if (ext === "csv" || ext === "txt") {
            // Read as binary to detect encoding (GBK vs UTF-8)
            const buffer = await readFileBinary(sourcePath)
            records = parseTradeCSV(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
          } else if (["xlsx", "xls", "ods"].includes(ext)) {
            let rows: unknown[][] = []
            let usedFallback = false
            try {
              rows = await parseTradeExcelBackend(sourcePath)
            } catch (backendErr: unknown) {
              const msg = backendErr instanceof Error ? backendErr.message : String(backendErr || "")
              // 券商部分导出文件是 HTML/XML 伪装的 .xls，calamine 无法识别，fallback 到前端解析
              if (msg.includes("Invalid OLE") || msg.includes("not an office document") || msg.includes("CFB")) {
                const buffer = await readFileBinary(sourcePath)
                records = parseTradeExcel(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
                usedFallback = true
              } else {
                throw backendErr
              }
            }
            if (!usedFallback) {
              records = parseTradeRecords(rows)
            }
          } else {
            results.push({ path: fileName, status: "error", msg: "不支持的文件格式" })
            continue
          }
        } catch (parseErr: unknown) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr || "")
          results.push({ path: fileName, status: "error", msg })
          continue
        }

        if (records.length === 0) {
          results.push({ path: fileName, status: "empty" })
          continue
        }

        // 合并历史记录，用 FIFO 计算每日已实现盈亏
        const allRecords = [...historyRecords, ...records]
        const { datePnL } = calculateFifoPnL(allRecords)

        const byDate = groupRecordsByDate(records)
        const dates = Array.from(byDate.keys()).sort()

        // Ensure directories exist
        await createDirectory(`${pp}/raw/交割单`).catch(() => {})
        await createDirectory(`${pp}/raw/日复盘`).catch(() => {})

        for (const [date, dayRecords] of byDate) {
          const realizedPnL = datePnL.get(date)

          // Write trade detail markdown
          const tradeMdPath = `${pp}/raw/交割单/${date}-交割单.md`
          const tradeMd = buildTradeMarkdown(date, dayRecords, realizedPnL)
          await writeFile(tradeMdPath, tradeMd)

          // Append or create daily review
          const reviewPath = `${pp}/raw/日复盘/${date}-复盘.md`
          let reviewContent = ""
          try {
            reviewContent = await readFile(reviewPath)
          } catch {
            reviewContent = `# ${date} 复盘\n\n`
          }

          const summary = buildTradeSummaryForReview(date, dayRecords, realizedPnL)
          const updatedReview = reviewContent.trimEnd() + "\n\n" + summary
          await writeFile(reviewPath, updatedReview)
        }

        // 将新记录追加到历史记录，供后续文件使用
        historyRecords.push(...records)
        results.push({ path: fileName, status: "ok", dates })
      }

      await loadSources()

      // 汇总提示
      const okCount = results.filter((r) => r.status === "ok").length
      const emptyCount = results.filter((r) => r.status === "empty").length
      const errorCount = results.filter((r) => r.status === "error").length

      if (paths.length === 1) {
        const r = results[0]
        if (r?.status === "ok") {
          window.alert(`交割单导入成功\n文件: ${r.path}\n日期: ${r.dates?.join(", ") || "—"}`)
        } else if (r?.status === "empty") {
          window.alert(`未识别到交易记录\n文件: ${r.path}\n\n请检查文件格式是否正确，或表头是否包含“成交日期/证券代码/方向/数量/金额”等关键字段。`)
        } else if (r?.status === "error") {
          window.alert(`导入失败\n文件: ${r.path}\n错误: ${r.msg}`)
        }
      } else {
        let msg = `导入完成：${okCount} 个成功`
        if (emptyCount > 0) msg += `，${emptyCount} 个无记录`
        if (errorCount > 0) msg += `，${errorCount} 个失败`
        msg += "\n\n"
        for (const r of results) {
          const icon = r.status === "ok" ? "✅" : r.status === "empty" ? "⚠️" : "❌"
          msg += `${icon} ${r.path}`
          if (r.status === "ok" && r.dates) msg += `  (${r.dates.join(", ")})`
          if (r.status === "error" && r.msg) msg += `  — ${r.msg}`
          msg += "\n"
        }
        window.alert(msg)
      }
    } catch (err) {
      console.error("Failed to import trade file:", err)
      window.alert(`导入失败: ${err}`)
    } finally {
      setImporting(false)
    }
  }

  async function handleOpenSource(node: FileNode) {
    setSelectedFile(node.path)
    try {
      const content = await readFile(node.path)
      setFileContent(content)
    } catch (err) {
      console.error("Failed to read source:", err)
    }
  }

  async function handleDelete(node: FileNode) {
    if (!project) return
    const pp = normalizePath(project.path)
    const fileName = node.name
    const confirmed = window.confirm(
      t("sources.deleteConfirm", { name: fileName })
    )
    if (!confirmed) return

    try {
      // Step 1: Find related wiki pages before deleting
      const relatedPages = await findRelatedWikiPages(pp, fileName)
      const deletedSlugs = relatedPages.map((p) => {
        const name = getFileName(p).replace(".md", "")
        return name
      }).filter(Boolean)

      // Step 2: Delete the source file
      await deleteFile(node.path)

      // Step 3: Delete preprocessed cache
      try {
        await deleteFile(`${pp}/raw/sources/.cache/${fileName}.txt`)
      } catch {
        // cache file may not exist
      }

      // Step 4: Delete or update related wiki pages
      // If a page has multiple sources, only remove this filename from sources[]; don't delete the page
      const actuallyDeleted: string[] = []
      for (const pagePath of relatedPages) {
        try {
          const content = await readFile(pagePath)
          // Parse sources from frontmatter
          const sourcesMatch = content.match(/^sources:\s*\[([^\]]*)\]/m)
          if (sourcesMatch) {
            const sourcesList = sourcesMatch[1]
              .split(",")
              .map((s) => s.trim().replace(/["']/g, ""))
              .filter((s) => s.length > 0)

            if (sourcesList.length > 1) {
              // Multiple sources — just remove this file from the list, keep the page
              const updatedSources = sourcesList.filter(
                (s) => s.toLowerCase() !== fileName.toLowerCase()
              )
              const updatedContent = content.replace(
                /^sources:\s*\[([^\]]*)\]/m,
                `sources: [${updatedSources.map((s) => `"${s}"`).join(", ")}]`
              )
              await writeFile(pagePath, updatedContent)
              continue // Don't delete this page
            }
          }

          // Single source or no sources field — delete the page
          await deleteFile(pagePath)
          actuallyDeleted.push(pagePath)
        } catch (err) {
          console.error(`Failed to process wiki page ${pagePath}:`, err)
        }
      }

      // Step 5: Clean index.md — remove entries for actually deleted pages only
      const deletedPageSlugs = actuallyDeleted.map((p) => {
        const name = getFileName(p).replace(".md", "")
        return name
      }).filter(Boolean)

      if (deletedPageSlugs.length > 0) {
        try {
          const indexPath = `${pp}/wiki/index.md`
          const indexContent = await readFile(indexPath)
          const updatedIndex = indexContent
            .split("\n")
            .filter((line) => !deletedPageSlugs.some((slug) => line.toLowerCase().includes(slug.toLowerCase())))
            .join("\n")
          await writeFile(indexPath, updatedIndex)
        } catch {
          // non-critical
        }
      }

      // Step 6: Clean [[wikilinks]] to deleted pages from remaining wiki files
      if (deletedPageSlugs.length > 0) {
        try {
          const wikiTree = await listDirectory(`${pp}/wiki`)
          const allMdFiles = flattenMdFiles(wikiTree)
          for (const file of allMdFiles) {
            try {
              const content = await readFile(file.path)
              let updated = content
              for (const slug of deletedPageSlugs) {
                const linkRegex = new RegExp(`\\[\\[${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\|([^\\]]+))?\\]\\]`, "gi")
                updated = updated.replace(linkRegex, (_match, displayText) => displayText || slug)
              }
              if (updated !== content) {
                await writeFile(file.path, updated)
              }
            } catch {
              // skip
            }
          }
        } catch {
          // non-critical
        }
      }

      // Step 7: Append deletion record to log.md
      try {
        const logPath = `${pp}/wiki/log.md`
        const logContent = await readFile(logPath).catch(() => "# Wiki Log\n")
        const date = new Date().toISOString().slice(0, 10)
        const keptCount = relatedPages.length - actuallyDeleted.length
        const logEntry = `\n## [${date}] delete | ${fileName}\n\nDeleted source file and ${actuallyDeleted.length} wiki pages.${keptCount > 0 ? ` ${keptCount} shared pages kept (have other sources).` : ""}\n`
        await writeFile(logPath, logContent.trimEnd() + logEntry)
      } catch {
        // non-critical
      }

      // Step 8: Refresh everything
      await loadSources()
      const tree = await listDirectory(pp)
      setFileTree(tree)
      useWikiStore.getState().bumpDataVersion()

      // Clear selected file if it was the deleted one
      if (selectedFile === node.path || actuallyDeleted.includes(selectedFile ?? "")) {
        setSelectedFile(null)
      }
    } catch (err) {
      console.error("Failed to delete source:", err)
      window.alert(`Failed to delete: ${err}`)
    }
  }

  async function handleIngest(node: FileNode) {
    if (!project || ingestingPath) return
    setIngestingPath(node.path)
    try {
      setChatExpanded(true)
      setActiveView("wiki")
      await startIngest(normalizePath(project.path), node.path, llmConfig)
    } catch (err) {
      console.error("Failed to start ingest:", err)
    } finally {
      setIngestingPath(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t("sources.title")}</h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={loadSources} title="刷新">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleImport} disabled={importing}>
            <Plus className="mr-1 h-4 w-4" />
            {importing ? t("sources.importing") : t("sources.import")}
          </Button>
          <Button size="sm" onClick={handleImportFolder} disabled={importing}>
            <Plus className="mr-1 h-4 w-4" />
            {t("sources.importFolder", "文件夹")}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleImportTrade} disabled={importing}>
            <TrendingUp className="mr-1 h-4 w-4" />
            导入交割单
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
            <p>{t("sources.noSources")}</p>
            <p>{t("sources.importHint")}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleImport}>
                <Plus className="mr-1 h-4 w-4" />
                {t("sources.importFiles")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleImportFolder}>
                <Plus className="mr-1 h-4 w-4" />
                {t("sources.importFolder", "文件夹")}
              </Button>
              <Button variant="outline" size="sm" onClick={handleImportTrade}>
                <TrendingUp className="mr-1 h-4 w-4" />
                导入交割单
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-2">
            <SourceTree
              nodes={sources}
              onOpen={handleOpenSource}
              onIngest={handleIngest}
              onDelete={handleDelete}
              ingestingPath={ingestingPath}
              depth={0}
            />
          </div>
        )}
      </ScrollArea>

      <div className="border-t px-4 py-2 text-xs text-muted-foreground">
        {t("sources.sourceCount", { count: countFiles(sources) })}
      </div>
    </div>
  )
}

/**
 * Generate a unique destination path. If file already exists, adds date/counter suffix.
 * "file.pdf" → "file.pdf" (first time)
 * "file.pdf" → "file-20260406.pdf" (conflict)
 * "file.pdf" → "file-20260406-2.pdf" (second conflict same day)
 */
async function getUniqueDestPath(dir: string, fileName: string): Promise<string> {
  const basePath = `${dir}/${fileName}`

  // Check if file exists by trying to read it
  try {
    await readFile(basePath)
  } catch {
    // File doesn't exist — use original name
    return basePath
  }

  // File exists — add date suffix
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : ""
  const nameWithoutExt = ext ? fileName.slice(0, -ext.length) : fileName
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")

  const withDate = `${dir}/${nameWithoutExt}-${date}${ext}`
  try {
    await readFile(withDate)
  } catch {
    return withDate
  }

  // Date suffix also exists — add counter
  for (let i = 2; i <= 99; i++) {
    const withCounter = `${dir}/${nameWithoutExt}-${date}-${i}${ext}`
    try {
      await readFile(withCounter)
    } catch {
      return withCounter
    }
  }

  // Shouldn't happen, but fallback
  return `${dir}/${nameWithoutExt}-${date}-${Date.now()}${ext}`
}

function filterTree(nodes: FileNode[]): FileNode[] {
  return nodes
    .filter((n) => !n.name.startsWith("."))
    .map((n) => {
      if (n.is_dir && n.children) {
        return { ...n, children: filterTree(n.children) }
      }
      return n
    })
    .filter((n) => !n.is_dir || (n.children && n.children.length > 0))
}

function countFiles(nodes: FileNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      count += countFiles(node.children)
    } else if (!node.is_dir) {
      count++
    }
  }
  return count
}

function SourceTree({
  nodes,
  onOpen,
  onIngest,
  onDelete,
  ingestingPath,
  depth,
}: {
  nodes: FileNode[]
  onOpen: (node: FileNode) => void
  onIngest: (node: FileNode) => void
  onDelete: (node: FileNode) => void
  ingestingPath: string | null
  depth: number
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (path: string) => {
    setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  // Sort: folders first, then files, alphabetical within each group
  const sorted = [...nodes].sort((a, b) => {
    if (a.is_dir && !b.is_dir) return -1
    if (!a.is_dir && b.is_dir) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      {sorted.map((node) => {
        if (node.is_dir && node.children) {
          const isCollapsed = collapsed[node.path] ?? false
          return (
            <div key={node.path}>
              <button
                onClick={() => toggle(node.path)}
                className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                style={{ paddingLeft: `${depth * 16 + 4}px` }}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                )}
                <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="truncate font-medium">{node.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/60 shrink-0">
                  {countFiles(node.children)}
                </span>
              </button>
              {!isCollapsed && (
                <SourceTree
                  nodes={node.children}
                  onOpen={onOpen}
                  onIngest={onIngest}
                  onDelete={onDelete}
                  ingestingPath={ingestingPath}
                  depth={depth + 1}
                />
              )}
            </div>
          )
        }

        return (
          <div
            key={node.path}
            className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            style={{ paddingLeft: `${depth * 16 + 4}px` }}
          >
            <button
              onClick={() => onOpen(node)}
              className="flex flex-1 items-center gap-2 truncate px-2 py-1 text-left"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="提取到 Wiki"
              disabled={ingestingPath === node.path}
              onClick={() => onIngest(node)}
            >
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              title="删除"
              onClick={() => onDelete(node)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      })}
    </>
  )
}

function flattenMdFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenMdFiles(node.children))
    } else if (!node.is_dir && node.name.endsWith(".md")) {
      files.push(node)
    }
  }
  return files
}
