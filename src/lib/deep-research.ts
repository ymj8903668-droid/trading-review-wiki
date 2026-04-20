import { webSearch } from "./web-search"
import { streamChat } from "./llm-client"
import { autoIngest } from "./ingest"
import { writeFile, readFile, listDirectory } from "@/commands/fs"
import { useWikiStore, type LlmConfig, type SearchApiConfig } from "@/stores/wiki-store"
import { useResearchStore, type ResearchTask } from "@/stores/research-store"
import { normalizePath } from "@/lib/path-utils"

let processing = false

/**
 * Queue a deep research task. Automatically starts processing if under concurrency limit.
 */
export function queueResearch(
  projectPath: string,
  topic: string,
  llmConfig: LlmConfig,
  searchConfig: SearchApiConfig,
  searchQueries?: string[],
): string {
  const store = useResearchStore.getState()
  const taskId = store.addTask(topic)
  // Store search queries on the task
  if (searchQueries && searchQueries.length > 0) {
    store.updateTask(taskId, { searchQueries })
  }
  // Ensure panel is open
  store.setPanelOpen(true)
  // Start processing on next tick to ensure React has rendered the panel
  setTimeout(() => {
    processQueue(projectPath, llmConfig, searchConfig)
  }, 50)
  return taskId
}

/**
 * Process queued tasks up to maxConcurrent limit.
 */
function processQueue(
  projectPath: string,
  llmConfig: LlmConfig,
  searchConfig: SearchApiConfig,
) {
  const store = useResearchStore.getState()
  const running = store.getRunningCount()
  const available = store.maxConcurrent - running

  for (let i = 0; i < available; i++) {
    const next = useResearchStore.getState().getNextQueued()
    if (!next) break
    executeResearch(projectPath, next.id, next.topic, llmConfig, searchConfig)
  }
}

async function executeResearch(
  projectPath: string,
  taskId: string,
  topic: string,
  llmConfig: LlmConfig,
  searchConfig: SearchApiConfig,
) {
  const pp = normalizePath(projectPath)
  const store = useResearchStore.getState()

  try {
    // Step 1: Web search — use multiple queries if available, merge and deduplicate
    store.updateTask(taskId, { status: "searching" })

    const task = useResearchStore.getState().tasks.find((t) => t.id === taskId)
    const queries = task?.searchQueries && task.searchQueries.length > 0
      ? task.searchQueries
      : [topic]

    const allResults: import("./web-search").WebSearchResult[] = []
    const seenUrls = new Set<string>()

    for (const query of queries) {
      try {
        const results = await webSearch(query, searchConfig, 5)
        for (const r of results) {
          if (!seenUrls.has(r.url)) {
            seenUrls.add(r.url)
            allResults.push(r)
          }
        }
      } catch {
        // continue with other queries
      }
    }

    const webResults = allResults
    store.updateTask(taskId, { webResults })

    if (webResults.length === 0) {
      store.updateTask(taskId, { status: "done", synthesis: "No web results found." })
      onTaskFinished(pp, llmConfig, searchConfig)
      return
    }

    // Step 2: LLM synthesis
    store.updateTask(taskId, { status: "synthesizing" })

    const searchContext = webResults
      .map((r, i) => `[${i + 1}] **${r.title}** (${r.source})\n${r.snippet}`)
      .join("\n\n")

    // Read existing wiki index to enable cross-referencing
    let wikiIndex = ""
    try {
      wikiIndex = await readFile(`${pp}/wiki/index.md`)
    } catch {
      // no index yet
    }

    const systemPrompt = [
      "You are a research assistant. Synthesize the web search results into a comprehensive wiki page.",
      "",
      "## Language Rule",
      "- ALWAYS match the language of the research topic. If the topic is in Chinese, write in Chinese. If in English, write in English.",
      "",
      "## Cross-referencing (IMPORTANT)",
      "- The wiki already has existing pages listed in the Wiki Index below.",
      "- When your synthesis mentions an entity or concept that exists in the wiki, ALWAYS use [[wikilink]] syntax to link to it.",
      "- For example, if the wiki has an entity 'anthropic', write [[anthropic]] when mentioning it.",
      "- This is critical for connecting new research to existing knowledge in the graph.",
      "",
      "## Writing Rules",
      "- Organize into clear sections with headings",
      "- Cite web sources using [N] notation",
      "- Note contradictions or gaps",
      "- Suggest additional sources worth finding",
      "- Neutral, encyclopedic tone",
      "",
      wikiIndex ? `## Existing Wiki Index (link to these pages with [[wikilink]])\n${wikiIndex}` : "",
    ].filter(Boolean).join("\n")

    let accumulated = ""

    await streamChat(
      llmConfig,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Research topic: **${topic}**\n\n## Web Search Results\n\n${searchContext}\n\nSynthesize into a wiki page.` },
      ],
      {
        onToken: (token) => {
          accumulated += token
          // Update synthesis progressively so UI shows real-time text
          useResearchStore.getState().updateTask(taskId, { synthesis: accumulated })
        },
        onDone: () => {},
        onError: (err) => {
          useResearchStore.getState().updateTask(taskId, {
            status: "error",
            error: err.message,
          })
        },
      },
    )

    // Check if errored during streaming
    if (useResearchStore.getState().tasks.find((t) => t.id === taskId)?.status === "error") {
      onTaskFinished(pp, llmConfig, searchConfig)
      return
    }

    // Step 3: Prepare draft for human review (do NOT save yet)
    const cleanedSynthesis = accumulated
      .replace(/<think(?:ing)?>\s*[\s\S]*?<\/think(?:ing)?>\s*/gi, "")
      .replace(/<think(?:ing)?>\s*[\s\S]*$/gi, "") // unclosed thinking block
      .trimStart()

    store.updateTask(taskId, {
      status: "pending_review",
      synthesis: accumulated,
      draftContent: cleanedSynthesis,
    })

    onTaskFinished(pp, llmConfig, searchConfig)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useResearchStore.getState().updateTask(taskId, {
      status: "error",
      error: message,
    })
  }

  onTaskFinished(pp, llmConfig, searchConfig)
}

/**
 * Save a research draft to the wiki after human review.
 * Called from the Research panel when user clicks "Save to Wiki".
 */
export async function saveResearchDraft(
  projectPath: string,
  task: ResearchTask,
  llmConfig: LlmConfig,
): Promise<string> {
  const pp = normalizePath(projectPath)
  const store = useResearchStore.getState()

  if (task.draftContent === null) {
    throw new Error("No draft content to save")
  }

  // Guard against double-click / rapid-fire saves
  const current = store.tasks.find((t) => t.id === task.id)
  if (!current || current.status !== "pending_review") {
    throw new Error("Task is no longer in review state")
  }

  store.updateTask(task.id, { status: "saving" })

  try {
    const date = new Date().toISOString().slice(0, 10)
    const slug = task.topic.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50)
    const baseFileName = `research-${slug}-${date}.md`

    // Ensure unique file name to avoid overwriting existing files
    let fileName = baseFileName
    let counter = 1
    while (true) {
      const testPath = `${pp}/wiki/queries/${fileName}`
      try {
        await readFile(testPath)
        const base = baseFileName.replace(/\.md$/, "")
        fileName = `${base}-${counter}.md`
        counter++
      } catch {
        break
      }
    }
    const filePath = `${pp}/wiki/queries/${fileName}`

    const references = task.webResults
      .map((r, i) => `${i + 1}. [${r.title}](${r.url}) — ${r.source}`)
      .join("\n")

    const pageContent = [
      "---",
      `type: query`,
      `title: "Research: ${task.topic.replace(/"/g, '\\"')}"`,
      `created: ${date}`,
      `origin: deep-research`,
      `tags: [research]`,
      "---",
      "",
      `# Research: ${task.topic}`,
      "",
      task.draftContent,
      "",
      "## References",
      "",
      references,
      "",
    ].join("\n")

    await writeFile(filePath, pageContent)
    const savedPath = `wiki/queries/${fileName}`

    store.updateTask(task.id, {
      status: "done",
      savedPath,
    })

    // Refresh tree
    try {
      const tree = await listDirectory(pp)
      useWikiStore.getState().setFileTree(tree)
      useWikiStore.getState().bumpDataVersion()
    } catch {
      // ignore
    }

    // Note: we do NOT run auto-ingest here. Deep Research saves a query page
    // (wiki/queries/research-*.md). Auto-ingest is meant for source documents
    // (raw/sources/) — running it on a research page causes LLM to extract
    // entities and create duplicate/undesired pages.

    // Auto-ingest the research result to generate entities, concepts, cross-references
    const ingestPath = normalizePath(`${pp}/${savedPath}`)
    autoIngest(pp, ingestPath, llmConfig).catch((err) => {
      console.error("Failed to auto-ingest research result:", err)
    })

    return savedPath
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    store.updateTask(task.id, {
      status: "error",
      error: message,
    })
    throw err
  }
}

function onTaskFinished(
  projectPath: string,
  llmConfig: LlmConfig,
  searchConfig: SearchApiConfig,
) {
  // Process next queued task
  setTimeout(() => processQueue(projectPath, llmConfig, searchConfig), 100)
}
