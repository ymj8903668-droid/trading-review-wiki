import { describe, it, expect } from "vitest"
import {
  generateSummaryFromContent,
  buildSummaryManifestEntry,
  shouldRegenerateSummary,
  truncateToTokenBudget,
} from "../summary-layer"

describe("generateSummaryFromContent", () => {
  it("extracts title and first meaningful paragraphs", () => {
    const content = `---
type: entity
title: "英维克"
sources: ["2026-05-16-复盘.md"]
---

# 英维克

算力板块龙头，连板高度3板。主营业务为数据中心温控设备。

## 技术面
- 突破前高
- 量能放大

## 基本面
- 2025年营收增长30%
- AI算力需求驱动
`
    const summary = generateSummaryFromContent(content)
    expect(summary).toContain("英维克")
    expect(summary).toContain("算力")
    expect(summary.length).toBeLessThan(500)
    expect(summary.length).toBeGreaterThan(20)
  })

  it("handles content without frontmatter", () => {
    const content = "# 简单标题\n\n这是一段内容。"
    const summary = generateSummaryFromContent(content)
    expect(summary).toContain("简单标题")
    expect(summary).toContain("这是一段内容")
  })

  it("returns empty string for empty content", () => {
    expect(generateSummaryFromContent("")).toBe("")
  })

  it("limits summary to maxChars", () => {
    const longContent = "# Title\n\n" + "这是一段很长的内容。".repeat(100)
    const summary = generateSummaryFromContent(longContent, 200)
    expect(summary.length).toBeLessThanOrEqual(200)
  })
})

describe("buildSummaryManifestEntry", () => {
  it("creates entry with content hash and timestamp", () => {
    const entry = buildSummaryManifestEntry("wiki/股票/英维克.md", "some content")
    expect(entry.path).toBe("wiki/股票/英维克.md")
    expect(entry.hash).toBeTruthy()
    expect(entry.hash.length).toBe(64) // SHA-256 hex
    expect(entry.timestamp).toBeGreaterThan(0)
  })

  it("produces different hashes for different content", () => {
    const entry1 = buildSummaryManifestEntry("a.md", "content A")
    const entry2 = buildSummaryManifestEntry("a.md", "content B")
    expect(entry1.hash).not.toBe(entry2.hash)
  })
})

describe("shouldRegenerateSummary", () => {
  it("returns true when no existing entry", () => {
    expect(shouldRegenerateSummary("new content", null)).toBe(true)
  })

  it("returns false when content hash matches", () => {
    const entry = buildSummaryManifestEntry("test.md", "same content")
    expect(shouldRegenerateSummary("same content", entry)).toBe(false)
  })

  it("returns true when content has changed", () => {
    const entry = buildSummaryManifestEntry("test.md", "old content")
    expect(shouldRegenerateSummary("new content", entry)).toBe(true)
  })
})

describe("truncateToTokenBudget", () => {
  it("returns full text if within budget", () => {
    const text = "短文本"
    expect(truncateToTokenBudget(text, 100)).toBe(text)
  })

  it("truncates long text to fit token budget", () => {
    const longText = "这是一段很长的中文文本，需要被截断。".repeat(50)
    const result = truncateToTokenBudget(longText, 50)
    expect(result.length).toBeLessThan(longText.length)
  })

  it("appends ellipsis indicator when truncated", () => {
    const longText = "内容".repeat(200)
    const result = truncateToTokenBudget(longText, 20)
    expect(result).toContain("...")
  })
})
