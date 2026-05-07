import { readFile, listDirectory } from "@/commands/fs"
import type { FileNode } from "@/types/wiki"
import { normalizePath } from "@/lib/path-utils"

export interface SearchResult {
  path: string
  title: string
  snippet: string
  titleMatch: boolean
  score: number
}

const MAX_RESULTS = 20
const SNIPPET_CONTEXT = 80
const TITLE_MATCH_BONUS = 10
const RAW_BONUS = 4 // Give raw sources a slight boost so they compete fairly for context budget

// Recency boost based on filename date (e.g. YYYY-MM-DD-xxx.md)
function getRecencyBoost(fileName: string, query: string): number {
  const dateMatch = fileName.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!dateMatch) return 0

  const fileDate = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]))
  const now = new Date()
  const diffDays = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24)

  let boost = 0
  // Base recency: closer is better
  if (diffDays <= 7) boost += 6
  else if (diffDays <= 30) boost += 3
  else if (diffDays <= 90) boost += 1

  // Query-aware boost: if user explicitly asks for recent time range, strongly prefer files in that range
  const timePatterns = [
    { regex: /最近一?个?月|本月|这个月|近30天|近一个月/, days: 30 },
    { regex: /最近一?周|本周|这周|近7天/, days: 7 },
    { regex: /昨日|昨天/, days: 1 },
    { regex: /今天|当日/, days: 0 },
  ]

  for (const p of timePatterns) {
    if (p.regex.test(query)) {
      if (diffDays <= p.days) {
        boost += 15 // Strong boost so old files drop out of top results
      }
      break
    }
  }

  return boost
}

const STOP_WORDS = new Set([
  "的", "是", "了", "什么", "在", "有", "和", "与", "对", "从",
  "the", "is", "a", "an", "what", "how", "are", "was", "were",
  "do", "does", "did", "be", "been", "being", "have", "has", "had",
  "it", "its", "in", "on", "at", "to", "for", "of", "with", "by",
  "this", "that", "these", "those",
])

export function tokenizeQuery(query: string): string[] {
  // Split by whitespace and punctuation
  const rawTokens = query
    .toLowerCase()
    .split(/[\s,，。！？、；：""''（）()\-_/\\·~～…]+/)
    .filter((t) => t.length > 1)
    .filter((t) => !STOP_WORDS.has(t))

  const tokens: string[] = []

  for (const token of rawTokens) {
    // Check if token contains CJK characters
    const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(token)

    if (hasCJK && token.length > 2) {
      // For CJK text: split into individual characters AND overlapping bigrams
      // "默会知识" → ["默会", "会知", "知识", "默", "会", "知", "识"]
      const chars = [...token]
      // Add bigrams (most useful for Chinese)
      for (let i = 0; i < chars.length - 1; i++) {
        tokens.push(chars[i] + chars[i + 1])
      }
      // Also add individual chars (for single-char matches)
      for (const ch of chars) {
        if (!STOP_WORDS.has(ch)) {
          tokens.push(ch)
        }
      }
      // Keep the original token too (for exact phrase match)
      tokens.push(token)
    } else {
      tokens.push(token)
    }
  }

  // Deduplicate
  return [...new Set(tokens)]
}

function tokenMatchScore(text: string, tokens: readonly string[]): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (lower.includes(token)) score += 1
  }
  return score
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

function flattenAllFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenAllFiles(node.children))
    } else if (!node.is_dir) {
      files.push(node)
    }
  }
  return files
}

function extractTitle(content: string, fileName: string): string {
  // Try YAML frontmatter title
  const frontmatterMatch = content.match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m)
  if (frontmatterMatch) return frontmatterMatch[1].trim()

  // Try first heading
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch) return headingMatch[1].trim()

  // Fall back to filename
  return fileName.replace(/\.md$/, "").replace(/-/g, " ")
}

function buildSnippet(content: string, query: string): string {
  const lower = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lower.indexOf(lowerQuery)
  if (idx === -1) return content.slice(0, SNIPPET_CONTEXT * 2).replace(/\n/g, " ")

  const start = Math.max(0, idx - SNIPPET_CONTEXT)
  const end = Math.min(content.length, idx + query.length + SNIPPET_CONTEXT)
  let snippet = content.slice(start, end).replace(/\n/g, " ")
  if (start > 0) snippet = "..." + snippet
  if (end < content.length) snippet = snippet + "..."
  return snippet
}

export async function searchWiki(
  projectPath: string,
  query: string,
): Promise<SearchResult[]> {
  if (!query.trim()) return []
  const pp = normalizePath(projectPath)

  const tokens = tokenizeQuery(query)
  // Fallback: if all tokens were filtered out, use the trimmed query as a single token
  const effectiveTokens = tokens.length > 0 ? tokens : [query.trim().toLowerCase()]
  const results: SearchResult[] = []
  let wikiTree: FileNode[] | null = null

  // Search wiki pages
  try {
    wikiTree = await listDirectory(`${pp}/wiki`)
    const wikiFiles = flattenMdFiles(wikiTree)
    await searchFiles(wikiFiles, effectiveTokens, query, results)
  } catch {
    // no wiki directory
  }

  // Also search raw directories but limit to recent files to avoid performance collapse
  // As raw/ grows (e.g. 100+ delivery notes), reading every file blocks the main thread.
  // Also exclude heavy extractable formats (pdf, office) so Rust doesn't hang on text extraction.
  try {
    const rawTree = await listDirectory(`${pp}/raw`)
    const allRawFiles = flattenAllFiles(rawTree)
      .filter(
        (f) =>
          !f.name.match(
            /\.(png|jpe?g|gif|webp|bmp|tiff|avif|heic|mp4|webm|mov|avi|mkv|mp3|wav|ogg|flac|m4a|exe|zip|rar|7z|tar|gz|db|tmp|log|DS_Store|pdf|docx?|xlsx?|pptx?|odt|ods|odp)$/i,
          )
      )

    // Group by parent directory and pick recent files from each group
    // This ensures 日复盘/交割单/研报/微信聊天 each get representation
    const byDir = new Map<string, FileNode[]>()
    for (const f of allRawFiles) {
      // Normalize path separators to / for consistent grouping
      const normalizedPath = f.path.replace(/\\/g, "/")
      const lastSep = normalizedPath.lastIndexOf("/")
      const dir = lastSep > 0 ? normalizedPath.substring(0, lastSep) : ""
      if (!byDir.has(dir)) byDir.set(dir, [])
      byDir.get(dir)!.push(f)
    }

    const selected: FileNode[] = []
    for (const [, files] of byDir) {
      files.sort((a, b) => {
        const dateA = a.name.match(/(\d{4})-(\d{2})-(\d{2})/)
        const dateB = b.name.match(/(\d{4})-(\d{2})-(\d{2})/)
        if (dateA && dateB) return dateB[0].localeCompare(dateA[0])
        if (dateB) return 1
        if (dateA) return -1
        return b.name.localeCompare(a.name)
      })
      selected.push(...files.slice(0, 10))
    }

    await searchFiles(selected, effectiveTokens, query, results)
  } catch {
    // no raw directory
  }

  // Vector search: merge semantic results if embedding enabled
  try {
    const { useWikiStore } = await import("@/stores/wiki-store")
    const embCfg = useWikiStore.getState().embeddingConfig
    console.log(`[Vector Search] Config: enabled=${embCfg.enabled}, model="${embCfg.model}"`)
    if (embCfg.enabled && embCfg.model) {
      const t0 = performance.now()
      const { searchByEmbedding } = await import("@/lib/embedding")
      const vectorResults = await searchByEmbedding(pp, query, embCfg, 10)
      const vectorMs = Math.round(performance.now() - t0)

      console.log(
        `[Vector Search] query="${query}" | ${vectorResults.length} results in ${vectorMs}ms | model=${embCfg.model}` +
        (vectorResults.length > 0
          ? ` | top: ${vectorResults.slice(0, 5).map((r) => `${r.id}(${r.score.toFixed(3)})`).join(", ")}`
          : "")
      )

      let boosted = 0
      let added = 0
      const existingPaths = new Set(results.map((r) => r.path))

      for (const vr of vectorResults) {
        // Check if already in results
        const existing = results.find((r) => {
          const fileName = r.path.split("/").pop()?.replace(/\.md$/, "") ?? ""
          return fileName === vr.id
        })

        if (existing) {
          // Boost score of existing result
          existing.score += vr.score * 5
          boosted++
        } else {
          // Try to find the file anywhere in the wiki tree
          if (wikiTree) {
            const allWikiFiles = flattenMdFiles(wikiTree)
            const found = allWikiFiles.find((f) => f.name.replace(/\.md$/, "") === vr.id)
            if (found && !existingPaths.has(found.path)) {
              try {
                const content = await readFile(found.path)
                const title = extractTitle(content, found.name)
                results.push({
                  path: found.path,
                  title,
                  snippet: buildSnippet(content, query),
                  titleMatch: false,
                  score: vr.score * 5,
                })
                existingPaths.add(found.path)
                added++
              } catch {
                // unable to read file
              }
            }
          }
        }
      }

      if (boosted > 0 || added > 0) {
        console.log(`[Vector Search] Merged: ${boosted} boosted, ${added} new pages added`)
      }
    }
  } catch (err) {
    console.log(`[Vector Search] Skipped: ${err instanceof Error ? err.message : "not available"}`)
  }

  // Sort by score descending, then by filename date descending as tie-breaker
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const dateA = a.path.match(/(\d{4})-(\d{2})-(\d{2})/)
    const dateB = b.path.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (dateA && dateB) return dateB[0].localeCompare(dateA[0])
    if (dateB) return 1
    if (dateA) return -1
    return 0
  })

  const tokenCount = results.filter((r) => r.score > 0).length
  console.log(`[Search] query="${query}" | ${tokenCount} token matches | ${results.length} total results`)

  return results.slice(0, MAX_RESULTS)
}

async function searchFiles(
  files: FileNode[],
  tokens: readonly string[],
  query: string,
  results: SearchResult[],
): Promise<void> {
  for (const file of files) {
    let content = ""
    try {
      content = await readFile(file.path)
    } catch (err) {
      console.warn(`[Search] Failed to read file ${file.path}:`, err)
      continue
    }

    const title = extractTitle(content, file.name)
    const titleText = `${title} ${file.name}`

    const titleScore = tokenMatchScore(titleText, tokens)
    const contentScore = tokenMatchScore(content, tokens)

    if (titleScore === 0 && contentScore === 0) continue

    const isTitleMatch = titleScore > 0
    let score = contentScore + (isTitleMatch ? TITLE_MATCH_BONUS : 0)

    // Boost raw sources so recent 交割单/日复盘 don't get buried by wiki pages
    const isRaw = file.path.includes("/raw/") || file.path.includes("\\raw\\")
    if (isRaw && score > 0) {
      score += RAW_BONUS
    }

    // Recency boost for date-named files (交割单, 日复盘, etc.)
    score += getRecencyBoost(file.name, query)

    const firstMatchingToken = tokens.find((t) =>
      content.toLowerCase().includes(t),
    ) ?? query
    const snippet = buildSnippet(content, firstMatchingToken)

    results.push({
      path: file.path,
      title,
      snippet,
      titleMatch: isTitleMatch,
      score,
    })
  }
}
