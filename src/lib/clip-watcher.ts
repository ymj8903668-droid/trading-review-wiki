import { useWikiStore } from "@/stores/wiki-store"
import { autoIngest } from "./ingest"
import { listDirectory, getClipServerToken } from "@/commands/fs"

const POLL_INTERVAL = 3000 // Check every 3 seconds
let intervalId: ReturnType<typeof setInterval> | null = null
let isPolling = false

/**
 * Start polling the clip server for new web clips.
 * When a clip is detected, triggers auto-ingest and refreshes the file tree.
 */
export function startClipWatcher() {
  if (intervalId) return // Already running

  intervalId = setInterval(async () => {
    if (isPolling) return
    isPolling = true
    try {
      const token = await getClipServerToken()
      const res = await fetch("http://127.0.0.1:19827/clips/pending", {
        method: "GET",
        headers: { "X-Clip-Token": token },
      })
      const data = await res.json()

      if (!data.ok || !data.clips || data.clips.length === 0) return

      const store = useWikiStore.getState()
      const project = store.project

      for (const clip of data.clips) {
        const clipProjectPath: string = clip.projectPath
        const clipFilePath: string = clip.filePath

        // Refresh file tree if clip is for current project
        if (project && clipProjectPath === project.path) {
          try {
            const tree = await listDirectory(project.path)
            store.setFileTree(tree)
          } catch (err) {
            console.warn("[ClipWatcher] Failed to refresh file tree:", err)
          }

          // Auto-ingest the clipped file
          const llmConfig = store.llmConfig
          if (llmConfig.apiKey || llmConfig.provider === "ollama") {
            autoIngest(clipProjectPath, clipFilePath, llmConfig).catch((err) => {
              console.error("Failed to auto-ingest web clip:", err)
            })
          }
        }
      }
    } catch (err) {
      // Server not running or network error — silently ignore
      console.warn("[ClipWatcher] Poll error:", err)
    } finally {
      isPolling = false
    }
  }, POLL_INTERVAL)
}

export function stopClipWatcher() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
