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

interface TaskContext {
  abortController: AbortController
  writtenFiles: string[]
}

// ── State ─────────────────────────────────────────────────────────────────

let queue: IngestTask[] = []
let activeCount = 0
let maxParallel = 3
let currentProjectPath = ""

// Track active task contexts by task ID
const activeTasks = new Map<string, TaskContext>()

/**
 * Set the maximum number of parallel ingest tasks.
 */
export function setMaxParallel(n: number): void {
  maxParallel = Math.max(1, Math.min(n, 8))
}

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
    const taskCtx = activeTasks.get(taskId)
    if (taskCtx) {
      taskCtx.abortController.abort()
      if (taskCtx.writtenFiles.length > 0) {
        const { deleteFile } = await import("@/commands/fs")
        for (const filePath of taskCtx.writtenFiles) {
          try {
            const fullPath = filePath.startsWith("/") ? filePath : `${normalizePath(projectPath)}/${filePath}`
            await deleteFile(fullPath)
          } catch { /* file may not exist */ }
        }
        console.log(`[Ingest Queue] Cleaned up ${taskCtx.writtenFiles.length} files from cancelled task`)
      }
      activeTasks.delete(taskId)
      activeCount--
    }
  }

  queue = queue.filter((t) => t.id !== taskId)
  await saveQueue(projectPath)
  console.log(`[Ingest Queue] Cancelled: ${task.sourcePath}`)

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
  // Fill up to maxParallel slots
  while (activeCount < maxParallel) {
    const next = queue.find((t) => t.status === "pending")
    if (!next) return

    activeCount++
    next.status = "processing"
    saveQueue(projectPath) // fire-and-forget

    processOneTask(next, projectPath)
  }
}

async function processOneTask(task: IngestTask, projectPath: string): Promise<void> {
  const pp = normalizePath(projectPath)
  const llmConfig = useWikiStore.getState().llmConfig

  if (!llmConfig.apiKey && llmConfig.provider !== "ollama" && llmConfig.provider !== "custom") {
    task.status = "failed"
    task.error = "LLM not configured — set API key in Settings"
    activeCount--
    await saveQueue(pp)
    processNext(pp)
    return
  }

  const fullSourcePath = task.sourcePath.startsWith("/")
    ? task.sourcePath
    : `${pp}/${task.sourcePath}`

  console.log(`[Ingest Queue] Processing: ${task.sourcePath} (active: ${activeCount}/${maxParallel}, pending: ${queue.filter((t) => t.status === "pending").length})`)

  const taskContext: TaskContext = {
    abortController: new AbortController(),
    writtenFiles: [],
  }
  activeTasks.set(task.id, taskContext)

  try {
    const writtenFiles = await autoIngest(pp, fullSourcePath, llmConfig, taskContext.abortController.signal, task.folderContext)
    taskContext.writtenFiles = writtenFiles

    activeTasks.delete(task.id)
    queue = queue.filter((t) => t.id !== task.id)
    await saveQueue(pp)
    console.log(`[Ingest Queue] Done: ${task.sourcePath}`)
  } catch (err) {
    activeTasks.delete(task.id)
    const message = err instanceof Error ? err.message : String(err)
    task.retryCount++
    task.error = message

    if (task.retryCount >= MAX_RETRIES) {
      task.status = "failed"
      console.log(`[Ingest Queue] Failed (${task.retryCount}x): ${task.sourcePath} — ${message}`)
    } else {
      task.status = "pending"
      console.log(`[Ingest Queue] Error (retry ${task.retryCount}/${MAX_RETRIES}): ${task.sourcePath} — ${message}`)
    }

    await saveQueue(pp)
  }

  activeCount--
  processNext(pp)
}
