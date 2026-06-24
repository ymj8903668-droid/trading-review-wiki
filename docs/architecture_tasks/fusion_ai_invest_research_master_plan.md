# trading-review-wiki-git 与 ai_invest_research 融合总设计文档

文档版本：1.2.1  
生成日期：2026-06-24  
基准状态：`CURRENT`；本文是架构说明，不是 Codex phase contract  
面向对象：GPT-5.5-pro 架构审查、Owner 决策与后续维护者  
当前阶段：设计冻结前后衔接文档  
执行边界：本文只说明融合目标与架构理由，不代表已经修改业务代码、接入外部账号或强制全链路运行。  
阶段治理：任何工程阶段必须依次经过 `EXECUTOR-CODEX -> MONITOR-GPT5.5 -> OWNER`；禁止 Codex 在一次委托中自动连续推进。  
路径一致性：工程 phase report / Monitor packet 只属于源码仓 `.planning/formal-research/`；`FORMAL_RUNTIME_ROOT` 只保存业务运行状态与可重建派生输出。  

## 0. 给 GPT-5.5-pro 的审查任务

请你以“本地投研知识系统与正式研究报告管控系统架构审查者”的身份审阅本文，重点判断：

1. 是否应该以 `trading-review-wiki-git` 为主系统，`ai_invest_research` 作为正式投研能力补充。
2. 本文提出的接口、目录、脚本级融合是否能兼顾 `trading-review-wiki-git` 作为外部拉取仓库的可更新性。
3. 是否清楚区分了 clue/navigation layer 与 formal evidence layer。
4. 是否遗漏了 `ai_invest_research` 中对正式投研报告至关重要的 evidence、source_targets、结构化季度指标、报告门禁、harness、monitor 能力。
5. 是否存在重复造轮子、双写事实、双写报告、把 Wiki 误当正式证据、或者把模型摘要当财务数据的风险。
6. 分阶段执行计划、修改范围、测试方案、监控提示词是否足够让后续 Codex 或其他执行者不跑偏。

本文不包含任何密钥、账号、cookie 或私有 API 凭证。


## 0A. 文档定位、阶段命名与规范优先级

本项目保留两份 canonical 文档：

| 文档 | 负责内容 | 是否可直接授权 Codex 执行 |
|---|---|---:|
| `fusion_ai_invest_research_master_plan.md` | 系统现状、融合目标、权威边界和架构理由 | 否 |
| `fusion_ai_invest_research_codex_master_execution_guide.md` | 可执行 phase、允许路径、命令、测试、停止条件和审批合同 | 是，但每次只能执行 Owner 明确批准的一个 phase |

阶段命名硬规则：

- 本文使用 `M0-M11` 表示**架构里程碑**；它们只表达能力演进，不是 `CURRENT_PHASE`；
- Codex 真实执行只使用执行手册定义的 `F0 / F1A / F1B / F2 / F3A / F3B / F4 ...`；
- 每次执行还必须有当前 `.planning/formal-research/phase-contracts/<PHASE>.json`；
- 带 `_v1.0`、`_v1.1` 等后缀的历史副本均为 `DEPRECATED`，不得用于生成新 contract；
- 如果本文与执行手册冲突，以更严格规则为准并阻断；只能通过 Owner 批准的 ADR 与新版 phase contract 消除冲突。

## 1. 一页结论

我的建议是：

```text
主系统：trading-review-wiki-git
补充系统：ai_invest_research

trading-review-wiki-git = 知识操作系统 / LLM-Wiki 工作台 / 多源检索与材料编译层
ai_invest_research = 正式投研控制面 / 证据门禁 / 报告分层 / 质量审计与监控层
```

不要反过来以 `ai_invest_research` 为主。原因：

- `trading-review-wiki-git` 已经具备用户操作面、CLI、Tauri/React 工作台、`raw/wiki/graph/facts/brain` 知识层、Deep Research、公司研究草稿和日常复盘闭环，更适合做长期知识入口。
- `ai_invest_research` 更像 formal research pipeline，强在 EvidenceContract、source_targets、结构化季度指标、Gate4、report manifest、reviewer/auto_repair、harness/monitor。它适合补规则和门禁，不适合取代 Wiki 工作台。
- `trading-review-wiki-git` 是外部拉取仓库，后续会更新。融合必须尽量用新增目录、适配器、包装脚本、配置和测试接入，避免大面积改上游核心文件。

因此推荐目标架构是：

```text
trading-review-wiki-git
  ├─ 原有能力：raw / wiki / graph / facts / brain / ask / smart-search / company-research
  ├─ 新增 formal research overlay
  │    ├─ formal evidence contract
  │    ├─ source_targets
  │    ├─ quarterly metrics preflight
  │    ├─ company -> industry -> theme report layers
  │    ├─ report manifest / evidence status panel
  │    └─ harness / monitor
  └─ ai_invest_research 作为参考实现和能力迁移来源
```

如果用户说“两者都要”，正确理解不是两套系统并列运行，而是：

- `trading-review-wiki-git` 继续负责收集、整理、检索、理解、复盘、Wiki 编译。
- `ai_invest_research` 的规则补成正式投研层，约束哪些内容可以进入公司报告、行业报告、题材报告。

## 2. 当前两套系统内容总览

### 2.1 trading-review-wiki-git 当前内容

项目定位：

- 面向交易复盘知识库的 Codex CLI 与本地 Wiki 工具集。
- 把 `raw` 原始资料、正式 `wiki`、图谱、长期记忆、结构化事实和行情 SQL 组织成一个可检索、可验证、可迭代的研究系统。

关键入口：

| 能力 | 入口 | 说明 |
|---|---|---|
| 本地检索 | `npm run codex:ingest -- search` | 不调用模型，只输出证据列表 |
| 智能检索 | `npm run codex:ingest -- smart-search` | LLM 做检索规划和证据重排，不生成最终结论 |
| 问答 | `npm run codex:ingest -- ask` | 生成带引用的六段式回答 |
| Wiki 摄入 | `prepare -> api-run -> finalize -> apply --write` | 从 raw 资料生成可审阅、可回滚的 Wiki 更新 |
| 公司研究 | `company-research --deep` | 生成公司研究底稿、模型和候选 Wiki 更新 |
| 日常闭环 | `daily-loop` | 盘前预测、盘后验证、自训练 |
| 行情验证 | `market-validate` | 对预测或主题做股价/量价验证 |
| 记忆 | `brain remember/status/resolve` | 记录纠错、偏好、预测、验证和 guardrail |
| 检索质量 | `ask eval` | 评估检索召回、相关性和来源覆盖 |
| Wiki 维护 | `hygiene audit/plan/apply` | 清理和维护 Wiki 质量 |
| Gangtise | `scripts/gangtise-meeting-clues-report.mjs` | 导出投研线索到 raw |

主要数据层：

| 数据层 | 路径 / 来源 | 角色 |
|---|---|---|
| 原始资料 | `raw/**` | 不可变原始资料，CLI 不直接改写 |
| 正式 Wiki | `wiki/**/*.md` | 已整理知识页，供检索和问答 |
| 图谱 | `.llm-wiki/graph.json` + wikilink | 有界关系扩展 |
| 时序事实 | `data/facts/*.jsonl` | 记录会变化、会证伪、会替代的事实 |
| 长期记忆 | `data/brain/*.jsonl` | 纠错、验证、偏好、预测、自训练 |
| 运行报告 | `.llm-wiki/**` | 摄入报告、公司研究底稿、eval、staging |
| 本地行情 SQL | PostgreSQL 私有配置 | 日线行情、量价验证 |
| 向量库 | LanceDB / embedding endpoint | 可选语义检索 |

当前外部知识获取渠道：

| 渠道 | 账号要求 | 用途 |
|---|---|---|
| CNInfo 巨潮 | 无账号，公开源 | 公司公告、年报、半年报、季报、投资者关系 |
| SSE 上交所 | 无账号，公开源 | 沪市公告兜底 |
| 东方财富 K 线 | 无账号，公开接口 | 盘后/盘中行情验证 |
| 腾讯 K 线 | 无账号，公开接口 | 行情验证兜底 |
| Tushare | 需要 `TUSHARE_TOKEN` | 财务表、估值快照、公司基础信息、预告/快报 |
| Tavily | 需要 `TAVILY_API_KEY` | 网页搜索、技术能力、同业对比、供应链、客户验证 |
| Codex / LLM provider | Codex 登录态或 API Key | 摘要、重排、Wiki 编译、公司研究草稿 |
| 本地 PostgreSQL 股票库 | 私有配置 / Keychain | 稳定日线和历史行情验证 |
| OpenClaw | 外部本地工具 | 盘后复盘写入 `raw/openclaw数据` |
| Gangtise 线索库 | 私有 DB 配置 | 会议线索导出到 `raw/研报新闻/投研线索` |

当前边界：

- `raw/**` 是原始资料，只追加，不改写。
- `search / smart-search / ask` 只读。
- `company-research` 只写 `.llm-wiki/company-research/`，不直接写正式 Wiki。
- `apply --write` 是正式 Wiki 写入入口。
- 当前 `facts_jsonl` 可表达时间状态，但 typed formal evidence provenance、source artifact、claim binding 和报告门禁还不够硬。

### 2.2 ai_invest_research 当前内容

项目定位：

- 面向 AI 投研的正式研究报告 pipeline。
- 已完成从旧 `generic_*` 报告路径向 `research_report_layers` 分层框架迁移。
- 强调证据准入、source target、结构化季度指标、头部公司时效、report manifest、harness 和 monitor。

核心正式路径：

```text
wiki_context_router
  -> company_research_layer
  -> industry_value_layer
  -> theme_comparison_layer
```

关键能力：

| 能力 | 主要内容 | 对融合的价值 |
|---|---|---|
| MVP / Spec / Harness / Monitor | 阶段制度、备份制度、防跑偏规则、监控包 | 防止后续执行者乱扩范围 |
| EvidenceContract | typed evidence 必须满足共同 provenance 与类型专属字段 | 避免 Wiki / 搜索摘要变正式证据，也避免结构化数据伪造 quote |
| LLM-Wiki 边界 | Wiki 是 context/navigation，不是 evidence store | 与 `trading-review-wiki-git` 的 Wiki 定位互补 |
| source_targets | 缺源、缺指标、缺目标价、缺证据的队列 | 把缺口显式化 |
| structured_metrics_gap_audit | 收入、归母净利、经营现金流、EPS 缺口阻断 | 防止从 prose 猜财务指标 |
| research_report_layers | 公司层、行业层、题材层顺序 | 正式报告结构 |
| head_company_freshness_preflight | 检查 Broadcom/NVIDIA 等头部公司事件是否入库 | 防止最新财报缺失 |
| head_company_sub_signal_decomposition | 拆总量信号和子方向信号 | 防止“整体放缓”掩盖“AI Networking 加速” |
| report manifest | 每份报告的输入、输出、policy、证据状态 | 可追溯 |
| evidence status panel | 正文展示证据数量、线索数量、缺口、阻断原因 | 可审阅 |
| report_reviewer | 审查报告证据、时效、Gate4、Wiki misuse | 质量闭环 |
| report_auto_repair | 只修结构/路由缺口，不补事实 | 安全修复 |
| pipeline_registry | 正式入口、禁用旧路径、E2E checks | 控制面 |
| schedules depends_on | 显式依赖关系 | 编排层不乱序 |
| pytest/unittest/harness | 回归测试和静态漂移扫描 | 防回退 |

Formal evidence 规则采用 typed evidence，并保留旧“四字段规则”的可追溯精神：

| Evidence 类型 | 共同必需字段 | 类型专属必需字段 |
|---|---|---|
| `document_quote` | `source_url`、`document_id`、`fetch_time`、不可变 `source_artifact_id` | `evidence_quote`、原文 locator、quote match |
| `structured_record` | `source_url`、`document_id`、`fetch_time`、不可变 `source_artifact_id` | `record_locator`、`raw_value`、字段名、期间、单位/币种、record key |
| `market_observation` | `source_url`、`document_id`、`fetch_time`、不可变 `source_artifact_id` | request fingerprint、市场/标的、时间区间、频率、字段、复权/时区、原始响应 artifact |

规则：

- `document_quote` 必须有可在原始 artifact 中确定性定位的 `evidence_quote`。
- `structured_record` 与 `market_observation` 不要求、也禁止伪造自然语言 `evidence_quote`。
- 四字段或 typed 字段只是最低 provenance，不是充分准入条件；仍需来源资格、artifact hash、locator 和确定性 admission decision。

线索层：

```text
Wiki / LLM-Wiki / ima / 搜索结果 / 公众号 / public_web_summary / Tavily snippet
```

这些只能用于：

- 找方向。
- 找缺口。
- 生成检索任务。
- 建 source_targets。
- 导航到原始来源。

不能直接用于：

- 正式财务事实。
- 订单/客户关系事实。
- 目标价。
- 投资结论。
- A 股公司排序。

## 3. 主系统选择建议

### 3.1 为什么不以 ai_invest_research 为主

`ai_invest_research` 更适合做严肃 pipeline，但不适合作为主知识工作台：

- 缺少 `trading-review-wiki-git` 已经具备的成熟 raw/wiki/graph/brain 操作面。
- 缺少面向用户日常使用的 Tauri/React 工作台、剪藏、交割单、复盘、图谱互动。
- 已经形成的 formal pipeline 适合被抽象成 governance layer，而不是承载所有知识收集。

### 3.2 为什么以 trading-review-wiki-git 为主

`trading-review-wiki-git` 已经天然符合你的使用习惯：

- 本地 Wiki 长期积累。
- 原始资料和正式知识分层。
- 多源 RAG。
- 图谱扩展。
- Deep Research。
- 公司研究草稿。
- 交易复盘、脑记忆、验证和自训练。

它缺的是：

- typed formal evidence、不可变 source artifact、locator 与确定性 admission 约束。
- 投研报告生成前置门禁。
- 公司/行业/题材三层正式报告。
- target price source map。
- source_targets 状态机。
- report manifest / evidence panel。
- monitor 审查制度。

这些正是 `ai_invest_research` 可以补的。

### 3.3 外部拉取仓库的融合原则

由于 `trading-review-wiki-git` 是外部拉取仓库，后续会更新，融合必须遵循：

1. 优先新增，不改核心。
2. 优先 adapter，不 fork 核心逻辑。
3. 优先包装 CLI，不重写 CLI。
4. Overlay 代码、测试与工程治理材料分别落在 `formal-research/`、`tests/formal-research/` 与 `.planning/formal-research/`；实际 formal pipeline 的 canonical state 与派生输出只写入仓外 `FORMAL_RUNTIME_ROOT`，不得污染 `raw/**`、正式 `wiki/**` 或源码仓 `.llm-wiki/**`。
5. 所有上游文件改动必须集中、少量、可回滚。
6. 后续若必须改核心，应先生成 Scope Expansion Request。

## 4. 融合目标架构

### 4.1 分层图

```text
                  用户 / Codex / GPT-5.5-pro
                            |
                            v
                  trading-review-wiki-git
                            |
          +-----------------+-----------------+
          |                                   |
          v                                   v
  Knowledge Workspace                  Formal Research Overlay
  raw/wiki/graph/facts/brain            evidence/source_targets/reports
          |                                   |
          v                                   v
  search/smart-search/ask               company -> industry -> theme
          |                                   |
          +-----------------+-----------------+
                            |
                            v
                  report manifest / evidence panel
                            |
                            v
                  reviewer / auto_repair / harness / monitor
```

### 4.2 目录建议

为了减少上游冲突，建议新增目录采用低侵入命名：

```text
trading-review-wiki-git/
├── docs/
│   └── architecture_tasks/
│       └── fusion_ai_invest_research_master_plan.md
├── formal-research/
│   ├── README.md
│   ├── specs/
│   │   ├── evidence_contract.md
│   │   ├── clue_boundary.md
│   │   ├── source_targets.md
│   │   ├── report_layers.md
│   │   └── monitor_protocol.md
│   ├── adapters/
│   │   ├── trading_wiki_retrieval_adapter.mjs
│   │   ├── company_research_pack_adapter.mjs
│   │   ├── cninfo_sse_evidence_adapter.mjs
│   │   ├── tushare_metrics_adapter.mjs
│   │   └── tavily_clue_adapter.mjs
│   ├── schemas/
│   │   ├── evidence_record.schema.json
│   │   ├── source_target.schema.json
│   │   ├── quarterly_metric.schema.json
│   │   ├── report_manifest.schema.json
│   │   └── evidence_status_panel.schema.json
│   ├── pipelines/
│   │   ├── source_targets_sweep.mjs
│   │   ├── structured_metrics_gap_audit.mjs
│   │   ├── research_report_layers.mjs
│   │   ├── report_reviewer.mjs
│   │   └── report_auto_repair.mjs
│   └── harness/
│       ├── run_all_checks.mjs
│       ├── check_evidence_contract.mjs
│       ├── check_no_fake_formal_evidence.mjs
│       ├── check_report_manifest.mjs
│       ├── check_source_targets_state.mjs
│       └── check_diff_scope.mjs
├── tests/
│   └── formal-research/
│       ├── evidence-contract.test.mjs
│       ├── source-targets.test.mjs
│       ├── structured-metrics-preflight.test.mjs
│       ├── research-report-layers.test.mjs
│       ├── report-manifest-panel.test.mjs
│       └── e2e-minimal.test.mjs
```

v1.2 不再要求为了 formal overlay 立即迁移整个现有知识库，而是采用三根目录模型：

```text
TRADING_REPO_ROOT
  = 上游源码 checkout；保存 overlay 代码、测试、fixture 和工程治理记录

KNOWLEDGE_PROJECT_ROOT
  = 现有 raw/wiki/facts/brain/company-research staging 的知识项目
  = 为兼容当前使用方式，可以暂时等于 TRADING_REPO_ROOT
  = formal overlay 默认只读

FORMAL_RUNTIME_ROOT
  = formal canonical state 与 formal 派生输出的唯一写入根
  = live 模式必须位于 TRADING_REPO_ROOT 之外
```

因此不要求 F0 迁移现有 `raw/**`、`wiki/**`、`data/facts/**` 或 `data/brain/**`。真正必须物理隔离的是 formal 写入根，而不是所有知识输入。推荐布局：

```text
<formal-runtime-root>/
├── data/formal_research/                  # canonical state，唯一 writer
│   ├── blobs/
│   ├── artifacts/
│   ├── events/
│   ├── views/
│   └── locks/
└── .llm-wiki/formal-research/             # 可重建的业务运行派生输出
    ├── runs/
    ├── reports/
    ├── runtime-reviews/                    # 运行级审查，不是工程 phase 审批材料
    └── run-manifests/
```

工程治理材料不属于 runtime output，必须固定写入源码仓的治理目录：

```text
TRADING_REPO_ROOT/.planning/formal-research/
├── phase-contracts/
├── phase-reports/
├── monitor-packets/
├── approvals/
└── manifests/
```

`phase-reports/`、`monitor-packets/` 与 approval receipt 只描述代码阶段执行和放行，不得写入 `FORMAL_RUNTIME_ROOT`；`runtime-reviews/` 只审查某次业务 pipeline run，不得被当作 Monitor 对工程 phase 的批准。

边界规则：

- 当 `KNOWLEDGE_PROJECT_ROOT == TRADING_REPO_ROOT` 时，overlay 仍只读取既有知识和 staging，不把 formal state 写回仓库；
- `FORMAL_RUNTIME_ROOT` 可以等于 `KNOWLEDGE_PROJECT_ROOT`，但前提是知识项目本身位于源码仓外；
- fixture 可以留在源码仓，真实 formal 数据不可以；
- 将整个知识项目迁出源码仓可以以后单独做，不是首轮融合的前置条件。

### 4.3 哪些东西迁入，哪些不迁入

| ai_invest_research 能力 | 迁入方式 | 是否直接迁代码 |
|---|---|---|
| EvidenceContract | 迁成 spec + schema + harness + runtime validator | 先不直接迁 Python，优先 JS/MJS 适配 |
| LLM-Wiki clue boundary | 迁成 spec + prompt guard + static check | 可以迁测试思想 |
| source_targets 状态机 | 迁成 JSONL schema + resolver state rules | 迁规则，不直接复制存储 |
| structured_metrics_gap_audit | 迁成 preflight pipeline | 可以参考测试和字段 |
| research_report_layers | 迁成 formal report overlay pipeline | 迁架构，不复制旧 renderer |
| report manifest/panel | 迁成 JSON schema + markdown section renderer | 可迁字段契约 |
| report_reviewer | 迁成 report review checker | 可迁检查项 |
| report_auto_repair | 迁成 safe repair rules | 不允许补事实 |
| pipeline_registry/schedules | 迁成 overlay registry + healthcheck | 不强制上游 runtime DAG |
| harness/monitor | 迁成 `formal-research/harness` | 可迁大部分思路 |

不建议迁入：

- `ai_invest_research` 全量 `src/`。
- 旧 `generic_*` 兼容路径。
- 与 `trading-review-wiki-git` 已有 CNInfo/Tushare/Tavily/行情拉取重复的 collector。
- 任何把 Wiki 直接升级为 formal evidence 的路径。

## 5. 数据流设计

### 5.1 知识获取流

```text
外部源 / 人工资料
  -> raw/**
  -> trading-review search / smart-search / ask
  -> Wiki 编译 / Temporal Facts / Brain
  -> formal research overlay 读取候选线索
  -> source_targets
  -> 原始来源回溯
  -> EvidenceContract validator
  -> formal evidence ledger
```

关键规则：

- `raw/**` 保持不可变。
- `wiki/**` 可作为长期知识索引，但不是 formal evidence。
- Tavily 搜索结果只进入 clue，不进入 formal evidence。
- CNInfo/SSE PDF、交易所公告、公司 IR、SEC 文件、可追溯研报、Tushare 结构化数据可以成为 evidence candidate，但必须先保存不可变 source artifact，并满足对应 evidence 类型的 provenance、locator、hash 与 admission policy。

### 5.2 公司研究流

```text
company-research --deep
  -> evidence-pack.json / evidence-ledger.json / financials.json / company-report.md
  -> formal adapter 生成 typed evidence candidates 与 source artifact references
  -> quarterly metrics preflight
  -> company_master_report
  -> company layer manifest
```

必须检查：

- 是否有最新季报/半年报/年报。
- 是否有 revenue、net_profit_parent、operating_cash_flow、basic_eps。
- 是否有订单、客户、毛利、现金流、估值、目标价来源。
- 缺口进入 source_targets。

### 5.3 行业研究流

```text
company_master_reports
  + formal_industry_evidence
  + global_head_company_signals
  + market confirmation
  -> industry_value_report
```

行业层输出：

- 高价值点。
- 未来方向。
- 核心趋势。
- 头部公司总量信号与分项信号拆解。
- A 股承接 gate。

特别规则：

- 不从公司报告 prose 猜现金流、EPS、利润弹性。
- Broadcom/NVIDIA/Marvell/Arista 等全球头部信号只能验证产业方向。
- A 股排序仍需自身订单、利润、现金流、客户认证、公告证据。

### 5.4 题材研究流

```text
company layer
  + industry layer
  + Wiki navigation hints
  + Gate4
  + source_targets
  + valuation/consensus/broker assumptions
  -> theme_comparison_report
```

题材层输出：

- 跨公司暴露度。
- 兑现节奏。
- 财务弹性。
- 估值位置。
- 证据强弱。
- 证伪条件。
- target_price_source_map。

禁止：

- 无来源目标价。
- 只靠 Wiki 生成题材结论。
- Gate4 缺失仍强行通过。

## 6. 外部账号与数据源策略

Owner 已允许未来使用外部源，账号后续提供。

| 数据源 | 当前策略 | 账号/权限 |
|---|---|---|
| CNInfo | 默认启用，公开源 | 不需要账号 |
| SSE | 默认启用，公开源 | 不需要账号 |
| 东方财富 | 公开 K 线兜底 | 不需要账号 |
| 腾讯 | 公开 K 线兜底 | 不需要账号 |
| Tushare | 用于结构化财务/估值；无 token 时降级为 missing_config | 需要 `TUSHARE_TOKEN` |
| Tavily | 用于网页线索；结果只为 clue | 需要 `TAVILY_API_KEY` |
| Codex / OpenAI | 用于 LLM 编译、重排、总结 | Codex 登录态或 API key |
| 本地股票 SQL | 用于稳定行情验证 | 私有 PG 配置 / Keychain |

密钥处理原则：

- 不让 Owner 在聊天里明文粘贴。
- 使用环境变量或 Keychain。
- 检查时只输出 configured/missing，不打印值。
- 所有 monitor packet 不记录密钥。

首轮 MVP 采用 **fixture-first**：F0-F5 不依赖新外部账号，先用 fixtures、已有 company-research 产物和本地 filing artifacts 验证 formal overlay；公共/授权外部源 adapters 在执行手册的 F3B 中实现，固定放在 F5 后、F6 前。F3B 默认离线测试；live network 需要单独 phase contract 和 Owner 授权。

## 7. 架构里程碑（非执行 Phase）

本节只描述能力演进，不能直接交给 Codex 作为执行授权。`CURRENT_PHASE`、允许路径、命令、测试和停止条件只以执行手册及 machine-readable phase contract 为准。

| 架构里程碑 | 能力目标 | 对应执行手册 phase（参考映射） |
|---|---|---|
| M0 | 基线、仓库发现、根目录拓扑、Owner/Monitor 治理冻结 | F0 |
| M1 | specs、typed schemas、runtime flags、scope/approval guards | F1A |
| M2 | deterministic evidence admission、artifact hash、quote match、负向测试 | F1B |
| M3 | canonical single writer、SourceTarget 状态机、幂等与恢复 | F2 |
| M4 | 读取上游 company-research artifacts、季度指标语义化 | F3A |
| M5 | company vertical slice、manifest、evidence panel、只读 reviewer | F4 |
| M6 | fixture/已有本地 artifact 的早期公司试点 | F5 |
| M7 | CNInfo/SSE/Eastmoney/Tencent/Tushare/Tavily adapters；fixture-first | F3B（固定在 F5 后、F6 前） |
| M8 | industry layer、头部公司时效与分项信号 | F6 |
| M9 | theme layer、Gate4、target-price policy | F7 |
| M10 | registry、完整 E2E、上游兼容回归 | F8 |
| M11 | safe auto repair；可选上游 CLI/schedules 集成 | F9；F10 单独批准 |

里程碑不等于执行完成。例如“M7 已设计”不能被解释成 F3B adapter 已实现；只有相应 phase 的真实 diff、测试、Monitor PASS 和 Owner 放行才有效。

基准执行顺序由执行手册固定为：

```text
F0 -> F1A -> F1B -> F2 -> F3A -> F4 -> F5 -> F3B -> F6 -> F7 -> F8 -> F9
                                                          \
                                                           -> F10（可选）
```

任何改变顺序、启用网络或扩大上游核心修改范围，都必须更新 ADR 和 phase contract，不能只改本文。

## 8. 修改原则

### 8.1 最小修改优先级

优先级从高到低：

1. 新增文档。
2. 新增 overlay 目录。
3. 新增 adapter。
4. 新增 harness。
5. 新增测试。
6. 包装现有 CLI。
7. 少量修改 CLI 分发。
8. 最后才考虑修改核心 `codex-ingest-lib.mjs`。

### 8.2 推荐的第一批代码修改

第一批不应碰业务核心，只新增：

```text
formal-research/README.md
formal-research/specs/evidence_contract.md
formal-research/specs/clue_boundary.md
formal-research/schemas/evidence_record.schema.json
formal-research/harness/check_evidence_contract.mjs
formal-research/harness/check_no_fake_formal_evidence.mjs
formal-research/harness/run_all_checks.mjs
tests/formal-research/evidence-contract.test.mjs
```

### 8.3 暂不修改

```text
scripts/codex-ingest-lib.mjs
scripts/codex-ingest.mjs
src/lib/search.ts
src/lib/deep-research.ts
src/lib/web-search.ts
package.json
```

若后续需要把 overlay 命令接入 `npm run codex:ingest`，应单独开阶段。

## 9. 测试方案

### 9.1 trading-review-wiki-git 原有测试

本文只定义测试类别，不固定具体命令。F0 必须从真实 `package.json` 和仓库文档发现 test/build 命令，并写入 phase contract；后续阶段只执行被发现且适用于当前改动的真实命令。

```text
<discovered test command>
<discovered build command, only when applicable>
```

命令未发现或环境不可用时必须写 `NOT_RUN`/真实失败原因，不得猜成 `npm test -- --run`，也不得声称通过。

### 9.2 formal-research overlay 测试

执行手册会按 phase 逐步建立 harness。以下是目标形态示例，不是 F0 的执行命令：

```bash
node formal-research/harness/run_all_checks.mjs --phase <PHASE>
node --test tests/formal-research/*.test.mjs
```

检查项：

- EvidenceContract。
- clue boundary。
- source_targets 状态机。
- structured metrics preflight。
- report manifest。
- evidence status panel。
- target price source rule。
- head company sub-signal decomposition。
- no fake formal evidence。

### 9.3 E2E 测试

使用临时 fixture project：

```text
test-data/formal-research-fixtures/minimal-wiki-project/
├── raw/
├── wiki/
├── data/facts/
├── data/brain/
└── .llm-wiki/company-research/
```

测试场景：

1. Wiki-only claim 不得进入 formal evidence。
2. Tavily-only result 不得进入 formal evidence。
3. CNInfo PDF 已保存不可变 artifact、quote 可定位且通过 admission policy 时，才可成为 `document_quote` evidence。
4. 缺 EPS 时 source_targets 包含 `fill_quarterly_metrics`。
5. 缺目标价来源时 theme report blocked。
6. Broadcom 总量放缓但 AI Networking 加速时行业报告必须分项拆解。
7. report_auto_repair 不补事实，只转 source_targets。

### 9.4 静态漂移扫描

需要 `rg` 检查：

```bash
rg "wiki_is_evidence:\\s*true" .
rg "target price|目标价" formal-research tests
rg "Tavily|web_search|search_result" formal-research tests
rg "FULL_PIPELINE_ENFORCED=true|RUNTIME_DAG_ENFORCED=true" .
```

目标：

- 不把 clue 写成 formal。
- 不无来源目标价。
- 不误称 full pipeline 已经完成。

## 10. 监控与审查制度

工程 phase 审查材料与业务运行输出必须分开：

```text
TRADING_REPO_ROOT/.planning/formal-research/phase-reports/<phase>.md
TRADING_REPO_ROOT/.planning/formal-research/monitor-packets/<phase>_monitor_packet.md
TRADING_REPO_ROOT/.planning/formal-research/manifests/current_diff_manifest.json
```

实际 formal pipeline 的报告、run manifest 和 runtime review 写入：

```text
FORMAL_RUNTIME_ROOT/.llm-wiki/formal-research/**
```

不得使用 `formal-research/.codex_monitor/` 建立第三套状态；approval receipt 的 packet hash 只指向 `.planning` 中的工程 Monitor packet。

### 10.1 执行者每次完成后必须附带监控提示词

提示词模板：

```text
你是 MONITOR-GPT5.5。

请审查 EXECUTOR-CODEX 的 <PHASE_ID> 执行结果。

当前阶段：<PHASE_NAME>。
当前只允许处理：<ALLOWED_SCOPE>。
当前禁止处理：<FORBIDDEN_SCOPE>。
不允许新增功能，除非本阶段明确允许。
不允许把 Wiki、Tavily、搜索结果、公众号、LLM 摘要作为 formal evidence。
不允许自动填数、模型猜数、无来源目标价。

请重点检查：
1. 是否只执行当前阶段。
2. 是否修改了禁止范围。
3. 是否保持 trading-review-wiki-git 上游可更新性。
4. 是否按 typed evidence 强制 provenance：document_quote 必须有 quote；structured_record/market_observation 必须有类型专属 locator/raw fields，且不得伪造 quote。
5. 是否把 clue/navigation layer 误写为 formal evidence。
6. 是否生成或更新 source_targets，而不是编造缺失事实。
7. 是否保持 RUNTIME_DAG_ENFORCED=false / FULL_PIPELINE_ENFORCED=false，除非真实实现并测试。
8. 是否运行本阶段要求的 npm test、build、harness、rg 静态扫描。
9. 是否存在未运行却声称通过。

请按以下格式输出：

# 监控者审查结论

## 1. 总体结论
- Verdict: PASS / NEEDS_FIX / BLOCK
- 是否建议 Owner 批准下一阶段：是 / 否

## 2. 范围检查
- 实际修改文件：
- 是否越权：
- 是否修改上游核心文件：

## 3. Evidence / Clue 边界
- typed evidence 与旧四字段兼容口径是否正确：
- clue 是否被误升格：
- target price 是否有来源：

## 4. 测试与 Harness
- npm test：
- npm run build：
- harness：
- rg 静态扫描：
- 是否有未运行却声称通过：

## 5. 必须修正的问题
### P0
- ...
### P1
- ...
### P2
- ...

## 6. 给 Owner 的建议
- 是否建议 Owner 批准进入下一阶段：
- 下一阶段建议：
```

## 11. 风险清单

### P0 风险

- 把 Wiki 或 Tavily 摘要当 formal evidence。
- 从 prose 中猜财务指标。
- 无来源目标价。
- 直接大改 `codex-ingest-lib.mjs` 导致上游更新冲突。
- 两套 source target / evidence ledger 并行写入，事实状态分裂。

### P1 风险

- report manifest 字段不统一。
- company report 与 industry report 事实重复但来源不同。
- Tushare 缺 token 时被误判为 no_source_found。
- head company signal 只看总量、不看分项。
- auto repair 越权补事实。

### P2 风险

- overlay 目录长期和上游 CLI 脱节。
- harness 只做 skeleton，不做真实 E2E。
- KNOWLEDGE_PROJECT_ROOT、FORMAL_RUNTIME_ROOT 与源码仓的读写边界不清。
- 未来引入更多数据源后配置膨胀。

## 12. 最小 MVP 验收

融合 MVP 不要求全自动、不要求全市场、不要求全量公司。它只要求：

1. 能读取 `trading-review-wiki-git` 的 `company-research --deep` 产物。
2. 能把其中可追溯来源转换成 formal evidence 候选。
3. 能拒绝 Wiki/Tavily/search-only 事实。
4. 能发现缺季度指标并写入 source_targets。
5. 能生成一份 company master report。
6. 能基于 2-3 家公司生成一份 industry value report。
7. 能生成一份 theme comparison blocked 或 pass 报告。
8. 每份报告有 manifest 和 evidence status panel。
9. reviewer 能发现至少 5 类问题。
10. auto_repair 不补事实，只修结构和转 source_targets。

## 13. 建议下一步

v1.2.1 的下一步不是代码迁移，而是先按 `DOCUMENT_LANDING_RUNBOOK.md` 完成一次**文档落地（repository bootstrap）**，再由 Owner 单独授权 F0。文档落地不是 `F*` phase，不得生成 phase report、Monitor packet、approval receipt，也不得被表述为 F0 已开始或完成：

1. 依据 `DOCUMENT_LANDING_RUNBOOK.md`，将两份 v1.2.1 canonical 文档复制到以下路径：

```text
trading-review-wiki-git/docs/architecture_tasks/fusion_ai_invest_research_master_plan.md
trading-review-wiki-git/docs/architecture_tasks/fusion_ai_invest_research_codex_master_execution_guide.md
```

2. 在同目录 `README.md` 声明 v1.0/v1.1 为 `DEPRECATED`、未修正路径歧义的 v1.2 为 `SUPERSEDED`，均不得据此生成新的 phase contract；
3. Owner 只授权 `CURRENT_PHASE=F0`，`network_allowed=false`；
4. F0 只做 baseline、repository inventory、root topology、ADR、F1A draft contract 和 monitor packet；不得修改业务代码、不得迁移 raw/wiki/data、不得创建 F0-to-F1A approval receipt；
5. Executor 在 `READY_FOR_MONITOR` 停止；Monitor 审查明确 Head SHA；Owner 再决定是否批准下一次独立委托执行 F1A。

最终规则：

```text
架构理由：master_plan v1.2.1
执行合同：execution_guide v1.2.1
实际授权：当前 phase contract + Monitor PASS + Owner 明确批准
首次允许执行：F0 only
```
