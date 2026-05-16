export interface EntityTask {
  name: string
  code?: string
  context: string
  relatedPages: string[]
}

export interface ConceptTask {
  name: string
  context: string
  relatedPages: string[]
}

export interface IngestPlan {
  sourceSummary: {
    fileName: string
    keyPoints: string[]
  }
  entities: EntityTask[]
  concepts: ConceptTask[]
  relatedPages: string[]
  reviewItems: Array<{ type: string; topic: string }>
}

export interface WriterOutput {
  type: "entity" | "concept" | "source_summary"
  targetPath: string
  content: string
}

export interface MergedOutput {
  files: Array<{ path: string; content: string }>
  indexEntries: string[]
  logEntry: string
  unresolvedLinks: string[]
}

const MIN_CONTENT_LENGTH_FOR_MULTI_AGENT = 5000
const MIN_TASKS_FOR_MULTI_AGENT = 3

const ENTITY_LINE_RE = /^[-*]\s+(.+?)(?:\s*[（(](\d{6})[)）])?\s*[:：]\s*(.+)$/
const CONCEPT_LINE_RE = /^[-*]\s+(.+?)\s*[:：]\s*(.+)$/
const RELATED_PAGE_RE = /wiki\/[^\s,，]+\.md/g
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

export function shouldUseMultiAgent(sourceContent: string, analysis: string): boolean {
  if (sourceContent.length < MIN_CONTENT_LENGTH_FOR_MULTI_AGENT) return false

  const entityCount = countSectionItems(analysis, "Key Entities", "Entities")
  const conceptCount = countSectionItems(analysis, "Key Concepts", "Concepts")
  const totalTasks = entityCount + conceptCount + 1 // +1 for source summary

  return totalTasks >= MIN_TASKS_FOR_MULTI_AGENT
}

export function planIngestTasks(analysis: string, fileName: string): IngestPlan {
  const entities = parseEntities(analysis)
  const concepts = parseConcepts(analysis)
  const relatedPages = parseRelatedPages(analysis)
  const keyPoints = parseKeyPoints(analysis)

  return {
    sourceSummary: { fileName, keyPoints },
    entities,
    concepts,
    relatedPages,
    reviewItems: [],
  }
}

export function mergeWriterOutputs(outputs: WriterOutput[], sourceFileName: string): MergedOutput {
  // Deduplicate by path (keep first occurrence)
  const seen = new Set<string>()
  const deduplicated: WriterOutput[] = []
  for (const output of outputs) {
    if (!seen.has(output.targetPath)) {
      seen.add(output.targetPath)
      deduplicated.push(output)
    }
  }

  const files = deduplicated.map((o) => ({ path: o.targetPath, content: o.content }))

  // Generate index entries
  const indexEntries = deduplicated.map((o) => {
    const title = extractTitle(o.content) || o.targetPath.split("/").pop()?.replace(/\.md$/, "") || ""
    return `- [[${title}]] — ${o.type} (from ${sourceFileName})`
  })

  // Validate wikilinks
  const knownPages = new Set(deduplicated.map((o) => {
    const name = o.targetPath.split("/").pop()?.replace(/\.md$/, "") || ""
    return name
  }))

  const allLinks = new Set<string>()
  for (const output of deduplicated) {
    const matches = output.content.matchAll(WIKILINK_RE)
    for (const match of matches) {
      allLinks.add(match[1])
    }
  }

  const unresolvedLinks = [...allLinks].filter((link) => !knownPages.has(link))

  // Generate log entry
  const date = new Date().toISOString().slice(0, 10)
  const logEntry = `[${date}] Ingested ${sourceFileName} → ${deduplicated.length} pages (${deduplicated.filter((o) => o.type === "entity").length} entities, ${deduplicated.filter((o) => o.type === "concept").length} concepts)`

  return { files, indexEntries, logEntry, unresolvedLinks }
}

// ── Internal helpers ──

function countSectionItems(text: string, ...sectionNames: string[]): number {
  for (const name of sectionNames) {
    const re = new RegExp(`##\\s*${name}[\\s\\S]*?(?=\\n##|$)`, "i")
    const match = text.match(re)
    if (match) {
      const lines = match[0].split("\n").filter((l) => {
        const trimmed = l.trim()
        if (!/^[-*]\s+/.test(trimmed)) return false
        // Filter out placeholder lines like "(none)", "无", "暂无"
        const content = trimmed.replace(/^[-*]\s+/, "")
        if (/^\(?\s*none\s*\)?$/i.test(content)) return false
        if (/^[（(]?\s*无\s*[)）]?$/.test(content)) return false
        return true
      })
      return lines.length
    }
  }
  return 0
}

function parseEntities(analysis: string): EntityTask[] {
  const section = extractSection(analysis, "Key Entities", "Entities")
  if (!section) return []

  const entities: EntityTask[] = []
  for (const line of section.split("\n")) {
    const trimmed = line.trim()
    const match = trimmed.match(ENTITY_LINE_RE)
    if (match) {
      entities.push({
        name: match[1].trim(),
        code: match[2] || undefined,
        context: match[3].trim(),
        relatedPages: [],
      })
    }
  }
  return entities
}

function parseConcepts(analysis: string): ConceptTask[] {
  const section = extractSection(analysis, "Key Concepts", "Concepts")
  if (!section) return []

  const concepts: ConceptTask[] = []
  for (const line of section.split("\n")) {
    const trimmed = line.trim()
    const match = trimmed.match(CONCEPT_LINE_RE)
    if (match) {
      concepts.push({
        name: match[1].trim(),
        context: match[2].trim(),
        relatedPages: [],
      })
    }
  }
  return concepts
}

function parseRelatedPages(analysis: string): string[] {
  const matches = analysis.match(RELATED_PAGE_RE)
  return matches ? [...new Set(matches)] : []
}

function parseKeyPoints(analysis: string): string[] {
  const section = extractSection(analysis, "Main Arguments", "Arguments", "Key Points")
  if (!section) return []
  return section
    .split("\n")
    .filter((l) => /^[-*]\s+/.test(l.trim()))
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
}

function extractSection(text: string, ...names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`##\\s*${name}[\\s\\S]*?(?=\\n##|$)`, "i")
    const match = text.match(re)
    if (match) return match[0]
  }
  return null
}

function extractTitle(content: string): string | null {
  const match = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  return match ? match[1] : null
}