import { extractFrontmatterData, type WikiFrontmatter } from "@/lib/frontmatter"
import { readFile, listDirectory } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"

// ---------------------------------------------------------------------------
// Source type weights
// ---------------------------------------------------------------------------

const SOURCE_WEIGHTS: Record<string, number> = {
  R: 0.30,  // 研报/深度分析
  T: 0.25,  // 交割单/交易记录
  C: 0.15,  // 对话/LLM分析
  N: 0.10,  // 新闻/快讯
  "": 0.20, // 无前缀默认
}

// ---------------------------------------------------------------------------
// Volatility config
// ---------------------------------------------------------------------------

export type Volatility = "low" | "mid" | "high"

export const VOLATILITY_CONFIG: Record<Volatility, {
  graceDays: number
  decayRate: number
  maxDecay: number
}> = {
  low:  { graceDays: 365, decayRate: 0.001, maxDecay: 0.15 },
  mid:  { graceDays: 90,  decayRate: 0.005, maxDecay: 0.30 },
  high: { graceDays: 15,  decayRate: 0.015, maxDecay: 0.50 },
}

export const DEFAULT_VOLATILITY_BY_TYPE: Record<string, Volatility> = {
  股票: "high",
  策略: "mid",
  模式: "mid",
  错误: "low",
  市场环境: "high",
  进化: "low",
  总结: "mid",
  source: "mid",
  concept: "mid",
  entity: "mid",
}

// ---------------------------------------------------------------------------
// Grade mapping
// ---------------------------------------------------------------------------

const GRADE_TO_CONFIDENCE: Record<string, number> = {
  A: 0.90,
  B: 0.75,
  C: 0.60,
  D: 0.40,
  E: 0.20,
}

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

export interface ConfidenceBasis {
  sources: string[]
  contradictions: number
  accessCount: number
  daysSinceCreated: number
  daysSinceUpdated: number
  volatility: Volatility
}

export interface ConfidenceBreakdown {
  sourceScore: number
  recencyBoost: number
  accessBoost: number
  contradictionPenalty: number
  decay: number
  final: number
}

export function calculateSourceScore(sources: string[]): number {
  let total = 0
  for (const s of sources) {
    const prefix = s.includes(":") ? s.split(":")[0] : ""
    const weight = SOURCE_WEIGHTS[prefix] ?? SOURCE_WEIGHTS[""]
    total += weight
  }
  return Math.min(total, 0.80)
}

export function calculateRecencyBoost(daysSinceUpdate: number): number {
  if (daysSinceUpdate <= 7) return 0.10
  if (daysSinceUpdate <= 30) return 0.05
  return 0
}

export function calculateAccessBoost(accessCount: number): number {
  return Math.min(accessCount * 0.005, 0.05)
}

export function calculateContradictionPenalty(contradictions: number): number {
  return contradictions * 0.15
}

export function calculateDecay(daysSinceCreated: number, volatility: Volatility = "mid"): number {
  const cfg = VOLATILITY_CONFIG[volatility]
  if (daysSinceCreated <= cfg.graceDays) return 0
  return Math.min(cfg.maxDecay, (daysSinceCreated - cfg.graceDays) * cfg.decayRate)
}

export function calculateConfidence(basis: ConfidenceBasis): ConfidenceBreakdown {
  const sourceScore = calculateSourceScore(basis.sources)
  const recencyBoost = calculateRecencyBoost(basis.daysSinceUpdated)
  const accessBoost = calculateAccessBoost(basis.accessCount)
  const contradictionPenalty = calculateContradictionPenalty(basis.contradictions)
  const decay = calculateDecay(basis.daysSinceCreated, basis.volatility)

  const raw = sourceScore + recencyBoost + accessBoost - contradictionPenalty - decay
  const final = Math.max(0, Math.min(1, raw))

  return {
    sourceScore,
    recencyBoost,
    accessBoost,
    contradictionPenalty,
    decay,
    final,
  }
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

/**
 * Convert confidence_grade to numeric confidence.
 */
export function gradeToConfidence(grade: string | undefined): number | undefined {
  if (!grade) return undefined
  return GRADE_TO_CONFIDENCE[grade.toUpperCase()] ?? 0.5
}

/**
 * Get volatility for a page type.
 */
export function getDefaultVolatility(type: string | undefined): Volatility {
  if (!type) return "mid"
  return DEFAULT_VOLATILITY_BY_TYPE[type] ?? "mid"
}

// ---------------------------------------------------------------------------
// Page stats (access tracking)
// ---------------------------------------------------------------------------

export interface PageStats {
  path: string
  openCount: number
  lastOpened: number
  referencedBy: string[]
}

const STATS_FILE = ".llm-wiki/page-stats.json"

let statsCache: Map<string, PageStats> | null = null

async function loadStats(projectPath: string): Promise<Map<string, PageStats>> {
  if (statsCache) return statsCache

  try {
    const content = await readFile(`${normalizePath(projectPath)}/${STATS_FILE}`)
    const data = JSON.parse(content) as Record<string, PageStats>
    statsCache = new Map(Object.entries(data))
  } catch {
    statsCache = new Map()
  }
  return statsCache
}

async function saveStats(projectPath: string, stats: Map<string, PageStats>): Promise<void> {
  const data: Record<string, PageStats> = {}
  for (const [path, stat] of stats) {
    data[path] = stat
  }
  const { writeFile } = await import("@/commands/fs")
  await writeFile(`${normalizePath(projectPath)}/${STATS_FILE}`, JSON.stringify(data, null, 2))
}

export async function recordPageOpen(projectPath: string, pagePath: string): Promise<void> {
  const stats = await loadStats(projectPath)
  const existing = stats.get(pagePath)
  stats.set(pagePath, {
    path: pagePath,
    openCount: (existing?.openCount ?? 0) + 1,
    lastOpened: Date.now(),
    referencedBy: existing?.referencedBy ?? [],
  })
  // Debounce save: only save every 30 seconds
  // For now, save immediately (can optimize later)
  await saveStats(projectPath, stats)
}

export async function getPageStats(projectPath: string, pagePath: string): Promise<PageStats | null> {
  const stats = await loadStats(projectPath)
  return stats.get(pagePath) ?? null
}

// ---------------------------------------------------------------------------
// Batch confidence calculation for a project
// ---------------------------------------------------------------------------

export interface PageConfidence {
  path: string
  title: string
  confidence: number
  breakdown: ConfidenceBreakdown
  status: string
  volatility: Volatility
  daysSinceCreated: number
  daysSinceUpdated: number
}

export async function calculateAllConfidences(
  projectPath: string,
): Promise<PageConfidence[]> {
  const pp = normalizePath(projectPath)
  const wikiRoot = `${pp}/wiki`

  let tree: import("@/types/wiki").FileNode[]
  try {
    tree = await listDirectory(wikiRoot)
  } catch {
    return []
  }

  // Flatten all .md files first
  const mdFiles: import("@/types/wiki").FileNode[] = []
  function collectMdFiles(nodes: import("@/types/wiki").FileNode[]) {
    for (const node of nodes) {
      if (node.is_dir && node.children) {
        collectMdFiles(node.children)
      } else if (!node.is_dir && node.name.endsWith(".md")) {
        mdFiles.push(node)
      }
    }
  }
  collectMdFiles(tree)

  const now = new Date()
  const results: PageConfidence[] = []

  // Process in batches of 20 for parallel IO
  const BATCH_SIZE = 20
  for (let i = 0; i < mdFiles.length; i += BATCH_SIZE) {
    const batch = mdFiles.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (node) => {
        try {
          const content = await readFile(node.path)
          const fm = extractFrontmatterData(content)
          if (!fm) return null

          const created = fm.created && typeof fm.created === "string"
            ? new Date(fm.created)
            : now
          const updated = fm.updated && typeof fm.updated === "string"
            ? new Date(fm.updated)
            : created

          const daysSinceCreated = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86400000))
          const daysSinceUpdated = Math.max(0, Math.floor((now.getTime() - updated.getTime()) / 86400000))

          const stats = await getPageStats(pp, node.path)
          const volatility = (fm.volatility as Volatility) ?? getDefaultVolatility(fm.type as string)

          // Use existing confidence if set, otherwise calculate
          let confidence: number
          let breakdown: ConfidenceBreakdown

          if (typeof fm.confidence === "number") {
            confidence = fm.confidence
            breakdown = {
              sourceScore: 0,
              recencyBoost: 0,
              accessBoost: 0,
              contradictionPenalty: 0,
              decay: 0,
              final: confidence,
            }
          } else {
            const sources = Array.isArray(fm.sources) ? fm.sources.filter((s): s is string => typeof s === "string") : []
            breakdown = calculateConfidence({
              sources,
              contradictions: 0, // TODO: integrate with review store
              accessCount: stats?.openCount ?? 0,
              daysSinceCreated,
              daysSinceUpdated,
              volatility,
            })
            confidence = breakdown.final
          }

          return {
            path: node.path,
            title: (fm.title as string) ?? node.name.replace(/\.md$/, ""),
            confidence,
            breakdown,
            status: (fm.status as string) ?? "active",
            volatility,
            daysSinceCreated,
            daysSinceUpdated,
          }
        } catch {
          return null
        }
      }),
    )

    for (const r of batchResults) {
      if (r) results.push(r)
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}
