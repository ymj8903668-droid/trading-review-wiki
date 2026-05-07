export interface WikiTemplate {
  id: string
  name: string
  description: string
  icon: string
  schema: string
  purpose: string
  extraDirs: string[]
  /** Initial files to write when creating a project from this template */
  files?: Record<string, string>
}

const BASE_SCHEMA_TYPES = `| entity | wiki/entities/ | Named things (people, tools, organizations, datasets) |
| concept | wiki/concepts/ | Ideas, techniques, phenomena, frameworks |
| source | wiki/sources/ | Papers, articles, talks, books, blog posts |
| query | wiki/queries/ | Open questions under active investigation |
| comparison | wiki/comparisons/ | Side-by-side analysis of related entities |
| synthesis | wiki/synthesis/ | Cross-cutting summaries and conclusions |
| overview | wiki/ | High-level project summary (one per project) |`

const BASE_NAMING = `- Files: \`kebab-case.md\`
- Entities: match official name where possible (e.g., \`openai.md\`, \`gpt-4.md\`)
- Concepts: descriptive noun phrases (e.g., \`chain-of-thought.md\`)
- Sources: \`author-year-slug.md\` (e.g., \`wei-2022-cot.md\`)
- Queries: question as slug (e.g., \`does-scale-improve-reasoning.md\`)`

const BASE_FRONTMATTER = `All pages must include YAML frontmatter:

\`\`\`yaml
---
type: entity | concept | source | query | comparison | synthesis | overview
title: Human-readable title
tags: []
related: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
\`\`\`

Source pages also include:
\`\`\`yaml
authors: []
year: YYYY
url: ""
venue: ""
\`\`\``

const BASE_INDEX_FORMAT = `\`wiki/index.md\` lists all pages grouped by type. Each entry:
\`\`\`
- [[page-slug]] — one-line description
\`\`\``

const BASE_LOG_FORMAT = `\`wiki/log.md\` records activity in reverse chronological order:
\`\`\`
## YYYY-MM-DD

- Action taken / finding noted
\`\`\``

const BASE_CROSSREF = `- Use \`[[page-slug]]\` syntax to link between wiki pages
- Every entity and concept should appear in \`wiki/index.md\`
- Queries link to the sources and concepts they draw on
- Synthesis pages cite all contributing sources via \`related:\``

const BASE_CONTRADICTION = `When sources contradict each other:
1. Note the contradiction in the relevant concept or entity page
2. Create or update a query page to track the open question
3. Link both sources from the query page
4. Resolve in a synthesis page once sufficient evidence exists`

const researchTemplate: WikiTemplate = {
  id: "research",
  name: "Research",
  description: "Deep-dive research with hypothesis tracking and methodology notes",
  icon: "🔬",
  extraDirs: ["wiki/methodology", "wiki/findings", "wiki/thesis"],
  schema: `# 炒股复盘系统 —— AGENTS.md

> 本文件定义了交易复盘 Wiki 的结构、约定和工作流程。LLM 在处理任何与交易复盘相关的任务时，必须遵循此文档。

---

## 核心理念

**复盘不是记流水账，而是通过对每一笔交易、每一个决策的反复审视，让理解像复利一样滚雪球。**

这个 Wiki 的目标：
1. **积累**：每一篇日复盘、周复盘都被消化吸收，沉淀为可复用的知识。
2. **连接**：个股、策略、错误、市场环境之间形成交叉引用网。
3. **进化**：定期 Lint（整理）发现矛盾、提炼模式、修正偏见，让交易体系随时间越来越清晰。

角色分工：
- **你（人类）**：负责提供原始素材（交割单、截图、当日感悟、新闻），提出好问题，做最终决策。
- **LLM**：负责归纳、分类、更新关联页面、发现矛盾、维护一致性。所有机械性的维护工作由 LLM 完成。

---

## 三层架构

### 1. Raw Sources（原始资料）\`raw/\`
原始资料是不可变的。你只负责往里面放东西，LLM 只读取、绝不修改。

\`\`\`
raw/
  日复盘/          # 每日交易结束后的文字复盘
  交割单/          # 券商交割单截图或导出数据
  截图/            # 盘中关键截图、买卖点截图、盘口截图
  研报新闻/        # 相关研报、行业新闻、公告
\`\`\`

**命名约定**：
- 日复盘：\`YYYY-MM-DD-复盘.md\`
- 交割单：\`YYYY-MM-DD-交割单.jpg\` 或 \`.csv\`
- 截图：\`YYYY-MM-DD-[股票代码/名称]-[描述].png\`
- 研报新闻：\`YYYY-MM-DD-[来源]-[标题].md\`

### 2. Wiki（知识库）\`wiki/\`
LLM 全权负责撰写和维护的 Markdown 文件。

\`\`\`
wiki/
  index.md              # 内容目录，每次 Ingest 后更新
  log.md                # 按时间顺序记录所有 Ingest / Query / Lint 操作
  策略/                  # 交易策略、买卖点规则、仓位管理原则
  股票/                  # 个股档案，记录你对某只股票的所有交易和理解
  模式/                  # 市场模式、题材生命周期、资金套路
  错误/                  # 错误类型、典型案例、教训总结
  市场环境/              # 不同阶段的市场特征（情绪周期、指数环境）
  进化/                  # 交易能力进化史，里程碑、关键顿悟
  预测/                  # 交易预测、明日计划、机会预判
\`\`\`

**每页必须包含 YAML frontmatter**：
\`\`\`yaml
---
title: 页面标题
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: [策略|股票|模式|错误|市场环境|进化|总结|预测]
sources: 0      # 关联的原始资料数量
status: [活跃|归档|迭代中]
---
\`\`\`

**交叉引用约定**：
- 使用 \`[[页面标题]]\` 语法链接到其他 wiki 页面。
- 每页底部添加 \`## 相关页面\` 章节，列出 3-10 个最相关的内部链接。

### 3. Schema（本文件）\`AGENTS.md\`
定义结构、约定、流程。随着你的需求变化，可以一起修改本文件。

---

## 三大核心操作

### 一、Ingest（摄入）

当你提供一篇新的原始资料时，LLM 按以下流程处理：

#### 步骤 1：读取并理解
- 仔细阅读原始资料的全部内容。
- 如果是图片（交割单、截图），先描述图片中的关键信息。

#### 步骤 2：与用户讨论（可选但推荐）
- 总结关键交易行为、情绪状态、市场环境。
- 询问用户是否有特别想强调的洞察或疑问。

#### 步骤 3：写入 Wiki（必须执行）
根据资料类型，进行以下更新：

**A. 日复盘 Ingest**：
1. 在 \`raw/日复盘/\` 中确认原始文件存在。
2. 在 \`wiki/股票/\` 下，为当日交易涉及的所有股票更新或创建个股档案。
   - 追加本次交易记录到该股票的 \`交易日志\` 表格中。
   - 更新对该股票的 \`当前理解\`。
3. 在 \`wiki/策略/\` 下，如果复盘提到了策略的运用或反思，更新相关策略页面的 \`实战记录\` 和 \`迭代记录\`。
4. 在 \`wiki/错误/\` 下，如果复盘提到了失误，更新错误类型手册或创建新的错误子页面。
5. 在 \`wiki/市场环境/\` 下，如果复盘描述了当日市场情绪、指数走势，更新对应的市场阶段页面。
6. 在 \`wiki/模式/\` 下，如果提到了某种市场模式（如冰点反弹、龙头分歧），更新模式库。
7. 更新 \`wiki/log.md\`，添加一条 Ingest 记录。
8. 更新 \`wiki/index.md\` 中的统计信息。

**B. 截图/交割单 Ingest**：
- 提取时间、股票、买卖点、价格、理由。
- 将信息补充到对应个股的 \`交易日志\` 中。
- 如果截图揭示了新的洞察（如分时特征、盘口语言），更新 \`wiki/模式/\` 或 \`wiki/股票/\`。

**C. 研报新闻 Ingest**：
- 总结核心观点。
- 更新相关个股档案的 \`基本面/消息面\` 部分。
- 如果涉及行业逻辑，在 \`wiki/模式/\` 下创建或更新行业逻辑页面。

#### 步骤 4：交叉引用检查
- 确保新创建/更新的页面与其他页面之间有 \`[[wikilink]]\` 链接。
- 检查是否有孤立页面（无入链页面），并在 index.md 中标记。

---

### 二、Query（查询）

你可以向 LLM 提出各种交易问题，LLM 会基于 Wiki 和原始资料回答，并将有价值的回答归档回 Wiki。

**典型查询示例**：
- "我最近三个月在 [[龙头股]] 上犯过什么错误？"
- "帮我对比 [[追高策略]] 和 [[低吸策略]] 在震荡市中的表现。"
- "我的交易系统目前有什么漏洞？"
- "最近一周的市场环境和 [[2025-10-08 暴跌]] 有什么相似之处？"
- "帮我看看最近一个月的交割单"

**Query 流程**：
1. LLM 先读取 \`wiki/index.md\`，定位相关页面。
2. **系统同时检索 \`wiki/\` 和 \`raw/\` 目录下的所有文本文件**，按以下规则排序：
   - **token 匹配分**：标题匹配 > 内容匹配
   - **RAW_BONUS**：\`raw/\` 下的原始资料（交割单、日复盘、研报新闻）额外 +4 分，避免被 wiki 页面埋没
   - **Recency Boost**：文件名包含 \`YYYY-MM-DD\` 的资料，按日期近远加分（≤7天 +6，≤30天 +3，≤90天 +1）
   - **Query-aware 时间范围 boost**：如果用户明确提到"最近一个月"、"本周"、"昨天"等，**该范围内的 raw 文件额外 +15 分**，确保旧文件被自然挤出
3. 取排序后的前 20 个结果竞争上下文 budget，高分者优先进入 system prompt。
4. 对于命中页面，进行 Graph 1-level expansion（展开关联页面）。
5. 综合分析后回答，必须标注引用来源（\`[[页面名]]\` 或 \`[1]、[2]\` 页码）。
6. **如果回答质量高、有长期价值，LLM 应该主动提议将其归档为新的 wiki 页面**，例如 \`分析/YYYY-MM-DD-[主题].md\`。

---

### 三、Lint（整理/深度复盘）

定期进行 Lint，是"理解越来越深"的关键机制。建议频率：**每周日做一次小 Lint，每月末做一次大 Lint**。

Lint 时，LLM 执行以下检查：

#### 1. 矛盾发现
- 对比不同页面中的观点，找出相互矛盾的地方。
  - 例如：\`wiki/策略/打板.md\` 说 "只做首板"，但 \`wiki/股票/某股.md\` 中记录了二板操作且未说明例外情况。
- 在 \`wiki/进化/\` 中记录发现的矛盾及调和方案。

#### 2. 模式提炼
- 检查最近 2-4 周的日复盘和交易记录：
  - 是否有重复出现的盈利场景？提炼为新模式或强化现有模式。
  - 是否有重复出现的亏损场景？更新错误类型手册。
- 在 \`wiki/模式/\` 中更新模式库，标注该模式的 \`胜率\`、\`适用环境\`、\`最新验证日期\`。

#### 3. 个股档案健康检查
- 检查 \`wiki/股票/\` 下的页面：
  - 是否有长期未更新但仍在持仓的股票？
  - 是否有"当前理解"过于陈旧、需要迭代的？
  - 交易日志是否完整？

#### 4. 策略有效性评估
- 检查 \`wiki/策略/\` 下的页面：
  - 策略的 \`胜率/盈亏比\` 数据是否需要更新？
  - 策略的 \`适用环境\` 描述是否准确？
  - 是否有策略长期没有实战记录，应该归档？

#### 5. 孤儿页面与缺页检查
- 找出没有入链的孤儿页面，在 \`wiki/index.md\` 中标记。
- 检查是否有在多篇复盘中提到、但还没有独立页面的概念（如某种战法、某个游资风格），提议创建新页面。

#### 6. 进化史更新
- 总结本次 Lint 的关键发现，在 \`wiki/进化/交易进化史.md\` 中追加一条记录。

#### 7. 记录 Lint 日志
- 在 \`wiki/log.md\` 中追加 Lint 记录。

---

## 特殊页面规范

### \`wiki/index.md\`
内容目录，按类别组织，每行格式：
\`\`\`markdown
- [[页面名]] — 一句话摘要 (updated: YYYY-MM-DD)
\`\`\`

必须包含以下分区：
- ## 快速导航
- ## 活跃策略
- ## 重点股票
- ## 核心模式
- ## 常见错误
- ## 市场环境
- ## 近期更新

### \`wiki/log.md\`
按时间倒序排列，每条条目格式：
\`\`\`markdown
## [YYYY-MM-DD] ingest | 2026-04-14 复盘
- 更新了 [[某股]]、[[追高策略]]
- 新增页面 [[某种错误]]

## [YYYY-MM-DD] lint | 周度整理
- 发现矛盾：...
- 提炼模式：...
\`\`\`

### \`wiki/股票/[股票名或代码].md\`
个股档案必须包含：
\`\`\`markdown
---
title: 股票名
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: 股票
code: 000001.SZ
status: 活跃
sources: 0
---

## 基本信息
## 当前理解（随时更新）
## 交易日志
| 日期 | 操作 | 价格 | 仓位 | 理由 | 结果 | 关联复盘 |
|---|---|---|---|---|---|---|
## 基本面/消息面
## 技术分析要点
## 相关页面
\`\`\`

### \`wiki/策略/[策略名].md\`
策略页面必须包含：
\`\`\`markdown
---
title: 策略名
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: 策略
status: 活跃
sources: 0
---

## 策略定义
## 入场条件
## 出场条件
## 仓位管理
## 实战记录
## 胜率与盈亏比
## 适用市场环境
## 迭代记录
## 相关页面
\`\`\`

### \`wiki/错误/[错误类型].md\`
错误页面必须包含：
\`\`\`markdown
---
title: 错误名
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: 错误
status: 活跃
sources: 0
---

## 错误定义
## 心理根源
## 典型案例
## 如何避免
## 近期犯案记录
## 相关页面
\`\`\`

### \`wiki/进化/交易进化史.md\`
按时间顺序记录关键顿悟和能力跃迁：
\`\`\`markdown
---
title: 交易进化史
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: 进化
status: 活跃
sources: 0
---

## 进化时间线

### [YYYY-MM-DD] 里程碑标题
**触发事件**：[[相关复盘]]  
**顿悟内容**：...  
**系统变化**：更新了 [[某策略]]  
**后续验证**：...

## 当前阶段总结
## 下一步修炼方向
## 相关页面
\`\`\`

---

## 系统实现细节（供 LLM 参考）

### 检索算法规则
- \`searchWiki()\` 同时搜索 \`wiki/\`（仅 \`.md\`）和 \`raw/\`（文本文件，排除图片/音视频/二进制）
- 中文查询采用 **bigram + 单字 + 完整词** 的多级 tokenization
- 上下文 budget 分配：Index 5% + Pages 60%（单页最多 30,000 字符）+ 历史对话
- 加载页面时自动去重，防止搜索命中和 Graph expansion 重复加载同一文件

### 交割单导入与盈亏计算规则
- **导入格式**：支持 \`.csv\`、\`.xlsx\`、\`.xls\`，自动识别中文表头（日期、证券代码、证券名称、买卖方向、成交数量、成交价格、成交金额、手续费、印花税、过户费、发生金额）
- **数据清洗**：
  - 自动过滤撤单/废单/未成交记录
  - 成交金额统一取**绝对值**（兼容部分券商导出负数的情况）
  - 缺少发生金额时，自动用 \`成交金额 + 手续费 + 印花税 + 过户费\` 估算
- **盈亏计算**：采用 **FIFO（先进先出）**
  - 买入成本 = \`|成交金额| + 手续费 + 过户费\`（买入无印花税）
  - 卖出净收入 = \`|成交金额| - 手续费 - 印花税 - 过户费\`
  - 单笔已实现盈亏 = \`卖出净收入 - FIFO 成本 basis\`
  - 跨天持仓卖出时，成本自动追溯至历史最早买入批次
- **统计看板**：每日盈亏由 \`computeDashboardStats\` 统一全局 FIFO 计算后回填，单日 markdown 不独立估算盈亏

## 增量理解机制（关键）

为了保证"复盘越多，理解越深"，在每次 Ingest 和 Lint 中必须执行以下动作：

1. **比较新旧理解**：在更新任何页面时，先查看旧版本，明确标注 "之前的理解是 X，新的理解是 Y"。
2. **标注置信度**：对于新的观点或模式，标注 \`置信度: 高/中/低\`，并说明需要多少案例验证。
3. **追踪验证状态**：对于曾经提出的假设，检查是否有后续复盘验证或推翻它。
4. **周期性回顾**：在 Lint 时，主动回顾 1 个月前、3 个月前的观点，评估是否有需要推翻或修正的。
5. **建立"反常识"档案**：记录那些违背你直觉但事实证明正确的交易经验，这是深度理解的重要标志。

---

## Obsidian 使用建议

- 用 Obsidian 打开 \`trading-review-wiki/wiki/\` 目录作为 Vault。
- 开启 Graph View，定期查看知识网络的生长情况。
- 使用 Dataview 插件查询带 frontmatter 的页面（如筛选 \`type: 错误\` 的页面）。
- 用 Tag 补充分类：\`#龙头 #低吸 #情绪冰点 #纪律 #心态\`

---

## 工作流程速查

\`\`\`
收盘后 → 写日复盘 → 放入 raw/日复盘/ → 对 LLM 说"摄入今日复盘" → LLM 更新 Wiki
       ↓
周末 → 对 LLM 说"执行周度 Lint" → LLM 检查矛盾、提炼模式、更新进化史
       ↓
月末 → 对 LLM 说"执行月度大 Lint" → 深度评估策略有效性、回顾假设验证
       ↓
任何时候 → 向 LLM 提问 → LLM 基于 Wiki 回答 → 好回答归档为 wiki 新页面
\`\`\`
`,
  purpose: `# Project Purpose — Research Deep-Dive

## Research Question

<!-- State the central question this research aims to answer. Be specific and falsifiable. -->

>

## Hypothesis / Working Thesis

<!-- Your current best guess. This will evolve — update it as evidence accumulates. -->

>

## Background

<!-- What prior work or context motivates this research? What gap does it fill? -->

## Sub-questions

<!-- Break down the main question into tractable sub-questions. -->

1.
2.
3.
4.

## Scope

**In scope:**
-

**Out of scope:**
-

## Methodology

<!-- How will you investigate this? What types of sources or experiments are relevant? -->

-

## Success Criteria

<!-- How will you know when you have a satisfying answer? -->

-

## Current Status

> Not started — update this section as research progresses.
`,
}

const readingTemplate: WikiTemplate = {
  id: "reading",
  name: "Reading",
  description: "Track a book's characters, themes, plot threads, and chapter notes",
  icon: "📚",
  extraDirs: ["wiki/characters", "wiki/themes", "wiki/plot-threads", "wiki/chapters"],
  schema: `# Wiki Schema — Reading a Book

## Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
${BASE_SCHEMA_TYPES}
| character | wiki/characters/ | People and figures in the book |
| theme | wiki/themes/ | Recurring ideas, motifs, and symbolic threads |
| plot-thread | wiki/plot-threads/ | Storylines or narrative arcs being tracked |
| chapter | wiki/chapters/ | Per-chapter notes and summaries |

## Naming Conventions

${BASE_NAMING}
- Characters: character name in kebab-case (e.g., \`elizabeth-bennet.md\`)
- Themes: thematic noun phrase (e.g., \`social-class-mobility.md\`, \`deception-vs-honesty.md\`)
- Plot threads: arc description (e.g., \`darcys-redemption-arc.md\`)
- Chapters: \`ch-NN-slug.md\` (e.g., \`ch-01-opening-scene.md\`)

## Frontmatter

${BASE_FRONTMATTER}

Character pages also include:
\`\`\`yaml
first_appearance: "Ch. N"
role: protagonist | antagonist | supporting | minor
\`\`\`

Chapter pages also include:
\`\`\`yaml
chapter: N
pages: "1-24"
\`\`\`

## Index Format

${BASE_INDEX_FORMAT}

## Log Format

${BASE_LOG_FORMAT}

## Cross-referencing Rules

${BASE_CROSSREF}
- Chapter notes reference characters appearing in that chapter via \`related:\`
- Theme pages link to the chapters where the theme is most prominent
- Plot thread pages list chapters that advance the arc

## Contradiction Handling

${BASE_CONTRADICTION}

## Reading-Specific Conventions

- Chapter pages are written during or immediately after reading — capture fresh reactions
- Distinguish between plot summary and personal interpretation in chapter notes
- Theme pages should track *development* across the book, not just state that a theme exists
- Flag unresolved plot threads with status: \`open\` until resolved
- Note page numbers for important quotes to enable re-finding later
`,
  purpose: `# Project Purpose — Reading

## Book Details

**Title:**
**Author:**
**Year:**
**Genre:**

## Why I'm Reading This

<!-- What drew you to this book? What do you hope to get from it? -->

## Key Themes to Track

<!-- What thematic threads do you expect or want to follow? -->

1.
2.
3.

## Questions Going In

<!-- What do you want answered or explored by the end? -->

1.
2.

## Reading Pace

**Started:**
**Target finish:**
**Current chapter:**

## First Impressions

<!-- Update after first chapter or first sitting. -->

>

## Final Takeaways

<!-- Fill in when finished. What did this book teach you? -->

>
`,
}

const personalTemplate: WikiTemplate = {
  id: "personal",
  name: "Personal Growth",
  description: "Track goals, habits, reflections, and journal entries for self-improvement",
  icon: "🌱",
  extraDirs: ["wiki/goals", "wiki/habits", "wiki/reflections", "wiki/journal"],
  schema: `# Wiki Schema — Personal Growth

## Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
${BASE_SCHEMA_TYPES}
| goal | wiki/goals/ | Specific outcomes you are working toward |
| habit | wiki/habits/ | Recurring behaviours and their tracking |
| reflection | wiki/reflections/ | Periodic reviews and lessons learned |
| journal | wiki/journal/ | Freeform daily or session entries |

## Naming Conventions

${BASE_NAMING}
- Goals: outcome as slug (e.g., \`run-a-marathon.md\`, \`learn-spanish.md\`)
- Habits: behaviour name (e.g., \`daily-meditation.md\`, \`morning-pages.md\`)
- Reflections: type + date (e.g., \`weekly-2024-03.md\`, \`quarterly-2024-q1.md\`)
- Journal: date slug (e.g., \`2024-03-15.md\`)

## Frontmatter

${BASE_FRONTMATTER}

Goal pages also include:
\`\`\`yaml
target_date: YYYY-MM-DD
status: active | paused | achieved | abandoned
progress: 0-100
\`\`\`

Habit pages also include:
\`\`\`yaml
frequency: daily | weekly | monthly
streak: N
status: active | paused | dropped
\`\`\`

Reflection pages also include:
\`\`\`yaml
period: weekly | monthly | quarterly | annual
\`\`\`

## Index Format

${BASE_INDEX_FORMAT}

## Log Format

${BASE_LOG_FORMAT}

## Cross-referencing Rules

${BASE_CROSSREF}
- Reflection pages reference the goals and habits reviewed during that period
- Goals link to the habits that support them via \`related:\`
- Journal entries can reference goals and reflections inline with \`[[slug]]\`

## Contradiction Handling

${BASE_CONTRADICTION}

## Personal Growth Conventions

- Be honest in journal and reflection entries — this wiki is for you, not an audience
- Update goal progress fields regularly; stale data is worse than no data
- Distinguish between outcome goals (what you want) and process goals (what you will do)
- Reflect on *why* habits succeed or fail, not just whether they did
- Use the synthesis directory for cross-cutting insights that span multiple goals or periods
`,
  purpose: `# Project Purpose — Personal Growth

## Focus Areas

<!-- What areas of your life or self are you actively working on? -->

1.
2.
3.

## Motivation

<!-- Why now? What prompted you to start this wiki? -->

## Current Goals (Summary)

<!-- High-level list — create detailed goal pages in wiki/goals/ -->

- [ ]
- [ ]
- [ ]

## Active Habits

<!-- High-level list — create detailed habit pages in wiki/habits/ -->

-
-

## Review Cadence

**Daily journal:** Yes / No
**Weekly reflection:**
**Monthly reflection:**
**Quarterly reflection:**

## Guiding Principles

<!-- What values or principles guide your growth work? -->

1.
2.
3.

## This Year's Theme

<!-- One phrase or sentence that captures your intention for the year. -->

>
`,
}

const businessTemplate: WikiTemplate = {
  id: "business",
  name: "Business",
  description: "Manage meetings, decisions, projects, and stakeholder context for a team",
  icon: "💼",
  extraDirs: ["wiki/meetings", "wiki/decisions", "wiki/projects", "wiki/stakeholders"],
  schema: `# Wiki Schema — Business / Team

## Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
${BASE_SCHEMA_TYPES}
| meeting | wiki/meetings/ | Meeting notes, agendas, and action items |
| decision | wiki/decisions/ | Architectural or strategic decisions (ADR-style) |
| project | wiki/projects/ | Project briefs, status, and retrospectives |
| stakeholder | wiki/stakeholders/ | People, teams, and organisations involved |

## Naming Conventions

${BASE_NAMING}
- Meetings: \`YYYY-MM-DD-slug.md\` (e.g., \`2024-03-15-sprint-planning.md\`)
- Decisions: \`NNN-slug.md\` (e.g., \`001-adopt-typescript.md\`)
- Projects: descriptive slug (e.g., \`payments-redesign.md\`)
- Stakeholders: name or team in kebab-case (e.g., \`alice-chen.md\`, \`platform-team.md\`)

## Frontmatter

${BASE_FRONTMATTER}

Meeting pages also include:
\`\`\`yaml
date: YYYY-MM-DD
attendees: []
action_items: []
\`\`\`

Decision pages also include:
\`\`\`yaml
status: proposed | accepted | deprecated | superseded
deciders: []
date: YYYY-MM-DD
supersedes: ""   # slug of ADR this replaces, if any
\`\`\`

Project pages also include:
\`\`\`yaml
status: planned | active | on-hold | complete | cancelled
owner: ""
start_date: YYYY-MM-DD
target_date: YYYY-MM-DD
\`\`\`

## Index Format

${BASE_INDEX_FORMAT}

## Log Format

${BASE_LOG_FORMAT}

## Cross-referencing Rules

${BASE_CROSSREF}
- Meeting notes reference attendees via \`attendees:\` frontmatter and \`[[stakeholder-slug]]\` links
- Decision pages link to the meetings where the decision was discussed
- Project pages link to their key decisions via \`related:\`
- Stakeholder pages list projects and decisions they are involved in

## Contradiction Handling

${BASE_CONTRADICTION}

## Business-Specific Conventions

- Write meeting notes during or within 24 hours — memory fades fast
- Action items must have a named owner and due date to be actionable
- Decision pages capture *context and consequences*, not just the decision itself
- Deprecated decisions should link to the decision that superseded them
- Projects should have a retrospective section added on completion
`,
  purpose: `# Project Purpose — Business / Team

## Business Context

**Organisation / Team:**
**Domain:**
**Time period covered:**

## Objectives

<!-- What are the top-level business objectives this wiki supports? -->

1.
2.
3.

## Key Projects

<!-- High-level list — create detailed pages in wiki/projects/ -->

-
-

## Key Stakeholders

<!-- Who are the primary people or teams involved? -->

-
-

## Open Decisions

<!-- Decisions currently in flight — create ADR pages in wiki/decisions/ -->

-
-

## Metrics / Success Criteria

<!-- How does the team measure progress toward its objectives? -->

-

## Constraints and Risks

<!-- Known constraints (budget, time, org) and risks to track -->

-

## Review Cadence

**Weekly sync notes:**
**Monthly status update:**
**Quarterly retrospective:**
`,
}

const generalTemplate: WikiTemplate = {
  id: "general",
  name: "General",
  description: "Minimal setup — a blank slate for any purpose",
  icon: "📄",
  extraDirs: [],
  schema: `# Wiki Schema

## Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
${BASE_SCHEMA_TYPES}

## Naming Conventions

${BASE_NAMING}

## Frontmatter

${BASE_FRONTMATTER}

## Index Format

${BASE_INDEX_FORMAT}

## Log Format

${BASE_LOG_FORMAT}

## Cross-referencing Rules

${BASE_CROSSREF}

## Contradiction Handling

${BASE_CONTRADICTION}
`,
  purpose: `# Project Purpose

## Goal

<!-- What are you trying to understand or build? -->

## Key Questions

<!-- List the primary questions driving this project -->

1.
2.
3.

## Scope

**In scope:**
-

**Out of scope:**
-

## Thesis

<!-- Your current working hypothesis or conclusion (update as the project progresses) -->

> TBD
`,
}

const DAILY_REVIEW_TEMPLATE = `# YYYY-MM-DD 交易复盘

## 一、今日操作

### 操作 1：买入/卖出 [股票名称/代码]
- **时间**：09:35
- **价格**：XX.XX
- **仓位**：X 成
- **理由**：
- **结果**：盈利/亏损 X%
- **截图**：\`../截图/YYYY-MM-DD-股票名-买卖点.png\`

### 操作 2：...

---

## 二、市场环境

- **指数走势**：上涨/下跌/震荡
- **市场情绪**：高涨/分化/冰点
- **涨停家数**：XX
- **跌停家数**：XX
- **主流题材**：...
- **特殊事件**：...

---

## 三、心态与纪律

- **情绪状态**：平静/焦虑/兴奋/懊悔
- **是否按计划交易**：是/否
- **最强烈的情绪时刻**：...
- **自我评分（1-10）**：X

---

## 四、关键反思

### 做对了什么？
1. 

### 做错了什么？
1. 

### 新发现/新疑问？
1. 

---

## 五、明日计划（可选）

1. 
2. 
3. 

---

> 写完后放入 \`raw/日复盘/YYYY-MM-DD-复盘.md\`，然后对 LLM 说"摄入今日复盘"。
`

const tradingTemplate: WikiTemplate = {
  id: "trading",
  name: "交易复盘",
  description: "专为股票交易者设计的复盘系统，沉淀策略、模式与进化",
  icon: "📈",
  extraDirs: ["raw/日复盘", "raw/交割单", "raw/截图", "raw/研报新闻", "wiki/策略", "wiki/股票", "wiki/模式", "wiki/错误", "wiki/市场环境", "wiki/进化", "wiki/预测"],
  files: {
    "raw/日复盘/日复盘模板.md": DAILY_REVIEW_TEMPLATE,
    "wiki/index.md": `---
title: 交易复盘知识库索引
created: 2026-04-15
updated: 2026-04-15
type: 索引
status: 活跃
---

> 欢迎来到你的交易复盘 Wiki。这里记录的不是单次交易的结果，而是随时间复利增长的交易理解。

---

## 快速导航

- [[交易策略总览]] — 所有活跃和归档的策略汇总
- [[交易进化史]] — 关键顿悟和能力跃迁的时间线
- [[市场模式库]] — 反复出现的市场套路和资金行为
- [[错误类型手册]] — 反复犯错的心理根源和防范措施

---

## 活跃策略

*暂无策略，摄入第一篇复盘后自动填充。*

---

## 重点股票

*暂无个股档案，摄入第一篇复盘后自动填充。*

---

## 核心模式

*暂无模式，摄入第一篇复盘后自动填充。*

---

## 常见错误

*暂无错误记录，摄入第一篇复盘后自动填充。*

---

## 市场环境

*暂无市场环境记录，摄入第一篇复盘后自动填充。*

---

## 近期更新

- 2026-04-15 — 创建交易复盘 Wiki 系统

---

## 系统统计

| 类别 | 数量 | 最后更新 |
|---|---|---|
| 活跃策略 | 0 | 2026-04-15 |
| 个股档案 | 0 | 2026-04-15 |
| 核心模式 | 0 | 2026-04-15 |
| 错误类型 | 0 | 2026-04-15 |
| 原始复盘 | 0 | 2026-04-15 |
`,
    "wiki/策略/交易策略总览.md": `---
title: 交易策略总览
created: 2026-04-15
updated: 2026-04-15
type: 策略
status: 活跃
sources: 0
---

> 本页面是所有交易策略的索引和总览。每个子策略应有独立的页面，并在本页汇总其状态。

---

## 活跃策略

| 策略 | 定义 | 胜率 | 盈亏比 | 适用环境 | 最后验证 |
|---|---|---|---|---|---|
| *待填充* | | | | | |

## 迭代中策略

| 策略 | 定义 | 问题 | 下一步 |
|---|---|---|---|
| *待填充* | | | |

## 已归档策略

| 策略 | 归档原因 | 归档日期 |
|---|---|---|
| *待填充* | | |

---

## 策略关系图

（用文字描述策略之间的互补/互斥关系）

- *待填充*

---

## 当前交易系统框架

### 选股层面
*待填充*

### 买点层面
*待填充*

### 卖点层面
*待填充*

### 仓位管理
*待填充*

---

## 相关页面

- [[交易进化史]]
- [[市场模式库]]
- [[错误类型手册]]
`,
    "wiki/进化/交易进化史.md": `---
title: 交易进化史
created: 2026-04-15
updated: 2026-04-15
type: 进化
status: 活跃
sources: 0
---

> 记录交易路上的关键顿悟、能力跃迁和里程碑事件。这不是流水账，而是"今日之我推翻昨日之我"的证据。

---

## 进化时间线

### [2026-04-15] Wiki 系统建立
**触发事件**：意识到零散复盘无法形成复利，需要结构化知识库。  
**顿悟内容**：交易进步不是靠盘感，而是靠对历史决策的系统性反思和模式提炼。  
**系统变化**：建立基于 LLM Wiki 的复盘系统，将每日复盘、策略、错误、模式全部关联。  
**后续验证**：等待第一个月的数据验证系统有效性。

---

## 按主题分类

### 心态进化
*待填充*

### 认知进化
*待填充*

### 纪律进化
*待填充*

---

## 当前阶段总结

**当前主要瓶颈**：*待填充*  
**最迫切需要解决的问题**：*待填充*  
**最近一个月的进步**：*待填充*

---

## 下一步修炼方向

1. *待填充*
2. *待填充*
3. *待填充*

---

## 反常识档案

> 记录那些违背直觉但事后证明正确的交易经验。

1. *待填充*

---

## 相关页面

- [[交易策略总览]]
- [[市场模式库]]
- [[错误类型手册]]
`,
    "wiki/模式/市场模式库.md": `---
title: 市场模式库
created: 2026-04-15
updated: 2026-04-15
type: 模式
status: 活跃
sources: 0
---

> 市场模式不是预测，而是对资金行为规律的总结。每种模式都需要大量案例验证，并明确其边界条件。

---

## 模式索引

### 情绪周期类
| 模式 | 置信度 | 最近验证 | 状态 |
|---|---|---|---|
| *待填充* | | | |

### 题材演绎类
| 模式 | 置信度 | 最近验证 | 状态 |
|---|---|---|---|
| *待填充* | | | |

### 个股走势类
| 模式 | 置信度 | 最近验证 | 状态 |
|---|---|---|---|
| *待填充* | | | |

### 盘口语言类
| 模式 | 置信度 | 最近验证 | 状态 |
|---|---|---|---|
| *待填充* | | | |

---

## 模式详情模板

> 以下是一个示例模板，每个独立模式页面应包含这些内容。

### 模式名称：[示例] 情绪冰点后的首板套利
**定义**：市场在连续大跌后，涨停家数少于 20 家，次日出现的首板票有较高溢价。  
**入场条件**：*待填充*  
**出场条件**：*待填充*  
**历史案例**：*待填充*  
**胜率**：*待填充*  
**盈亏比**：*待填充*  
**适用环境**：*待填充*  
**失效信号**：*待填充*  
**置信度**：低（需要 10+ 案例验证）

---

## 市场环境匹配表

| 市场环境 | 推荐模式 | 回避模式 |
|---|---|---|
| *待填充* | | |

---

## 相关页面

- [[交易策略总览]]
- [[交易进化史]]
- [[错误类型手册]]
`,
    "wiki/错误/错误类型手册.md": `---
title: 错误类型手册
created: 2026-04-15
updated: 2026-04-15
type: 错误
status: 活跃
sources: 0
---

> 记录交易中反复出现的错误类型。目标不是零错误，而是通过结构化记录降低重复犯错的概率。

---

## 错误索引

### 认知错误
| 错误 | 频次 | 最近犯案 | 状态 |
|---|---|---|---|
| *待填充* | | | |

### 执行错误
| 错误 | 频次 | 最近犯案 | 状态 |
|---|---|---|---|
| *待填充* | | | |

### 心态错误
| 错误 | 频次 | 最近犯案 | 状态 |
|---|---|---|---|
| *待填充* | | | |

---

## 错误详情模板

### 错误名称：[示例] 冲动追高
**定义**：在没有明确买点信号时，因 FOMO（害怕错过）而追涨买入。  
**心理根源**：贪婪、对他人收益的嫉妒、对踏空的恐惧。  
**典型场景**：龙头已经涨停，去买跟风票；早盘冲高时追入。  
**防范措施**：
1. 买入前默念策略 checklist
2. 设置买入冷静期（至少观察 5 分钟）
3. 只买计划内的票
**近期犯案记录**：*待填充*  
**改进效果**：*待填充*

---

## 错误与策略的关联

| 策略 | 最常犯的错误 | 防范优先级 |
|---|---|---|
| *待填充* | | |

---

## 相关页面

- [[交易策略总览]]
- [[交易进化史]]
- [[市场模式库]]
`,
  },
schema: `# 炒股复盘系统 —— AGENTS.md

> 本文件定义了交易复盘 Wiki 的结构、约定和工作流程。LLM 在处理任何与交易复盘相关的任务时，必须遵循此文档。

---

## 核心理念

**复盘不是记流水账，而是通过对每一笔交易、每一个决策的反复审视，让理解像复利一样滚雪球。**

这个 Wiki 的目标：
1. **积累**：每一篇日复盘、周复盘都被消化吸收，沉淀为可复用的知识。
2. **连接**：个股、策略、错误、市场环境之间形成交叉引用网。
3. **进化**：定期 Lint（整理）发现矛盾、提炼模式、修正偏见，让交易体系随时间越来越清晰。

角色分工：
- **你（人类）**：负责提供原始素材（交割单、截图、当日感悟、新闻），提出好问题，做最终决策。
- **LLM**：负责归纳、分类、更新关联页面、发现矛盾、维护一致性。所有机械性的维护工作由 LLM 完成。

---

## 三层架构

### 1. Raw Sources（原始资料）\`raw/\`
原始资料是不可变的。你只负责往里面放东西，LLM 只读取、绝不修改。

\`\`\`
raw/
  日复盘/          # 每日交易结束后的文字复盘
  交割单/          # 券商交割单截图或导出数据
  截图/            # 盘中关键截图、买卖点截图、盘口截图
  研报新闻/        # 相关研报、行业新闻、公告
\`\`\`

**命名约定**：
- 日复盘：\`YYYY-MM-DD-复盘.md\`
- 交割单：\`YYYY-MM-DD-交割单.jpg\` 或 \`.csv\`
- 截图：\`YYYY-MM-DD-[股票代码/名称]-[描述].png\`
- 研报新闻：\`YYYY-MM-DD-[来源]-[标题].md\`

### 2. Wiki（知识库）\`wiki/\`
LLM 全权负责撰写和维护的 Markdown 文件。

\`\`\`
wiki/
  index.md              # 内容目录，每次 Ingest 后更新
  log.md                # 按时间顺序记录所有 Ingest / Query / Lint 操作
  策略/                  # 交易策略、买卖点规则、仓位管理原则
  股票/                  # 个股档案，记录你对某只股票的所有交易和理解
  模式/                  # 市场模式、题材生命周期、资金套路
  错误/                  # 错误类型、典型案例、教训总结
  市场环境/              # 不同阶段的市场特征（情绪周期、指数环境）
  进化/                  # 交易能力进化史，里程碑、关键顿悟
  预测/                  # 交易预测、明日计划、机会预判
\`\`\`

**每页必须包含 YAML frontmatter**：
\`\`\`yaml
---
title: 页面标题
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: [策略|股票|模式|错误|市场环境|进化|总结|预测]
sources: 0      # 关联的原始资料数量
status: [活跃|归档|迭代中]
---
\`\`\`

**交叉引用约定**：
- 使用 \`[[页面标题]]\` 语法链接到其他 wiki 页面。
- 每页底部添加 \`## 相关页面\` 章节，列出 3-10 个最相关的内部链接。

### 3. Schema（本文件）\`AGENTS.md\`
定义结构、约定、流程。随着你的需求变化，可以一起修改本文件。

---

## 三大核心操作

### 一、Ingest（摄入）

当你提供一篇新的原始资料时，LLM 按以下流程处理：

#### 步骤 1：读取并理解
- 仔细阅读原始资料的全部内容。
- 如果是图片（交割单、截图），先描述图片中的关键信息。

#### 步骤 2：与用户讨论（可选但推荐）
- 总结关键交易行为、情绪状态、市场环境。
- 询问用户是否有特别想强调的洞察或疑问。

#### 步骤 3：写入 Wiki（必须执行）
根据资料类型，进行以下更新：

**A. 日复盘 Ingest**：
1. 在 \`raw/日复盘/\` 中确认原始文件存在。
2. 在 \`wiki/股票/\` 下，为当日交易涉及的所有股票更新或创建个股档案。
   - 追加本次交易记录到该股票的 \`交易日志\` 表格中。
   - 更新对该股票的 \`当前理解\`。
3. 在 \`wiki/策略/\` 下，如果复盘提到了策略的运用或反思，更新相关策略页面的 \`实战记录\` 和 \`迭代记录\`。
4. 在 \`wiki/错误/\` 下，如果复盘提到了失误，更新错误类型手册或创建新的错误子页面。
5. 在 \`wiki/市场环境/\` 下，如果复盘描述了当日市场情绪、指数走势，更新对应的市场阶段页面。
6. 在 \`wiki/模式/\` 下，如果提到了某种市场模式（如冰点反弹、龙头分歧），更新模式库。
7. 更新 \`wiki/log.md\`，添加一条 Ingest 记录。
8. 更新 \`wiki/index.md\` 中的统计信息。

**B. 截图/交割单 Ingest**：
- 提取时间、股票、买卖点、价格、理由。
- 将信息补充到对应个股的 \`交易日志\` 中。
- 如果截图揭示了新的洞察（如分时特征、盘口语言），更新 \`wiki/模式/\` 或 \`wiki/股票/\`。

**C. 研报新闻 Ingest**：
- 总结核心观点。
- 更新相关个股档案的 \`基本面/消息面\` 部分。
- 如果涉及行业逻辑，在 \`wiki/模式/\` 下创建或更新行业逻辑页面。

#### 步骤 4：交叉引用检查
- 确保新创建/更新的页面与其他页面之间有 \`[[wikilink]]\` 链接。
- 检查是否有孤立页面（无入链页面），并在 index.md 中标记。

---

### 二、Query（查询）

你可以向 LLM 提出各种交易问题，LLM 会基于 Wiki 和原始资料回答，并将有价值的回答归档回 Wiki。

**典型查询示例**：
- "我最近三个月在 [[龙头股]] 上犯过什么错误？"
- "帮我对比 [[追高策略]] 和 [[低吸策略]] 在震荡市中的表现。"
- "我的交易系统目前有什么漏洞？"
- "最近一周的市场环境和 [[2025-10-08 暴跌]] 有什么相似之处？"
- "帮我看看最近一个月的交割单"

**Query 流程**：
1. LLM 先读取 \`wiki/index.md\`，定位相关页面。
2. **系统同时检索 \`wiki/\` 和 \`raw/\` 目录下的所有文本文件**，按以下规则排序：
   - **token 匹配分**：标题匹配 > 内容匹配
   - **RAW_BONUS**：\`raw/\` 下的原始资料（交割单、日复盘、研报新闻）额外 +4 分，避免被 wiki 页面埋没
   - **Recency Boost**：文件名包含 \`YYYY-MM-DD\` 的资料，按日期近远加分（≤7天 +6，≤30天 +3，≤90天 +1）
   - **Query-aware 时间范围 boost**：如果用户明确提到"最近一个月"、"本周"、"昨天"等，**该范围内的 raw 文件额外 +15 分**，确保旧文件被自然挤出
3. 取排序后的前 20 个结果竞争上下文 budget，高分者优先进入 system prompt。
4. 对于命中页面，进行 Graph 1-level expansion（展开关联页面）。
5. 综合分析后回答，必须标注引用来源（\`[[页面名]]\` 或 \`[1]、[2]\` 页码）。
6. **如果回答质量高、有长期价值，LLM 应该主动提议将其归档为新的 wiki 页面**，例如 \`分析/YYYY-MM-DD-[主题].md\`。

---

### 三、Lint（整理/深度复盘）

定期进行 Lint，是"理解越来越深"的关键机制。建议频率：**每周日做一次小 Lint，每月末做一次大 Lint**。

Lint 时，LLM 执行以下检查：

#### 1. 矛盾发现
- 对比不同页面中的观点，找出相互矛盾的地方。
  - 例如：\`wiki/策略/打板.md\` 说 "只做首板"，但 \`wiki/股票/某股.md\` 中记录了二板操作且未说明例外情况。
- 在 \`wiki/进化/\` 中记录发现的矛盾及调和方案。

#### 2. 模式提炼
- 检查最近 2-4 周的日复盘和交易记录：
  - 是否有重复出现的盈利场景？提炼为新模式或强化现有模式。
  - 是否有重复出现的亏损场景？更新错误类型手册。
- 在 \`wiki/模式/\` 中更新模式库，标注该模式的 \`胜率\`、\`适用环境\`、\`最新验证日期\`。

#### 3. 个股档案健康检查
- 检查 \`wiki/股票/\` 下的页面：
  - 是否有长期未更新但仍在持仓的股票？
  - 是否有"当前理解"过于陈旧、需要迭代的？
  - 交易日志是否完整？

#### 4. 策略有效性评估
- 检查 \`wiki/策略/\` 下的页面：
  - 策略的 \`胜率/盈亏比\` 数据是否需要更新？
  - 策略的 \`适用环境\` 描述是否准确？
  - 是否有策略长期没有实战记录，应该归档？

#### 5. 孤儿页面与缺页检查
- 找出没有入链的孤儿页面，在 \`wiki/index.md\` 中标记。
- 检查是否有在多篇复盘中提到、但还没有独立页面的概念（如某种战法、某个游资风格），提议创建新页面。

#### 6. 进化史更新
- 总结本次 Lint 的关键发现，在 \`wiki/进化/交易进化史.md\` 中追加一条记录。

#### 7. 记录 Lint 日志
- 在 \`wiki/log.md\` 中追加 Lint 记录。

---

## 特殊页面规范

### \`wiki/index.md\`
内容目录，按类别组织，每行格式：
\`\`\`markdown
- [[页面名]] — 一句话摘要 (updated: YYYY-MM-DD)
\`\`\`

必须包含以下分区：
- ## 快速导航
- ## 活跃策略
- ## 重点股票
- ## 核心模式
- ## 常见错误
- ## 市场环境
- ## 近期更新

### \`wiki/log.md\`
按时间倒序排列，每条条目格式：
\`\`\`markdown
## [YYYY-MM-DD] ingest | 2026-04-14 复盘
- 更新了 [[某股]]、[[追高策略]]
- 新增页面 [[某种错误]]

## [YYYY-MM-DD] lint | 周度整理
- 发现矛盾：...
- 提炼模式：...
\`\`\`

### \`wiki/股票/[股票名或代码].md\`
个股档案必须包含：
\`\`\`markdown
---
title: 股票名
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: 股票
code: 000001.SZ
status: 活跃
sources: 0
---

## 基本信息
## 当前理解（随时更新）
## 交易日志
| 日期 | 操作 | 价格 | 仓位 | 理由 | 结果 | 关联复盘 |
|---|---|---|---|---|---|---|
## 基本面/消息面
## 技术分析要点
## 相关页面
\`\`\`

### \`wiki/策略/[策略名].md\`
策略页面必须包含：
\`\`\`markdown
---
title: 策略名
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: 策略
status: 活跃
sources: 0
---

## 策略定义
## 入场条件
## 出场条件
## 仓位管理
## 实战记录
## 胜率与盈亏比
## 适用市场环境
## 迭代记录
## 相关页面
\`\`\`

### \`wiki/错误/[错误类型].md\`
错误页面必须包含：
\`\`\`markdown
---
title: 错误名
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: 错误
status: 活跃
sources: 0
---

## 错误定义
## 心理根源
## 典型案例
## 如何避免
## 近期犯案记录
## 相关页面
\`\`\`

### \`wiki/进化/交易进化史.md\`
按时间顺序记录关键顿悟和能力跃迁：
\`\`\`markdown
---
title: 交易进化史
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: 进化
status: 活跃
sources: 0
---

## 进化时间线

### [YYYY-MM-DD] 里程碑标题
**触发事件**：[[相关复盘]]  
**顿悟内容**：...  
**系统变化**：更新了 [[某策略]]  
**后续验证**：...

## 当前阶段总结
## 下一步修炼方向
## 相关页面
\`\`\`

---

## 系统实现细节（供 LLM 参考）

### 检索算法规则
- \`searchWiki()\` 同时搜索 \`wiki/\`（仅 \`.md\`）和 \`raw/\`（文本文件，排除图片/音视频/二进制）
- 中文查询采用 **bigram + 单字 + 完整词** 的多级 tokenization
- 上下文 budget 分配：Index 5% + Pages 60%（单页最多 30,000 字符）+ 历史对话
- 加载页面时自动去重，防止搜索命中和 Graph expansion 重复加载同一文件

### 交割单导入与盈亏计算规则
- **导入格式**：支持 \`.csv\`、\`.xlsx\`、\`.xls\`，自动识别中文表头（日期、证券代码、证券名称、买卖方向、成交数量、成交价格、成交金额、手续费、印花税、过户费、发生金额）
- **数据清洗**：
  - 自动过滤撤单/废单/未成交记录
  - 成交金额统一取**绝对值**（兼容部分券商导出负数的情况）
  - 缺少发生金额时，自动用 \`成交金额 + 手续费 + 印花税 + 过户费\` 估算
- **盈亏计算**：采用 **FIFO（先进先出）**
  - 买入成本 = \`|成交金额| + 手续费 + 过户费\`（买入无印花税）
  - 卖出净收入 = \`|成交金额| - 手续费 - 印花税 - 过户费\`
  - 单笔已实现盈亏 = \`卖出净收入 - FIFO 成本 basis\`
  - 跨天持仓卖出时，成本自动追溯至历史最早买入批次
- **统计看板**：每日盈亏由 \`computeDashboardStats\` 统一全局 FIFO 计算后回填，单日 markdown 不独立估算盈亏

## 增量理解机制（关键）

为了保证"复盘越多，理解越深"，在每次 Ingest 和 Lint 中必须执行以下动作：

1. **比较新旧理解**：在更新任何页面时，先查看旧版本，明确标注 "之前的理解是 X，新的理解是 Y"。
2. **标注置信度**：对于新的观点或模式，标注 \`置信度: 高/中/低\`，并说明需要多少案例验证。
3. **追踪验证状态**：对于曾经提出的假设，检查是否有后续复盘验证或推翻它。
4. **周期性回顾**：在 Lint 时，主动回顾 1 个月前、3 个月前的观点，评估是否有需要推翻或修正的。
5. **建立"反常识"档案**：记录那些违背你直觉但事实证明正确的交易经验，这是深度理解的重要标志。

---

## Obsidian 使用建议

- 用 Obsidian 打开 \`trading-review-wiki/wiki/\` 目录作为 Vault。
- 开启 Graph View，定期查看知识网络的生长情况。
- 使用 Dataview 插件查询带 frontmatter 的页面（如筛选 \`type: 错误\` 的页面）。
- 用 Tag 补充分类：\`#龙头 #低吸 #情绪冰点 #纪律 #心态\`

---

## 工作流程速查

\`\`\`
收盘后 → 写日复盘 → 放入 raw/日复盘/ → 对 LLM 说"摄入今日复盘" → LLM 更新 Wiki
       ↓
周末 → 对 LLM 说"执行周度 Lint" → LLM 检查矛盾、提炼模式、更新进化史
       ↓
月末 → 对 LLM 说"执行月度大 Lint" → 深度评估策略有效性、回顾假设验证
       ↓
任何时候 → 向 LLM 提问 → LLM 基于 Wiki 回答 → 好回答归档为 wiki 新页面
\`\`\`
`,

  purpose: `# 交易复盘库目标

## 交易目标

**年度收益率目标：** ___%
**最大回撤控制：** ___%
**月度胜率目标：** ___%

## 当前交易系统

### 选股层面
-

### 买点层面
-

### 卖点层面
-

### 仓位管理
-

## 目前最迫切需要解决的 3 个问题

1.
2.
3.

## 复盘频率承诺

**每日收盘后**：15 分钟写日复盘
**每周日**：30 分钟周度 Lint
**每月末**：1 小时月度大 Lint

## 成功标准

三个月后，我能清晰回答：
- 我的核心盈利模式是什么？
- 我最常犯的 3 个错误是什么？如何防范？
- 我在什么市场环境下最应该空仓？
`,
}

export const templates: WikiTemplate[] = [
  tradingTemplate,
  researchTemplate,
  readingTemplate,
  personalTemplate,
  businessTemplate,
  generalTemplate,
]

export function getTemplate(id: string): WikiTemplate {
  const found = templates.find((t) => t.id === id)
  if (!found) {
    throw new Error(`Unknown template id: "${id}"`)
  }
  return found
}
