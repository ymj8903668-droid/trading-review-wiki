import { streamChat } from "@/lib/llm-client"
import { writeFile } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"
import { generateSummaryFromContent, buildSummaryManifestEntry } from "@/lib/summary-layer"
import {
  shouldUseMultiAgent,
  planIngestTasks,
  mergeWriterOutputs,
  type IngestPlan,
  type WriterOutput,
} from "@/lib/multi-agent"
import { LANGUAGE_RULE } from "@/lib/ingest"
import type { LlmConfig } from "@/stores/wiki-store"
import type { ChatMessage } from "@/lib/llm-providers"

export interface MultiAgentIngestOptions {
  projectPath: string
  fileName: string
  sourceContent: string
  analysis: string
  llmConfig: LlmConfig
  schema: string
  purpose: string
  index: string
  overview: string
  wikiDirs: string[]
  signal?: AbortSignal
  onProgress?: (stage: string, detail: string) => void
}

export interface MultiAgentResult {
  writtenPaths: string[]
  reviewItems: string
}

const MAX_PARALLEL_WRITERS = 3

export async function multiAgentIngest(opts: MultiAgentIngestOptions): Promise<MultiAgentResult> {
  const { projectPath, fileName, sourceContent, analysis, llmConfig, schema, purpose, index, overview, wikiDirs, signal, onProgress } = opts
  const pp = normalizePath(projectPath)

  // ── Stage 1: Plan ──
  onProgress?.("plan", "Planning wiki page generation...")

  const plan = planIngestTasks(analysis, fileName)

  // If plan has very few tasks, fall back to single-agent
  if (plan.entities.length + plan.concepts.length === 0) {
    onProgress?.("plan", "Simple source — using direct generation")
    return { writtenPaths: [], reviewItems: "" }
  }

  // ── Stage 2: Parallel Writers ──
  onProgress?.("write", `Generating ${plan.entities.length + plan.concepts.length + 1} pages in parallel...`)

  const writerTasks: Array<{ type: WriterOutput["type"]; name: string; prompt: ChatMessage[] }> = []

  // Source summary writer
  writerTasks.push({
    type: "source_summary",
    name: fileName,
    prompt: buildWriterPrompt("source_summary", {
      fileName,
      context: plan.sourceSummary.keyPoints.join("; "),
      schema,
      purpose,
      wikiDirs,
      analysis,
    }),
  })

  // Entity writers
  for (const entity of plan.entities) {
    writerTasks.push({
      type: "entity",
      name: entity.name,
      prompt: buildWriterPrompt("entity", {
        fileName,
        entityName: entity.name,
        entityCode: entity.code,
        context: entity.context,
        schema,
        purpose,
        wikiDirs,
      }),
    })
  }

  // Concept writers
  for (const concept of plan.concepts) {
    writerTasks.push({
      type: "concept",
      name: concept.name,
      prompt: buildWriterPrompt("concept", {
        fileName,
        conceptName: concept.name,
        context: concept.context,
        schema,
        purpose,
        wikiDirs,
      }),
    })
  }

  // Execute writers with concurrency limit
  const outputs = await executeWritersParallel(writerTasks, llmConfig, signal, MAX_PARALLEL_WRITERS, onProgress)

  if (outputs.length === 0) {
    return { writtenPaths: [], reviewItems: "" }
  }

  // ── Stage 3: Merge ──
  onProgress?.("merge", "Validating and merging outputs...")

  const merged = mergeWriterOutputs(outputs, fileName)

  // ── Stage 4: Write files ──
  onProgress?.("write_files", "Writing files to disk...")

  const writtenPaths: string[] = []
  for (const file of merged.files) {
    const fullPath = `${pp}/${file.path}`
    try {
      await writeFile(fullPath, file.content)
      writtenPaths.push(file.path)
    } catch (err) {
      console.error(`[multi-agent] Failed to write ${fullPath}:`, err)
    }
  }

  // Write index update (append)
  if (merged.indexEntries.length > 0) {
    try {
      const indexPath = `${pp}/wiki/index.md`
      const { readFile } = await import("@/commands/fs")
      let existingIndex = ""
      try { existingIndex = await readFile(indexPath) } catch { /* new file */ }
      const newEntries = merged.indexEntries.join("\n")
      await writeFile(indexPath, existingIndex + "\n" + newEntries + "\n")
      writtenPaths.push("wiki/index.md")
    } catch (err) {
      console.error("[multi-agent] Failed to update index:", err)
    }
  }

  // Write log entry (append)
  if (merged.logEntry) {
    try {
      const logPath = `${pp}/wiki/log.md`
      const { readFile } = await import("@/commands/fs")
      let existingLog = ""
      try { existingLog = await readFile(logPath) } catch { /* new file */ }
      await writeFile(logPath, existingLog + "\n\n" + merged.logEntry + "\n")
      writtenPaths.push("wiki/log.md")
    } catch (err) {
      console.error("[multi-agent] Failed to update log:", err)
    }
  }

  // Generate summaries for written pages
  for (const file of merged.files) {
    const summary = generateSummaryFromContent(file.content)
    if (summary) {
      const summaryDir = `${pp}/wiki/.summaries`
      const summaryFileName = file.path.split("/").pop()?.replace(/\.md$/, ".summary.md") || ""
      if (summaryFileName) {
        try {
          await writeFile(`${summaryDir}/${summaryFileName}`, summary)
        } catch {
          // non-critical
        }
      }
    }
  }

  return { writtenPaths, reviewItems: "" }
}

// ── Writer execution with concurrency control ──

async function executeWritersParallel(
  tasks: Array<{ type: WriterOutput["type"]; name: string; prompt: ChatMessage[] }>,
  llmConfig: LlmConfig,
  signal: AbortSignal | undefined,
  maxParallel: number,
  onProgress?: (stage: string, detail: string) => void,
): Promise<WriterOutput[]> {
  const results: WriterOutput[] = []
  const queue = [...tasks]
  const active: Promise<void>[] = []

  async function runOne(task: typeof tasks[0]): Promise<void> {
    if (signal?.aborted) return

    let content = ""
    try {
      await streamChat(
        llmConfig,
        task.prompt,
        {
          onToken: (token) => { content += token },
          onDone: () => {},
          onError: (err) => {
            console.error(`[multi-agent] Writer "${task.name}" failed:`, err.message)
          },
        },
        signal,
      )

      if (content) {
        const targetPath = extractTargetPath(content, task.type, task.name)
        results.push({ type: task.type, targetPath, content })
        onProgress?.("write", `Completed: ${task.name}`)
      }
    } catch (err) {
      console.error(`[multi-agent] Writer "${task.name}" error:`, err)
    }
  }

  // Simple semaphore-based parallel execution
  let idx = 0
  while (idx < queue.length) {
    if (signal?.aborted) break

    const batch = queue.slice(idx, idx + maxParallel)
    await Promise.all(batch.map((task) => runOne(task)))
    idx += maxParallel
  }

  return results
}

// ── Prompt builders ──

interface WriterContext {
  fileName: string
  schema: string
  purpose: string
  wikiDirs: string[]
  context?: string
  analysis?: string
  entityName?: string
  entityCode?: string
  conceptName?: string
}

function buildWriterPrompt(type: WriterOutput["type"], ctx: WriterContext): ChatMessage[] {
  const dirList = ctx.wikiDirs.length > 0 ? ctx.wikiDirs.join(", ") : "wiki/entities/, wiki/concepts/"

  const baseRules = [
    LANGUAGE_RULE,
    "",
    "## Frontmatter Rules",
    "Every page MUST have YAML frontmatter with: type, title, created, updated, tags, related, sources, confidence_grade, confidence_reason.",
    `The sources field MUST contain: ["${ctx.fileName}"]`,
    "Use [[wikilink]] syntax for cross-references.",
    "",
    `Available wiki directories: ${dirList}`,
    "Use Chinese directories when available (e.g. wiki/股票/ not wiki/stocks/).",
  ].join("\n")

  if (type === "source_summary") {
    return [
      {
        role: "system",
        content: [
          "You are a wiki writer. Generate a single source summary page.",
          baseRules,
          "",
          "Output the COMPLETE file content (with frontmatter). Nothing else.",
          `File path: wiki/sources/${ctx.fileName.replace(/\.[^.]+$/, "")}.md`,
          `Type: source`,
        ].join("\n"),
      },
      {
        role: "user",
        content: `Write a source summary for "${ctx.fileName}".\n\nAnalysis:\n${ctx.analysis || ctx.context || ""}`,
      },
    ]
  }

  if (type === "entity") {
    const stockDir = ctx.wikiDirs.find((d) => d.includes("股票")) || "wiki/entities"
    return [
      {
        role: "system",
        content: [
          `You are a wiki writer. Generate a single entity page for "${ctx.entityName}".`,
          baseRules,
          "",
          "Output the COMPLETE file content (with frontmatter). Nothing else.",
          `File path: ${stockDir}${ctx.entityName}.md`,
          ctx.entityCode ? `Stock code: ${ctx.entityCode}` : "",
        ].filter(Boolean).join("\n"),
      },
      {
        role: "user",
        content: `Write a wiki page for entity "${ctx.entityName}".\n\nContext: ${ctx.context || ""}`,
      },
    ]
  }

  // concept
  const conceptDir = ctx.wikiDirs.find((d) => d.includes("概念") || d.includes("concept")) || "wiki/concepts"
  return [
    {
      role: "system",
      content: [
        `You are a wiki writer. Generate a single concept page for "${ctx.conceptName}".`,
        baseRules,
        "",
        "Output the COMPLETE file content (with frontmatter). Nothing else.",
        `File path: ${conceptDir}${ctx.conceptName}.md`,
      ].join("\n"),
    },
    {
      role: "user",
      content: `Write a wiki page for concept "${ctx.conceptName}".\n\nContext: ${ctx.context || ""}`,
    },
  ]
}

function extractTargetPath(content: string, type: WriterOutput["type"], name: string): string {
  // Try to find path from frontmatter or content structure
  const pathMatch = content.match(/^(?:File path|path):\s*(.+\.md)/m)
  if (pathMatch) return pathMatch[1].trim()

  // Fallback based on type
  if (type === "source_summary") return `wiki/sources/${name.replace(/\.[^.]+$/, "")}.md`
  if (type === "entity") return `wiki/股票/${name}.md`
  return `wiki/概念/${name}.md`
}
