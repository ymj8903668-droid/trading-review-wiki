import { readFile, writeFile } from "@/commands/fs"
import { autoIngest } from "./ingest"
import { useWikiStore } from "@/stores/wiki-store"
import { normalizePath } from "@/lib/path-utils"

// ── Types ─────────────────────────────────────────────────────────────────

export interface IngestTask {
  id: string
  sourcePath: string  // relative to project: "raw/sources/folder/file.pdf"
  folderContext: string  // e.g. "AI-Research > papers" or ""
  status: "pending" | "processing" | "done" | "failed"
  addedAt: number
  error: string | null
  retryCount: number
}

// ── State ─────────────────────────────────────────────────────────────────

let queue: IngestTask[] = []
let processing = false
let currentProjectPath = ""

// Current task context — bundled together to avoid cross-task contamination
interface TaskContext {
  abortController: AbortController
  writtenFiles: string[]
}

let currentTask: TaskContext | null = null

// ── Persistence ───────────────────────────────────────────────────────────

function queueFilePath(projectPath: string): string {
  return `${normalizePath(projectPath)}/.llm-wiki/ingest-queue.json`
}

async function saveQueue(projectPath: string): Promise<void> {
  try {
    // Only save pending and failed tasks (done tasks are removed)
    const toSave = queue.filter((t) => t.status !== "done")
    await writeFile(queueFilePath(projectPath), JSON.stringify(toSave, null, 2))
  } catch {
    // non-critical
  }
}

async function loadQueue(projectPath: string): Promise<IngestTask[]> {
  try {
    const raw = await readFile(queueFilePath(projectPath))
    return JSON.parse(raw) as IngestTask[]
  } catch {
    return []
  }
}

// ── Queue Operations ──────────────────────────────────────────────────────

function generateId(): string {
  return `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Add a file to the ingest queue.
 */
export async function enqueueIngest(
  projectPath: string,
  sourcePath: string,
  folderContext: string = "",
): Promise<string> {
  const pp = normalizePath(projectPath)
  currentProjectPath = pp

  const task: IngestTask = {
    id: generateId(),
    sourcePath,
    folderContext,
    status: "pending",
    addedAt: Date.now(),
    error: null,
    retryCount: 0,
  }

  queue.push(task)
  await saveQueue(pp)

  // Start processing if not already running
  processNext(pp)

  return task.id
}

/**
 * Add multiple files to the queue at once.
 */
export async function enqueueBatch(
  projectPath: string,
  files: Array<{ sourcePath: string; folderContext: string }>,
): Promise<string[]> {
  const pp = normalizePath(projectPath)
  currentProjectPath = pp
  const ids: string[] = []

  for (const file of files) {
    const task: IngestTask = {
      id: generateId(),
      sourcePath: file.sourcePath,
      folderContext: file.folderContext,
      status: "pending",
      addedAt: Date.now(),
      error: null,
      retryCount: 0,
    }
    queue.push(task)
    ids.push(task.id)
  }

  await saveQueue(pp)
  console.log(`[Ingest Queue] Enqueued ${files.length} files`)
  processNext(pp)

  return ids
}

/**
 * Retry a failed task.
 */
export async function retryTask(projectPath: string, taskId: string): Promise<void> {
  const task = queue.find((t) => t.id === taskId)
  if (!task) return

  task.status = "pending"
  task.error = null
  await saveQueue(projectPath)
  processNext(normalizePath(projectPath))
}

/**
 * Cancel a pending or processing task.
 * If processing, aborts the LLM call and cleans up generated files.
 */
export async function cancelTask(projectPath: string, taskId: string): Promise<void> {
  const task = queue.find((t) => t.id === taskId)
  if (!task) return

  if (task.status === "processing") {
    // Abort the in-progress LLM call
    if (currentTask) {
      currentTask.abortController.abort()
      // Clean up any files written by the interrupted ingest
      if (currentTask.writtenFiles.length > 0) {
        const { deleteFile } = await import("@/commands/fs")
        for (const filePath of currentTask.writtenFiles) {
          try {
            const fullPath = filePath.startsWith("/") ? filePath : `${normalizePath(projectPath)}/${filePath}`
            await deleteFile(fullPath)
          } catch {
            // file may not exist
          }
        }
        console.log(`[Ingest Queue] Cleaned up ${currentTask.writtenFiles.length} files from cancelled task`)
      }
      currentTask = null
    }

    processing = false
  }

  queue = queue.filter((t) => t.id !== taskId)
  await saveQueue(projectPath)
  console.log(`[Ingest Queue] Cancelled: ${task.sourcePath}`)

  // Continue with next task
  processNext(normalizePath(projectPath))
}

/**
 * Clear all done/failed tasks from the queue.
 */
export async function clearCompletedTasks(projectPath: string): Promise<void> {
  queue = queue.filter((t) => t.status === "pending" || t.status === "processing")
  await saveQueue(projectPath)
}

/**
 * Get current queue state.
 */
export function getQueue(): readonly IngestTask[] {
  return queue
}

/**
 * Get queue summary.
 */
export function getQueueSummary(): { pending: number; processing: number; failed: number; total: number } {
  return {
    pending: queue.filter((t) => t.status === "pending").length,
    processing: queue.filter((t) => t.status === "processing").length,
    failed: queue.filter((t) => t.status === "failed").length,
    total: queue.length,
  }
}

// ── Restore on startup ───────────────────────────────────────────────────

/**
 * Load queue from disk and resume processing.
 * Called on app startup.
 */
export async function restoreQueue(projectPath: string): Promise<void> {
  const pp = normalizePath(projectPath)
  currentProjectPath = pp
  const saved = await loadQueue(pp)

  if (saved.length === 0) return

  // Reset any "processing" tasks back to "pending" (interrupted by app close)
  let restored = 0
  for (const task of saved) {
    if (task.status === "processing") {
      task.status = "pending"
      restored++
    }
  }

  queue = saved
  await saveQueue(pp)

  const pending = queue.filter((t) => t.status === "pending").length
  const failed = queue.filter((t) => t.status === "failed").length

  if (pending > 0 || restored > 0) {
    console.log(`[Ingest Queue] Restored: ${pending} pending, ${failed} failed, ${restored} resumed from interrupted`)
    processNext(pp)
  }
}

// ── Processing ────────────────────────────────────────────────────────────

const MAX_RETRIES = 3

async function processNext(projectPath: string): Promise<void> {
  if (processing) return

  const next = queue.find((t) => t.status === "pending")
  if (!next) return

  processing = true
  next.status = "processing"
  await saveQueue(projectPath)

  const pp = normalizePath(projectPath)
  const llmConfig = useWikiStore.getState().llmConfig

  // Check if LLM is configured
  if (!llmConfig.apiKey && llmConfig.provider !== "ollama" && llmConfig.provider !== "custom") {
    next.status = "failed"
    next.error = "LLM not configured — set API key in Settings"
    processing = false
    await saveQueue(pp)
    processNext(pp)
    return
  }

  const fullSourcePath = next.sourcePath.startsWith("/")
    ? next.sourcePath
    : `${pp}/${next.sourcePath}`

  console.log(`[Ingest Queue] Processing: ${next.sourcePath} (${queue.filter((t) => t.status === "pending").length} remaining)`)

  // Create task context for this ingest
  const taskContext: TaskContext = {
    abortController: new AbortController(),
    writtenFiles: [],
  }
  currentTask = taskContext

  try {
    const writtenFiles = await autoIngest(pp, fullSourcePath, llmConfig, taskContext.abortController.signal, next.folderContext)
    taskContext.writtenFiles = writtenFiles

    // Success: remove from queue
    currentTask = null
    queue = queue.filter((t) => t.id !== next.id)
    await saveQueue(pp)

    console.log(`[Ingest Queue] Done: ${next.sourcePath}`)
  } catch (err) {
    currentTask = null
    const message = err instanceof Error ? err.message : String(err)
    next.retryCount++
    next.error = message

    if (next.retryCount >= MAX_RETRIES) {
      next.status = "failed"
      console.log(`[Ingest Queue] Failed (${next.retryCount}x): ${next.sourcePath} — ${message}`)
    } else {
      next.status = "pending" // will retry
      console.log(`[Ingest Queue] Error (retry ${next.retryCount}/${MAX_RETRIES}): ${next.sourcePath} — ${message}`)
    }

    await saveQueue(pp)
  }

  processing = false
  processNext(pp)
}
