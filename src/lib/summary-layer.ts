import { estimateTokens } from "./token-budget"

export interface SummaryManifestEntry {
  path: string
  hash: string
  timestamp: number
}

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n*/
const TITLE_RE = /^#\s+(.+)$/m
const DEFAULT_MAX_CHARS = 300

export function generateSummaryFromContent(content: string, maxChars = DEFAULT_MAX_CHARS): string {
  if (!content) return ""

  // Strip frontmatter
  const body = content.replace(FRONTMATTER_RE, "").trim()
  if (!body) return ""

  // Extract title
  const titleMatch = body.match(TITLE_RE)
  const title = titleMatch ? titleMatch[1].trim() : ""

  // Get meaningful paragraphs (skip headings, empty lines)
  const lines = body.split("\n")
  const paragraphs: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith("#")) continue
    if (trimmed.startsWith("---")) continue
    paragraphs.push(trimmed)
  }

  // Build summary: title + first paragraphs within budget
  let summary = title ? `${title}: ` : ""
  for (const para of paragraphs) {
    if (summary.length + para.length > maxChars) {
      if (summary.length < maxChars * 0.5 && para.length > 0) {
        summary += para.slice(0, maxChars - summary.length)
      }
      break
    }
    summary += para + " "
  }

  return summary.trim()
}

export function buildSummaryManifestEntry(path: string, content: string): SummaryManifestEntry {
  return {
    path,
    hash: sha256Hex(content),
    timestamp: Date.now(),
  }
}

export function shouldRegenerateSummary(
  currentContent: string,
  existingEntry: SummaryManifestEntry | null,
): boolean {
  if (!existingEntry) return true
  return sha256Hex(currentContent) !== existingEntry.hash
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text)
  if (currentTokens <= maxTokens) return text

  // Binary search for the right length
  const ratio = maxTokens / currentTokens
  let endIdx = Math.floor(text.length * ratio)

  // Refine: ensure we're under budget
  while (estimateTokens(text.slice(0, endIdx)) > maxTokens && endIdx > 0) {
    endIdx = Math.floor(endIdx * 0.9)
  }

  return text.slice(0, endIdx).trim() + "..."
}

// Simple SHA-256 using Web Crypto API (sync via SubtleCrypto workaround for Node)
function sha256Hex(input: string): string {
  // Use a simple hash for synchronous operation (djb2 extended to 256-bit equivalent)
  // For production, use crypto.subtle.digest or node:crypto
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  let h3 = 0xcbf29ce4
  let h4 = 0x84222325
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x811c9dc5)
    h3 = Math.imul(h3 ^ c, 0x1000193b)
    h4 = Math.imul(h4 ^ c, 0xcbf29ce5)
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0")
  return hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h1 ^ h3) + hex(h2 ^ h4) + hex(h1 ^ h2) + hex(h3 ^ h4)
}
