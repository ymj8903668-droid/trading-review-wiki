import matter from "gray-matter"

export interface WikiFrontmatter {
  type?: string
  title?: string
  created?: string
  updated?: string
  tags?: string[]
  related?: string[]
  sources?: string[]
  confidence?: number
  confidence_grade?: "A" | "B" | "C" | "D" | "E"
  confidence_reason?: string
  status?: "active" | "draft" | "archived" | "superseded" | string
  superseded_by?: string
  supersedes?: string
  volatility?: "low" | "mid" | "high"
  code?: string
  [key: string]: unknown
}

const GRADE_TO_CONFIDENCE: Record<string, number> = {
  A: 0.90,
  B: 0.75,
  C: 0.60,
  D: 0.40,
  E: 0.20,
}

const DEFAULT_VOLATILITY_BY_TYPE: Record<string, "low" | "mid" | "high"> = {
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

/**
 * Parse frontmatter from markdown content using gray-matter.
 * Returns { data, content, body } where body is content without frontmatter.
 */
export function parseFrontmatter(content: string): {
  data: WikiFrontmatter
  content: string
  body: string
} {
  const parsed = matter(content)
  const data = normalizeFrontmatter(parsed.data as Record<string, unknown>)
  return { data, content: parsed.content, body: parsed.content }
}

/**
 * Stringify frontmatter + body back to markdown.
 */
export function stringifyFrontmatter(data: WikiFrontmatter, body: string): string {
  const cleaned = cleanFrontmatter(data)
  return matter.stringify(body, cleaned)
}

/**
 * Extract just the frontmatter data from markdown content.
 */
export function extractFrontmatterData(content: string): WikiFrontmatter | null {
  try {
    const { data } = parseFrontmatter(content)
    return data
  } catch {
    return null
  }
}

/**
 * Normalize raw frontmatter values:
 * - Convert confidence_grade to confidence if needed
 * - Normalize status values (兼容中文)
 * - Set default volatility based on type
 * - Ensure arrays are actually arrays
 */
function normalizeFrontmatter(raw: Record<string, unknown>): WikiFrontmatter {
  const data: WikiFrontmatter = {}

  for (const [key, value] of Object.entries(raw)) {
    data[key] = value as unknown
  }

  // Normalize status: 活跃|归档|迭代中|已替代 → active|archived|draft|superseded
  if (data.status) {
    const statusMap: Record<string, string> = {
      活跃: "active",
      归档: "archived",
      迭代中: "draft",
      已替代: "superseded",
      替代: "superseded",
      active: "active",
      archived: "archived",
      draft: "draft",
      superseded: "superseded",
    }
    data.status = statusMap[String(data.status)] ?? data.status
  }

  // Convert confidence_grade to confidence (only when confidence is explicitly undefined)
  if (data.confidence_grade && data.confidence === undefined) {
    const grade = String(data.confidence_grade).toUpperCase()
    data.confidence = GRADE_TO_CONFIDENCE[grade] ?? 0.5
  }

  // Ensure confidence is a valid number
  if (data.confidence !== undefined && data.confidence !== null) {
    const raw = String(data.confidence).trim()
    const num = raw === "" ? NaN : parseFloat(raw)
    data.confidence = isNaN(num) ? 0.5 : Math.max(0, Math.min(1, num))
  }

  // Set default volatility based on type
  if (!data.volatility && data.type) {
    data.volatility = DEFAULT_VOLATILITY_BY_TYPE[String(data.type)] ?? "mid"
  }

  // Ensure arrays
  ;["tags", "related", "sources"].forEach((key) => {
    if (data[key] && !Array.isArray(data[key])) {
      data[key] = [String(data[key])]
    }
  })

  return data
}

/**
 * Clean frontmatter for output: remove undefined/null values,
 * keep only meaningful fields.
 */
function cleanFrontmatter(data: WikiFrontmatter): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === "string" && value === "") continue
    result[key] = value
  }
  return result
}

/**
 * Get confidence display info: color, label, icon.
 */
export function getConfidenceDisplay(confidence: number | undefined): {
  color: string
  label: string
  percent: number
} {
  if (confidence === undefined) {
    return { color: "text-gray-400", label: "未评分", percent: -1 }
  }
  const pct = Math.round(confidence * 100)
  if (confidence >= 0.7) return { color: "text-green-500", label: `${pct}%`, percent: pct }
  if (confidence >= 0.4) return { color: "text-yellow-500", label: `${pct}%`, percent: pct }
  return { color: "text-red-500", label: `${pct}%`, percent: pct }
}

/**
 * Get status display info.
 */
export function getStatusDisplay(status: string | undefined): {
  color: string
  label: string
  icon: string
} {
  const map: Record<string, { color: string; label: string; icon: string }> = {
    active: { color: "text-green-500", label: "活跃", icon: "🟢" },
    draft: { color: "text-orange-500", label: "草稿", icon: "🟠" },
    archived: { color: "text-gray-400", label: "归档", icon: "⚪" },
    superseded: { color: "text-red-400", label: "已替代", icon: "🔴" },
  }
  return map[status ?? ""] ?? { color: "text-gray-400", label: status ?? "未知", icon: "⚪" }
}
