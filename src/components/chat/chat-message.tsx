import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"
import {
  Bot, User, FileText, BookmarkPlus, ChevronDown, ChevronRight, RefreshCw, Copy, Check,
  Users, Lightbulb, BookOpen, HelpCircle, GitMerge, BarChart3, Layout, Globe, Paperclip,
} from "lucide-react"
import { useWikiStore } from "@/stores/wiki-store"
import { readFile, writeFile, listDirectory, readFileBinary, createDirectory } from "@/commands/fs"
import { useChatStore } from "@/stores/chat-store"
import type { DisplayMessage } from "@/stores/chat-store"
import type { FileNode } from "@/types/wiki"

import { convertLatexToUnicode } from "@/lib/latex-to-unicode"
import { enrichWithWikilinks } from "@/lib/enrich-wikilinks"
import { normalizePath, getFileName } from "@/lib/path-utils"

// Module-level cache of source file names
let cachedSourceFiles: string[] = []

export function useSourceFiles() {
  const project = useWikiStore((s) => s.project)

  useEffect(() => {
    if (!project) return
    const pp = normalizePath(project.path)
    listDirectory(`${pp}/raw/sources`)
      .then((tree) => {
        cachedSourceFiles = flattenNames(tree)
      })
      .catch(() => {
        cachedSourceFiles = []
      })
  }, [project])

  return cachedSourceFiles
}

function flattenNames(nodes: FileNode[]): string[] {
  const names: string[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      names.push(...flattenNames(node.children))
    } else if (!node.is_dir) {
      names.push(node.name)
    }
  }
  return names
}

interface ChatMessageProps {
  message: DisplayMessage
  isLastAssistant?: boolean
  onRegenerate?: () => void
}

export function ChatMessage({ message, isLastAssistant, onRegenerate }: ChatMessageProps) {
  const isUser = message.role === "user"
  const isSystem = message.role === "system"
  const isAssistant = message.role === "assistant"
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isSystem
            ? "bg-accent text-accent-foreground"
            : isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="max-w-[80%] flex flex-col gap-1.5">
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          }`}
        >
          <MarkdownContent content={message.content} />
        </div>
        {isAssistant && <CitedReferencesPanel content={message.content} savedReferences={message.references} />}
        {isAssistant && hovered && (
          <div className="flex items-center gap-1">
            <CopyButton content={message.content} />
            <SaveToWikiButton content={message.content} visible={true} />
            {isLastAssistant && onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Regenerate this response"
              >
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    // Strip HTML comments and thinking blocks before copying
    const clean = content
      .replace(/<!--.*?-->/gs, "")
      .replace(/<think(?:ing)?>\s*[\s\S]*?<\/think(?:ing)?>\s*/gi, "")
      .replace(/<think(?:ing)?>\s*[\s\S]*$/gi, "")
      .trim()

    await navigator.clipboard.writeText(clean)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }, [content])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}

interface WikiPage {
  frontmatter: string
  body: string
}

function splitMultiPageContent(content: string): WikiPage[] {
  const pages: WikiPage[] = []
  // Only match valid frontmatter blocks: --- must contain at least one "key: value" line
  // This avoids treating markdown horizontal rules (---) as page boundaries
  // Allow empty lines within frontmatter for flexibility
  const pageRegex = /^---\n((?:(?:[a-zA-Z0-9_\u4e00-\u9fa5]+:\s*.+)?\n)+)---\n([\s\S]*?)(?=\n---\n|$)/gm
  let match: RegExpExecArray | null
  while ((match = pageRegex.exec(content)) !== null) {
    // Validate: frontmatter must contain at least one "key: value" line
    const hasKeyValue = /^[a-zA-Z0-9_\u4e00-\u9fa5]+:\s*.+/m.test(match[1])
    if (hasKeyValue) {
      pages.push({ frontmatter: match[1], body: match[2] })
    }
  }
  if (pages.length === 0) {
    return [{ frontmatter: "", body: content }]
  }
  return pages
}

function SaveToWikiButton({ content, visible }: { content: string; visible: boolean }) {
  const project = useWikiStore((s) => s.project)
  const setFileTree = useWikiStore((s) => s.setFileTree)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!project || saving) return
    const pp = normalizePath(project.path)
    setSaving(true)

    // Track files created in this batch to avoid duplicate slugs within same save
    const batchCreatedNames = new Map<string, Set<string>>()
    const failedPages: string[] = []

    try {
      // Strip hidden sources comment and thinking blocks from content first
      const cleanContent = content
        .replace(/<!--\s*sources:.*?-->/g, "")
        .replace(/<think(?:ing)?>\s*[\s\S]*?<\/think(?:ing)?>\s*/gi, "")
        .replace(/<think(?:ing)?>\s*[\s\S]*$/gi, "")
        .trimEnd()

      // Split content into multiple pages if separated by --- frontmatter blocks
      const pages = splitMultiPageContent(cleanContent)
      const date = new Date().toISOString().slice(0, 10)

      // Collect index and log entries to write once after all pages
      const indexEntries: Array<{ sectionHeader: string; entry: string }> = []
      const logEntries: string[] = []

      for (const page of pages) {
        let fmType = ""
        let fmTitle = ""
        if (page.frontmatter) {
          const typeMatch = page.frontmatter.match(/^type:\s*(.+)$/m)
          if (typeMatch) fmType = typeMatch[1].trim()
          const titleMatch = page.frontmatter.match(/^title:\s*(.+)$/m)
          if (titleMatch) fmTitle = titleMatch[1].trim().replace(/^["']|["']$/g, "")
        }

        // Generate title: prefer frontmatter title, then first non-empty line heading, then fallback
        const firstNonEmptyLine = page.body.split("\n").find((line) => line.trim().length > 0) || ""
        const firstLine = firstNonEmptyLine.replace(/^#+\s*/, "").trim()
        let title = fmTitle || firstLine.slice(0, 60) || "Saved Query"

        // Detect directory prefix from title like "预测/杰哥下周机会预测"
        let subDir = "queries"
        let fileTitle = title
        if (title.includes("/")) {
          const parts = title.split("/")
          subDir = parts[0].trim()
          fileTitle = parts.slice(1).join("/").trim()
        } else if (fmType) {
          // Use frontmatter type as directory (e.g., type: 预测 -> wiki/预测/)
          subDir = fmType
        }

        // Sanitize slug for filename — keep CJK chars, remove unsafe filesystem chars
        const slug = fileTitle
          .toLowerCase()
          .replace(/[\/*?"<>|]/g, "")   // remove Windows-invalid chars
          .replace(/\s+/g, "-")
          .trim()
          .replace(/^-+|-+$/g, "")          // trim leading/trailing hyphens
          .slice(0, 50)
        const safeSlug = slug || "untitled"
        const baseFileName = `${safeSlug}-${date}.md`

        // Ensure target directory exists
        try {
          await createDirectory(`${pp}/wiki/${subDir}`)
        } catch {
          // Directory may already exist, ignore error
        }

        // Ensure unique file name (disk + batch)
        const dirFiles = await listDirectory(`${pp}/wiki/${subDir}`).catch(() => [] as { name: string; is_dir: boolean }[])
        const diskNames = new Set(dirFiles.map((n) => n.name))
        const batchNames = batchCreatedNames.get(subDir) || new Set<string>()
        const existingNames = new Set([...diskNames, ...batchNames])

        let fileName = baseFileName
        let counter = 1
        while (existingNames.has(fileName)) {
          const base = baseFileName.replace(/\.md$/, "")
          fileName = `${base}-${counter}.md`
          counter++
        }
        batchNames.add(fileName)
        batchCreatedNames.set(subDir, batchNames)

        const filePath = `${pp}/wiki/${subDir}/${fileName}`

        // If page has frontmatter, reconstruct full content; otherwise prepend default frontmatter
        let finalContent: string
        if (page.frontmatter) {
          finalContent = `---\n${page.frontmatter}\n---\n${page.body}`
        } else {
          const frontmatter = [
            "---",
            `type: ${subDir === "queries" ? "query" : subDir}`,
            `title: "${fileTitle.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
            `created: ${date}`,
            `tags: []`,
            "---",
            "",
          ].join("\n")
          finalContent = frontmatter + page.body
        }

        try {
          await writeFile(filePath, finalContent)
        } catch (writeErr) {
          console.error(`Failed to write page ${title}:`, writeErr)
          failedPages.push(title)
          continue // Skip index/log/auto-ingest for this failed page
        }

        // Collect index entry
        const wikiLinkName = fileName.replace(/\.md$/, "")
        const sectionTitle = subDir === "queries" ? "Queries" : subDir
        const sectionHeader = `## ${sectionTitle}`
        const entry = `- [[${subDir}/${wikiLinkName}|${fileTitle}]]`
        indexEntries.push({ sectionHeader, entry })

        // Collect log entry
        logEntries.push(`- ${date}: Saved ${subDir} page \`${fileName}\``)

        // Full auto-ingest: extract entities, concepts, cross-references from saved content
        try {
          const llmConfig = useWikiStore.getState().llmConfig
          const { autoIngest } = await import("@/lib/ingest")
          await autoIngest(pp, filePath, llmConfig)
        } catch (err) {
          console.error("Failed to auto-ingest saved query:", err)
        }
      }

      // Batch write index.md once
      if (indexEntries.length > 0) {
        const indexPath = `${pp}/wiki/index.md`
        let indexContent = ""
        try {
          indexContent = await readFile(indexPath)
        } catch {
          indexContent = "# Wiki Index\n"
        }
        for (const { sectionHeader, entry } of indexEntries) {
          if (indexContent.includes(sectionHeader)) {
            // Escape special regex chars in sectionHeader for safe RegExp construction
            const escapedHeader = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            indexContent = indexContent.replace(
              new RegExp(`(${escapedHeader}\n)`),
              `$1${entry}\n`
            )
          } else {
            indexContent = indexContent.trimEnd() + `\n\n${sectionHeader}\n` + entry + "\n"
          }
        }
        await writeFile(indexPath, indexContent)
      }

      // Batch write log.md once
      if (logEntries.length > 0) {
        const logPath = `${pp}/wiki/log.md`
        let logContent = ""
        try {
          logContent = await readFile(logPath)
        } catch {
          logContent = "# Wiki Log\n\n"
        }
        await writeFile(logPath, logContent.trimEnd() + "\n" + logEntries.join("\n") + "\n")
      }

      // Refresh file tree and update graph once after all pages saved
      const tree = await listDirectory(pp)
      setFileTree(tree)
      useWikiStore.getState().bumpDataVersion()

      if (failedPages.length > 0) {
        console.warn(`Save to wiki completed with ${failedPages.length} failures:`, failedPages)
      }
      setSaved(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error("Failed to save to wiki:", err)
    } finally {
      setSaving(false)
    }
  }, [project, content, saving, setFileTree])

  if (!visible && !saved) return null

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={saving}
      className="self-start inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
      title="Save to wiki"
    >
      <BookmarkPlus className="h-3 w-3" />
      {saved ? "Saved!" : saving ? "Saving..." : "Save to Wiki"}
    </button>
  )
}

interface CitedPage {
  title: string
  path: string
}

const REF_TYPE_CONFIG: Record<string, { icon: typeof FileText; color: string }> = {
  entity: { icon: Users, color: "text-blue-500" },
  concept: { icon: Lightbulb, color: "text-purple-500" },
  source: { icon: BookOpen, color: "text-orange-500" },
  query: { icon: HelpCircle, color: "text-green-500" },
  synthesis: { icon: GitMerge, color: "text-red-500" },
  comparison: { icon: BarChart3, color: "text-teal-500" },
  overview: { icon: Layout, color: "text-yellow-500" },
  clip: { icon: Globe, color: "text-blue-400" },
}

function getRefType(path: string): string {
  if (path.includes("/entities/")) return "entity"
  if (path.includes("/concepts/")) return "concept"
  if (path.includes("/sources/")) return "source"
  if (path.includes("/queries/")) return "query"
  if (path.includes("/synthesis/")) return "synthesis"
  if (path.includes("/comparisons/")) return "comparison"
  if (path.includes("overview")) return "overview"
  if (path.includes("raw/sources/")) return "clip"
  // Chinese wiki directories
  if (path.includes("/股票/")) return "entity"
  if (path.includes("/概念/")) return "concept"
  if (path.includes("/模式/")) return "concept"
  if (path.includes("/策略/")) return "synthesis"
  if (path.includes("/错误/")) return "comparison"
  if (path.includes("/市场环境/")) return "overview"
  if (path.includes("/进化/")) return "synthesis"
  if (path.includes("/预测/")) return "query"
  if (path.includes("/总结/")) return "synthesis"
  return "source"
}

function CitedReferencesPanel({ content, savedReferences }: { content: string; savedReferences?: CitedPage[] }) {
  const project = useWikiStore((s) => s.project)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const [expanded, setExpanded] = useState(false)

  // Use saved references first (persisted with message), fall back to dynamic extraction
  const citedPages = useMemo(() => {
    if (savedReferences && savedReferences.length > 0) return savedReferences
    return extractCitedPages(content)
  }, [content, savedReferences])

  if (citedPages.length === 0) return null

  const MAX_COLLAPSED = 3
  const visiblePages = expanded ? citedPages : citedPages.slice(0, MAX_COLLAPSED)
  const hasMore = citedPages.length > MAX_COLLAPSED

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 text-xs mb-1">
      <button
        type="button"
        onClick={() => hasMore && setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <FileText className="h-3 w-3 shrink-0" />
        <span className="font-medium">References ({citedPages.length})</span>
        {hasMore && (
          expanded
            ? <ChevronDown className="h-3 w-3 ml-auto" />
            : <ChevronRight className="h-3 w-3 ml-auto" />
        )}
      </button>
      <div className="px-2 pb-1.5">
        {visiblePages.map((page, i) => {
          const refType = getRefType(page.path)
          const config = REF_TYPE_CONFIG[refType] ?? REF_TYPE_CONFIG.source
          const Icon = config.icon
          return (
            <button
              key={page.path}
              type="button"
              onClick={async () => {
                if (!project) return
                const pp = normalizePath(project.path)
                // Try the given path first, then search all wiki subdirectories
                const id = getFileName(page.path.replace(/^wiki\//, "").replace(/\.md$/, ""))
                const candidates = [
                  `${pp}/${page.path}`,
                  `${pp}/wiki/entities/${id}.md`,
                  `${pp}/wiki/concepts/${id}.md`,
                  `${pp}/wiki/sources/${id}.md`,
                  `${pp}/wiki/queries/${id}.md`,
                  `${pp}/wiki/synthesis/${id}.md`,
                  `${pp}/wiki/comparisons/${id}.md`,
                  `${pp}/wiki/${id}.md`,
                ]
                for (const candidate of candidates) {
                  try {
                    await readFile(candidate)
                    setSelectedFile(candidate)
                    return
                  } catch {
                    // try next
                  }
                }
                // Last resort: set the original path anyway
                setSelectedFile(`${pp}/${page.path}`)
              }}
              className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-accent/50 transition-colors"
              title={page.path}
            >
              <span className="text-[10px] text-muted-foreground/60 w-4 shrink-0 text-right">[{i + 1}]</span>
              <Icon className={`h-3 w-3 shrink-0 ${config.color}`} />
              <span className="truncate text-foreground/80">{page.title}</span>
            </button>
          )
        })}
        {hasMore && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full text-center text-[10px] text-muted-foreground hover:text-primary pt-0.5"
          >
            +{citedPages.length - MAX_COLLAPSED} more...
          </button>
        )}
      </div>
    </div>
  )
}


/**
 * Extract cited wiki pages from the hidden <!-- cited: 1, 3, 5 --> comment.
 * Maps page numbers back to the pages that were sent to the LLM.
 */
function extractCitedPages(text: string): CitedPage[] {
  const queryPages = useChatStore.getState().lastQueryPages
  const citedMatch = text.match(/<!--\s*cited:\s*(.+?)\s*-->/)
  if (citedMatch && queryPages.length > 0) {
    const numbers = citedMatch[1]
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= queryPages.length)

    const pages = numbers.map((n) => queryPages[n - 1])
    if (pages.length > 0) return pages
  }

  // Fallback: if LLM used [1], [2] notation in text, try to match those
  if (queryPages.length > 0) {
    const numberRefs = text.match(/\[(\d+)\]/g)
    if (numberRefs) {
      const numbers = [...new Set(numberRefs.map((r) => parseInt(r.slice(1, -1), 10)))]
        .filter((n) => n >= 1 && n <= queryPages.length)
      if (numbers.length > 0) {
        return numbers.map((n) => queryPages[n - 1])
      }
    }
  }

  // Fallback for persisted messages: extract [[wikilinks]] from the text
  // Try to resolve each wikilink to a real file path by checking common wiki subdirectories
  const wikilinks = text.match(/\[\[[^\]|]+?(?:\|[^\]]+?)?\]\]/g)
  if (wikilinks) {
    const seen = new Set<string>()
    const pages: CitedPage[] = []
    const WIKI_DIRS = ["entities", "concepts", "sources", "queries", "synthesis", "comparisons"]

    for (const link of wikilinks) {
      const nameMatch = link.match(/\[\[[^\]|]+?(?:\|([^\]]+?))?\]\]/)
      if (nameMatch) {
        const id = nameMatch[1].trim()
        const display = nameMatch[2]?.trim() || id

        // Skip if id contains path separators (already a path like queries/xxx)
        if (seen.has(id)) continue
        seen.add(id)

        // Try to find the file in known wiki subdirectories
        let resolvedPath = ""
        if (id.includes("/")) {
          // Already has directory like "queries/my-query"
          resolvedPath = `wiki/${id}.md`
        } else {
          // Use wiki root as default; click handler will try all subdirectories
          resolvedPath = `wiki/${id}.md`
        }

        pages.push({ title: display, path: resolvedPath })
      }
    }
    if (pages.length > 0) return pages
  }

  // No citations found
  return []
}

interface StreamingMessageProps {
  content: string
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  const { thinking, answer } = useMemo(() => separateThinking(content), [content])
  const isThinking = thinking !== null && answer.length === 0

  return (
    <div className="flex gap-2 flex-row">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot className="h-4 w-4" />
      </div>
      <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
        {isThinking ? (
          <StreamingThinkingBlock content={thinking} />
        ) : (
          <>
            {thinking && <ThinkingBlock content={thinking} />}
            <MarkdownContent content={answer} />
            <span className="animate-pulse">▊</span>
          </>
        )}
      </div>
    </div>
  )
}

function LocalImage({ src, alt }: { src: string; alt?: string }) {
  const project = useWikiStore((s) => s.project)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (src.startsWith("http")) {
      setUrl(src)
      return
    }
    let objectUrl: string | null = null
    let cancelled = false

    const load = async () => {
      const pp = project ? normalizePath(project.path) : ""
      const absolutePath = src.startsWith("/") ? src : `${pp}/${src}`
      try {
        const data = await readFileBinary(absolutePath)
        if (cancelled) return
        const blob = new Blob([data])
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch (err) {
        console.error("Failed to load chat image:", err)
        setUrl(null)
      }
    }

    load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, project])

  if (!url) {
    return (
      <span className="inline-block rounded border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
        [Image: {alt || src}]
      </span>
    )
  }

  return (
    <img
      src={url}
      alt={alt || "image"}
      className="my-2 max-h-64 max-w-full rounded-md border object-contain"
    />
  )
}

function MarkdownContent({ content }: { content: string }) {
  // Strip hidden comments
  const cleaned = content.replace(/<!--.*?-->/gs, "").trimEnd()

  // Separate thinking blocks from main content
  const { thinking, answer } = useMemo(() => separateThinking(cleaned), [cleaned])
  const processed = useMemo(() => processContent(answer), [answer])

  return (
    <div>
      {thinking && <ThinkingBlock content={thinking} />}
      <div className="chat-markdown prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith("wikilink:")) {
                const pageName = href.slice("wikilink:".length)
                return <WikiLink pageName={pageName}>{children}</WikiLink>
              }
              return (
                <span className="text-primary underline cursor-default" title={href}>
                  {children}
                </span>
              )
            },
            table: ({ children, ...props }) => (
              <div className="my-2 overflow-x-auto rounded border border-border">
                <table className="w-full border-collapse text-xs" {...props}>{children}</table>
              </div>
            ),
            thead: ({ children, ...props }) => (
              <thead className="bg-muted" {...props}>{children}</thead>
            ),
            th: ({ children, ...props }) => (
              <th className="border border-border/80 px-3 py-1.5 text-left font-semibold bg-muted" {...props}>{children}</th>
            ),
            td: ({ children, ...props }) => (
              <td className="border border-border/60 px-3 py-1.5" {...props}>{children}</td>
            ),
            img: ({ src, alt }) => {
              if (!src) return null
              return <LocalImage src={src} alt={alt} />
            },
            pre: ({ children, ...props }) => (
              <pre className="rounded bg-background/50 p-2 text-xs overflow-x-auto" {...props}>{children}</pre>
            ),
          }}
        >
          {processed}
        </ReactMarkdown>
      </div>
    </div>
  )
}

/**
 * Separate <think>...</think> blocks from the main answer.
 * Handles multiple think blocks and partial (unclosed) thinking during streaming.
 */
function separateThinking(text: string): { thinking: string | null; answer: string } {
  // Match complete <think>...</think> and <thinking>...</thinking> blocks
  const thinkRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi
  const thinkParts: string[] = []
  let answer = text

  let match: RegExpExecArray | null
  while ((match = thinkRegex.exec(text)) !== null) {
    thinkParts.push(match[1].trim())
  }
  answer = answer.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim()

  // Handle unclosed <think> or <thinking> tag (streaming in progress)
  const unclosedMatch = answer.match(/<think(?:ing)?>([\s\S]*)$/i)
  if (unclosedMatch) {
    thinkParts.push(unclosedMatch[1].trim())
    answer = answer.replace(/<think(?:ing)?>[\s\S]*$/i, "").trim()
  }

  const thinking = thinkParts.length > 0 ? thinkParts.join("\n\n") : null
  return { thinking, answer }
}

/** Streaming thinking: shows latest ~5 lines rolling upward with animation */
function StreamingThinkingBlock({ content }: { content: string }) {
  const lines = content.split("\n").filter((l) => l.trim())
  const visibleLines = lines.slice(-5)

  return (
    <div className="rounded-md border border-dashed border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-sm animate-pulse">💭</span>
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Thinking...</span>
        <span className="text-[10px] text-amber-600/50 dark:text-amber-500/40">{lines.length} lines</span>
      </div>
      <div className="h-[5lh] overflow-hidden text-xs text-amber-800/70 dark:text-amber-300/60 font-mono leading-relaxed">
        {visibleLines.map((line, i) => (
          <div
            key={lines.length - 5 + i}
            className="truncate"
            style={{ opacity: 0.4 + (i / visibleLines.length) * 0.6 }}
          >
            {line}
          </div>
        ))}
        <span className="animate-pulse text-amber-500">▊</span>
      </div>
    </div>
  )
}

/** Completed thinking: collapsed by default, click to expand */
function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const lines = content.split("\n").filter((l) => l.trim())

  return (
    <div className="mb-2 rounded-md border border-dashed border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors"
      >
        <span className="text-sm">💭</span>
        <span className="font-medium">Thought for {lines.length} lines</span>
        <span className="text-amber-600/60 dark:text-amber-500/60">
          {expanded ? "▼" : "▶"}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-amber-500/20 px-2.5 py-2 text-xs text-amber-800/80 dark:text-amber-300/70 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono leading-relaxed">
          {content}
        </div>
      )}
    </div>
  )
}

/**
 * Process content to create clickable links:
 * - [[wikilinks]] → markdown links with wikilink: protocol
 */
function processContent(text: string): string {
  let result = text

  // Wrap bare \begin{...}...\end{...} blocks with $$ for remark-math
  result = result.replace(
    /(?<!\$\$\s*)(\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})(?!\s*\$\$)/g,
    (_match, block: string) => `$$\n${block}\n$$`,
  )

  // Only apply Unicode conversion to text outside of math delimiters
  // Split on $$...$$ and $...$ blocks, only convert non-math parts
  const parts = result.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g)
  result = parts
    .map((part) => {
      if (part.startsWith("$")) return part // preserve math
      return convertLatexToUnicode(part)
    })
    .join("")

  // Fix malformed wikilinks like [[name] (missing closing bracket)
  result = result.replace(/\[\[([^\]]+)\](?!\])/g, "[[$1]]")

  // Convert [[wikilinks]] to markdown links
  result = result.replace(
    /\[\[[^\]|]+?(?:\|([^\]]+?))?\]\]/g,
    (_match, pageName: string | undefined, displayText?: string) => {
      const pn = pageName ?? ""
      const display = displayText?.trim() || pn.trim()
      return `[${display}](wikilink:${pn.trim()})`
    },
  )

  return result
}

function SourceRef({ fileName }: { fileName: string }) {
  const project = useWikiStore((s) => s.project)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const setActiveView = useWikiStore((s) => s.setActiveView)

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!project) return
    const pp = normalizePath(project.path)

    // Try exact match first, then search with the name as given
    const candidates = [
      `${pp}/raw/sources/${fileName}`,
    ]

    // If fileName has no extension, try to find a matching file
    if (!fileName.includes(".")) {
      for (const sf of cachedSourceFiles) {
        const stem = sf.replace(/\.[^.]+$/, "")
        if (stem === fileName || sf.startsWith(fileName)) {
          candidates.unshift(`${pp}/raw/sources/${sf}`)
        }
      }
    }

    setActiveView("wiki")

    for (const path of candidates) {
      try {
        const content = await readFile(path)
        setSelectedFile(path)
        setFileContent(content)
        return
      } catch {
        // try next
      }
    }

    // Fallback: just set the path even if we can't read it
    setSelectedFile(candidates[0])
    setFileContent(`Unable to load: ${fileName}`)
  }, [project, fileName, setSelectedFile, setFileContent, setActiveView])

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-0.5 rounded bg-accent/50 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-accent transition-colors"
      title={`Open source: ${fileName}`}
    >
      <Paperclip className="inline h-3 w-3" />
      {fileName}
    </button>
  )
}

function WikiLink({ pageName, children }: { pageName: string; children: React.ReactNode }) {
  const project = useWikiStore((s) => s.project)
  const setSelectedFile = useWikiStore((s) => s.setSelectedFile)
  const setFileContent = useWikiStore((s) => s.setFileContent)
  const setActiveView = useWikiStore((s) => s.setActiveView)
  const [exists, setExists] = useState<boolean | null>(null)
  const resolvedPath = useRef<string | null>(null)

  useEffect(() => {
    if (!project) return
    const pp = normalizePath(project.path)
    // If pageName contains a directory prefix like "股票/英维克", use it directly
    const candidates = pageName.includes("/")
      ? [`${pp}/wiki/${pageName}.md`]
      : [
          `${pp}/wiki/entities/${pageName}.md`,
          `${pp}/wiki/concepts/${pageName}.md`,
          `${pp}/wiki/sources/${pageName}.md`,
          `${pp}/wiki/queries/${pageName}.md`,
          `${pp}/wiki/comparisons/${pageName}.md`,
          `${pp}/wiki/synthesis/${pageName}.md`,
          // Chinese directories
          `${pp}/wiki/股票/${pageName}.md`,
          `${pp}/wiki/概念/${pageName}.md`,
          `${pp}/wiki/模式/${pageName}.md`,
          `${pp}/wiki/策略/${pageName}.md`,
          `${pp}/wiki/人物/${pageName}.md`,
          `${pp}/wiki/错误/${pageName}.md`,
          `${pp}/wiki/总结/${pageName}.md`,
          `${pp}/wiki/预测/${pageName}.md`,
          `${pp}/wiki/进化/${pageName}.md`,
          `${pp}/wiki/查询/${pageName}.md`,
          `${pp}/wiki/市场环境/${pageName}.md`,
          `${pp}/wiki/市场模式/${pageName}.md`,
          `${pp}/wiki/个股档案/${pageName}.md`,
          `${pp}/wiki/${pageName}.md`,
        ]

    let cancelled = false
    async function check() {
      for (const path of candidates) {
        try {
          await readFile(path)
          if (!cancelled) {
            resolvedPath.current = path
            setExists(true)
          }
          return
        } catch {
          // try next
        }
      }
      if (!cancelled) setExists(false)
    }
    check()
    return () => { cancelled = true }
  }, [project, pageName])

  const handleClick = useCallback(async () => {
    if (!resolvedPath.current) return
    try {
      const content = await readFile(resolvedPath.current)
      setSelectedFile(resolvedPath.current)
      setFileContent(content)
      setActiveView("wiki")
    } catch {
      // ignore
    }
  }, [setSelectedFile, setFileContent, setActiveView])

  if (exists === false) {
    return (
      <span className="inline text-muted-foreground" title={`Page not found: ${pageName}`}>
        {children}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-primary underline decoration-primary/30 hover:bg-primary/10 hover:decoration-primary"
      title={`Open wiki page: ${pageName}`}
    >
      <FileText className="inline h-3 w-3" />
      {children}
    </button>
  )
}
