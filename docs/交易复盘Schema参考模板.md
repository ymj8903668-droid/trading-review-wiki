# 交易复盘 Wiki Schema 参考模板

> 这是一个从真实交易复盘知识库抽象出来的 `schema.md` 参考版本。它适合用作从 0 建库、改造已有 wiki、或让外部 Agent 接入 CLI 时的结构协议起点。

本文档不是必须照抄的唯一标准。更好的用法是：先复制核心分层、frontmatter、页面职责和写入边界，再按自己的交易风格、资料来源和复盘节奏调整。

## 1. 核心理念

交易复盘知识库的目标不是保存流水账，而是让每次交易、每条资料、每个判断都能被重新检索、验证、纠错和复用。

建议把系统拆成三类角色：

| 角色 | 负责内容 |
|---|---|
| 人类 | 提供原始资料、提出关键问题、裁决高风险判断 |
| LLM / Agent | 归纳资料、维护 wiki 页面、发现矛盾、补充双链和来源 |
| 程序化维护层 | 维护索引、日志、事实账本、审计报告和批量写入边界 |

一个健康的交易复盘 wiki 应该持续回答这些问题：

- 我最近真正理解了什么？
- 哪些判断后来被验证，哪些被证伪？
- 哪些错误反复出现？
- 哪些模式只在特定市场环境下有效？
- 哪些结论有原始证据，哪些只是舆情或推测？

## 2. 推荐目录结构

```text
wiki-project/
├── purpose.md
├── schema.md
├── raw/
│   ├── 日复盘/
│   ├── 交割单/
│   ├── 截图/
│   ├── 研报新闻/
│   ├── 聊天舆情/
│   └── sources/
├── wiki/
│   ├── index.md
│   ├── overview.md
│   ├── logs/
│   ├── 策略/
│   ├── 股票/
│   ├── 模式/
│   ├── 概念/
│   ├── 错误/
│   ├── 人物/
│   ├── 查询/
│   ├── 总结/
│   └── 源文档/
├── data/
│   ├── facts/
│   └── brain/
└── .llm-wiki/
```

目录职责：

| 路径 | 角色 | 写入纪律 |
|---|---|---|
| `raw/**` | 原始资料层 | 只追加，不改写，不删除，不让 Agent 整理原文 |
| `wiki/**` | 正式知识层 | 由 LLM/Agent 维护，可审阅、可回滚 |
| `data/facts/**` | 时序事实层 | 记录订单、验证、价格、客户、政策等会变化的事实 |
| `data/brain/**` | 长期记忆层 | 记录纠错、偏好、预测、验证、guardrail |
| `.llm-wiki/**` | 运行产物层 | 放 dry-run、审计、eval、临时 staging 和报告 |

## 3. Raw Sources 原始资料层

`raw/**` 是证据层，原则是不可变。CLI 和外部 Agent 可以读取它，但不应该改写原文件。

推荐命名：

| 资料类型 | 示例 |
|---|---|
| 日复盘 | `raw/日复盘/YYYY-MM-DD-复盘.md` |
| 交割单 | `raw/交割单/YYYY-MM-DD-交割单.csv` |
| 截图 | `raw/截图/YYYY-MM-DD-股票名-描述.png` |
| 研报新闻 | `raw/研报新闻/YYYY-MM-DD-来源-标题.md` |
| 聊天舆情 | `raw/聊天舆情/YYYY-MM-DD.md` |
| 长文资料 | `raw/sources/YYYY-MM-DD-主题.md` |

如果有自动化数据源，建议统一落到 `raw/` 的独立子目录，再由摄入流程提炼到 `wiki/`。不要让自动化脚本直接改正式 wiki 页面。

## 4. Wiki 正式知识层

推荐页面类型：

| type | 目录 | 用途 |
|---|---|---|
| `策略` | `wiki/策略/` | 入场、出场、仓位、风控、适用环境 |
| `股票` | `wiki/股票/` | 个股档案、交易日志、消息面、当前理解 |
| `模式` | `wiki/模式/` | 市场阶段、题材生命周期、资金行为、交易模式 |
| `概念` | `wiki/概念/` | 产业链、题材、方法论、关键变量 |
| `错误` | `wiki/错误/` | 高频错误、心理根源、避免方法 |
| `人物` | `wiki/人物/` | 关键意见源、产业人物、交易风格影响 |
| `查询` | `wiki/查询/` | 高价值问答、deep research 归档 |
| `总结` | `wiki/总结/` | 日复盘、阶段总结、持仓追踪 |
| `源文档` | `wiki/源文档/` | 需要在 wiki 内引用的原文摘要或备份 |

根目录建议只保留：

- `wiki/index.md`：内容目录和快速导航。
- `wiki/overview.md`：当前主线、最近认知更新、核心风控原则。
- `wiki/logs/log-YYYY-MM-DD.md`：按日期追加操作记录。

## 5. Frontmatter 模板

所有正式 wiki 页面建议包含 YAML frontmatter：

```yaml
---
schema_version: 1
title: 页面标题
aliases: []
type: 概念
summary: ""
tags:
  - 标签1
related:
  - "[[概念/相关主题]]"
sources:
  - raw/研报新闻/YYYY-MM-DD-来源-标题.md
created: 2026-06-13 00:00:00
updated: 2026-06-13 00:00:00
last_reviewed: 2026-06-13 00:00:00
confidence: 中
status: 活跃
---
```

字段说明：

| 字段 | 建议 |
|---|---|
| `title` | 页面标题，尽量与文件名一致 |
| `aliases` | 搜索别名、简称、历史叫法 |
| `type` | 与目录对应 |
| `summary` | 一句话摘要，便于 index 和检索 |
| `tags` | 主题标签，不要把泛词滥用成标签 |
| `related` | 3-10 个最相关页面 |
| `sources` | 原始资料路径、日期、报告 ID 或 URL |
| `confidence` | `高 / 中 / 低` |
| `status` | `活跃 / 归档 / 迭代中` |

股票页可额外加：

```yaml
code: SZ000001
```

## 6. 页面模板

### 股票页面

```md
## 基本信息

## 当前理解

## 交易日志

| 日期 | 操作 | 价格 | 仓位 | 理由 | 结果 | 关联复盘 |
|---|---|---:|---:|---|---|---|

## 基本面 / 消息面

## 技术分析要点

## 风险与证伪条件

## 相关页面
```

### 策略页面

```md
## 策略定义

## 入场条件

## 出场条件

## 仓位管理

## 实战记录

## 胜率与盈亏比

## 适用市场环境

## 迭代记录

## 相关页面
```

### 概念页面

```md
## 概念定义

## 产业链结构 / 方法论框架

## 关键事实与催化

## 核心受益标的

## 验证记录

## 风险与证伪条件

## 相关页面
```

建议约束：

- 概念定义不超过 5 句话。
- 核心受益标的只列直接受益环节。
- 验证记录只写结论和链接，不重复粘贴整天盘面。

### 模式页面

```md
## 模式定义

## 识别条件

## 与相近模式的区别

## 操作原则

## 历史案例

## 胜率 / 盈亏比 / 适用环境

## 最新验证日期

## 相关页面
```

### 错误页面

```md
## 错误定义

## 心理根源

## 典型案例

## 如何避免

## 近期犯案记录

## 相关页面
```

### 查询归档页面

```md
## 原始问题

## 核心结论

## 详细分析

## 引用来源

## 反哺到的页面

## 相关页面
```

## 7. Ingest 摄入流程

摄入新资料时，建议遵循这个顺序：

1. 读取原始资料，确认资料类型、日期、来源和可信度。
2. 查找已有相关页面，优先更新，不急着新建。
3. 将当日盘面数据写入 `总结/YYYY-MM-DD-日复盘.md` 这类权威位置。
4. 将个股交易记录写入 `股票/股票名.md`。
5. 将策略迭代写入 `策略/策略名.md`。
6. 将市场结构和题材生命周期写入 `模式/`。
7. 将产业链、方法论和关键变量写入 `概念/`。
8. 将错误和反思写入 `错误/`。
9. 更新 `index.md`、`overview.md` 和 `wiki/logs/log-YYYY-MM-DD.md`。
10. 对会变化、会失效、会被后续来源替代的事实，写入 `data/facts/temporal_edges.jsonl`。

摄入前必须检查：

- 新建页面是否已有近义页面。
- 页面职责是否清楚。
- 原始证据是否保留在 `raw/**`。
- 是否需要记录事实强度、时间范围和证伪条件。
- 写入是否经过 dry-run 或人工审阅。

## 8. Query 查询流程

问答系统建议同时读取：

- `wiki/**`：正式知识。
- `raw/**`：原始证据。
- frontmatter / wikilinks：结构化图谱。
- `data/facts/**`：当前事实与历史反证。
- `data/brain/**`：长期纠错和偏好。
- 可选只读行情或业务数据库：只作为证据源，不写入凭据。

Ask Retrieval 和 Ingest Candidate Retrieval 要分开：

| 类型 | 目标 |
|---|---|
| Ask Retrieval | 为回答问题找最相关证据，可以降噪、重排、时间衰减 |
| Ingest Candidate Retrieval | 为写入找候选页面，要高召回、保守保留旧页面和 raw 线索 |

高质量回答应该包含：

- 结论。
- 证据链。
- 分歧或反证。
- 后续验证清单。
- 交易含义。
- 引用来源。

## 9. Lint 整理流程

建议每周小整理，每月大整理。

检查项：

| 项目 | 要做什么 |
|---|---|
| 矛盾发现 | 找出页面之间互相冲突的观点 |
| 模式提炼 | 从近期交易和资料里提炼重复出现的盈利/亏损场景 |
| 个股档案检查 | 找陈旧页面、重复股票页、不完整交易日志 |
| 策略有效性 | 更新胜率、适用环境和归档状态 |
| 孤儿页面 | 找没有入链或没有 index 入口的页面 |
| 概念合并 | 合并近义概念，拆分上下位关系 |
| 事实状态 | 检查 active facts 是否已过期、被替代或被证伪 |
| 进化史 | 记录关键顿悟和系统变化 |

## 10. 事实强度与时序事实

不是所有内容都需要写入 facts。适合写入 `data/facts/temporal_edges.jsonl` 的是：

- 订单、客户、产能、价格、交付、验证、政策、财报等有时间状态的事实。
- 可能会被后续来源替代或证伪的判断。
- 对交易决策影响较大的可验证事件。

示例字段：

```json
{
  "id": "deterministic_fact_id",
  "subject": "公司或概念",
  "predicate": "HAS_ORDER",
  "object": "订单或客户描述",
  "status": "active",
  "validAt": "2026-06-13",
  "source": "raw/研报新闻/YYYY-MM-DD-来源-标题.md",
  "evidence": "一句证据摘录或摘要",
  "confidence": "medium"
}
```

推荐状态：

| status | 含义 |
|---|---|
| `active` | 当前可用事实 |
| `superseded` | 已被后续事实替代 |
| `invalidated` | 已被证伪 |
| `expired` | 时间窗口已过 |
| `candidate` | 仅为候选，需人工复核 |

事实强度建议分层：

| 强度 | 来源 |
|---|---|
| Tier 1 | 公告、财报、监管文件、公司正式口径 |
| Tier 2 | 主流媒体、券商研报、会议纪要 |
| Tier 3 | 行业访谈、渠道反馈、公开舆情 |
| Tier 4 | 群聊传闻、单点观察、未验证推断 |

低强度来源可以进入候选或待验证，不应被写成确定结论。

## 11. 去重与页面职责边界

一条事实尽量只有一个权威位置：

| 信息类型 | 权威位置 | 其他页面怎么写 |
|---|---|---|
| 当日盘面数据 | `总结/YYYY-MM-DD-日复盘.md` | 只链接，不复制整段数据 |
| 个股交易记录 | `股票/股票名.md` | 只引用该股票页 |
| 概念定义 | `概念/概念名.md` | 只引用，不复制 |
| 模式识别条件 | `模式/模式名.md` | 只引用，不复制 |
| 舆情原文 | `raw/聊天舆情/YYYY-MM-DD.md` | wiki 只写提炼后的结论 |
| 会变化的事实 | `data/facts/temporal_edges.jsonl` | wiki 只解释含义和影响 |

新建页面前检查：

1. 搜索 `wiki/index.md`。
2. 搜索目标目录。
3. 检查 aliases、tags 和 related。
4. 如果已有页面覆盖 70% 以上含义，合并更新。
5. 如果需要新建，在页面里写清楚与相近页面的区别。

## 12. 外部 Agent 接入建议

外部软件可以把 CLI 当作子进程调用，但要尊重写入边界：

```sh
npm run codex:ingest -- ask \
  --query "最近有哪些结论被后续资料证伪？" \
  --project /path/to/wiki-project \
  --sources wiki,raw,graph,facts \
  --show-sources
```

写入链路建议固定为：

```text
prepare -> api-run -> finalize -> 人工审阅 -> apply --write
```

不要让外部 Agent 直接写：

- `raw/**`
- `wiki/index.md` 整页重写
- `wiki/overview.md` 整页重写
- 任意凭据或本地数据库配置

## 13. Obsidian / 本地浏览

可以用 Obsidian 打开 `/path/to/wiki-project/wiki/` 作为 vault：

- Graph View 看双链网络。
- Dataview 按 `type / tags / confidence / status` 查询页面。
- 定期查看孤儿页面和低置信度页面。
- 用人工编辑修正 LLM 归纳错误，再让下一次摄入吸收。

## 14. 最小可复制版本

如果只想快速开始，`schema.md` 可以先写成：

```md
# Schema

## Boundaries

- raw/** is immutable source evidence.
- wiki/** is the curated knowledge layer.
- data/facts/temporal_edges.jsonl stores temporal facts.
- ask is read-only.
- apply --write is the only official wiki write path.

## Page Types

- 策略 -> wiki/策略/
- 股票 -> wiki/股票/
- 模式 -> wiki/模式/
- 概念 -> wiki/概念/
- 错误 -> wiki/错误/
- 查询 -> wiki/查询/
- 总结 -> wiki/总结/

## Frontmatter

Every page should include title, type, tags, related, sources, created, updated, confidence, and status.

## Ingest

Prefer updating existing pages. Create new pages only after checking index, aliases, tags, and related pages.

## Query

Answer with conclusion, evidence, contradictions, validation checklist, implications, and citations.
```

从这个最小版本起步即可。随着资料变多，再逐步补充页面模板、predicate 词表、概念别名表和 lint 规则。
