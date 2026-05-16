import { describe, it, expect, vi } from "vitest"
import {
  planIngestTasks,
  mergeWriterOutputs,
  shouldUseMultiAgent,
  type IngestPlan,
  type WriterOutput,
} from "../multi-agent"

describe("shouldUseMultiAgent", () => {
  it("returns false for short source content", () => {
    const shortContent = "这是一段很短的内容"
    expect(shouldUseMultiAgent(shortContent, "")).toBe(false)
  })

  it("returns true when analysis suggests multiple entities", () => {
    const analysis = `
## Key Entities
- 英维克: 算力板块龙头
- 比亚迪: 新能源龙头
- 中际旭创: 光模块龙头

## Key Concepts
- 情绪周期
- 龙头战法
`
    const content = "x".repeat(6000)
    expect(shouldUseMultiAgent(content, analysis)).toBe(true)
  })

  it("returns false when analysis has only 1-2 entities", () => {
    const analysis = `
## Key Entities
- 英维克: 算力板块龙头

## Key Concepts
- (none)
`
    const content = "x".repeat(6000)
    expect(shouldUseMultiAgent(content, analysis)).toBe(false)
  })
})

describe("planIngestTasks", () => {
  const sampleAnalysis = `
## Key Entities
- 英维克 (300670): 算力板块龙头，今日涨停，3连板
- 比亚迪 (002594): 新能源汽车龙头，放量突破

## Key Concepts
- 情绪周期: 当前处于退潮期，高标断板
- 板块轮动: 算力→新能源切换信号

## Main Arguments
- 龙头切换往往发生在情绪退潮末期
- 仓位应在退潮期降低

## Connections to Existing Wiki
- wiki/股票/中际旭创.md 与英维克同属算力板块
- wiki/概念/龙头战法.md 与情绪周期相关
`

  it("parses analysis into structured task plan", () => {
    const plan = planIngestTasks(sampleAnalysis, "2026-05-16-复盘.md")
    expect(plan.sourceSummary).toBeDefined()
    expect(plan.sourceSummary.fileName).toBe("2026-05-16-复盘.md")
    expect(plan.entities.length).toBeGreaterThanOrEqual(2)
    expect(plan.concepts.length).toBeGreaterThanOrEqual(1)
  })

  it("extracts entity names and context", () => {
    const plan = planIngestTasks(sampleAnalysis, "test.md")
    const yingweike = plan.entities.find((e) => e.name.includes("英维克"))
    expect(yingweike).toBeDefined()
    expect(yingweike!.context).toContain("算力")
  })

  it("extracts concept names and context", () => {
    const plan = planIngestTasks(sampleAnalysis, "test.md")
    const emotion = plan.concepts.find((c) => c.name.includes("情绪周期"))
    expect(emotion).toBeDefined()
    expect(emotion!.context).toContain("退潮")
  })

  it("includes related existing pages", () => {
    const plan = planIngestTasks(sampleAnalysis, "test.md")
    expect(plan.relatedPages.length).toBeGreaterThan(0)
    expect(plan.relatedPages.some((p) => p.includes("中际旭创"))).toBe(true)
  })

  it("handles empty analysis gracefully", () => {
    const plan = planIngestTasks("", "test.md")
    expect(plan.entities).toHaveLength(0)
    expect(plan.concepts).toHaveLength(0)
    expect(plan.sourceSummary.fileName).toBe("test.md")
  })
})

describe("mergeWriterOutputs", () => {
  const outputs: WriterOutput[] = [
    {
      type: "entity",
      targetPath: "wiki/股票/英维克.md",
      content: `---
type: entity
title: "英维克"
sources: ["2026-05-16-复盘.md"]
related: ["[[算力]]", "[[中际旭创]]"]
---

# 英维克

算力板块龙头，连板高度3板。
`,
    },
    {
      type: "entity",
      targetPath: "wiki/股票/比亚迪.md",
      content: `---
type: entity
title: "比亚迪"
sources: ["2026-05-16-复盘.md"]
related: ["[[新能源]]"]
---

# 比亚迪

新能源汽车龙头，放量突破。
`,
    },
    {
      type: "concept",
      targetPath: "wiki/概念/情绪周期.md",
      content: `---
type: concept
title: "情绪周期"
sources: ["2026-05-16-复盘.md"]
related: ["[[龙头战法]]", "[[英维克]]"]
---

# 情绪周期

当前处于退潮期。
`,
    },
  ]

  it("collects all file paths", () => {
    const merged = mergeWriterOutputs(outputs, "2026-05-16-复盘.md")
    expect(merged.files.length).toBe(3)
    expect(merged.files.map((f) => f.path)).toContain("wiki/股票/英维克.md")
    expect(merged.files.map((f) => f.path)).toContain("wiki/概念/情绪周期.md")
  })

  it("generates index entries for all pages", () => {
    const merged = mergeWriterOutputs(outputs, "2026-05-16-复盘.md")
    expect(merged.indexEntries.length).toBe(3)
    expect(merged.indexEntries.some((e) => e.includes("英维克"))).toBe(true)
  })

  it("validates wikilinks point to known pages", () => {
    const merged = mergeWriterOutputs(outputs, "2026-05-16-复盘.md")
    // [[算力]] and [[新能源]] and [[龙头战法]] and [[中际旭创]] are external refs
    // [[英维克]] is an internal ref (exists in outputs)
    expect(merged.unresolvedLinks.length).toBeGreaterThan(0)
    expect(merged.unresolvedLinks).toContain("算力")
    expect(merged.unresolvedLinks).not.toContain("英维克")
  })

  it("deduplicates pages with same target path", () => {
    const duplicated: WriterOutput[] = [
      ...outputs,
      {
        type: "entity",
        targetPath: "wiki/股票/英维克.md",
        content: "duplicate content",
      },
    ]
    const merged = mergeWriterOutputs(duplicated, "test.md")
    const yingweikePaths = merged.files.filter((f) => f.path === "wiki/股票/英维克.md")
    expect(yingweikePaths.length).toBe(1)
  })

  it("generates log entry", () => {
    const merged = mergeWriterOutputs(outputs, "2026-05-16-复盘.md")
    expect(merged.logEntry).toContain("2026-05-16-复盘.md")
    expect(merged.logEntry).toContain("3")
  })
})
