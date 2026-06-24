# trading-review-wiki-git 与 ai_invest_research 融合总设计文档

生成日期：2026-06-23  
面向对象：GPT-5.5-pro 架构审查  
当前阶段：设计文档阶段  
执行边界：本文只提出融合方案，不代表已经修改业务代码、接入外部账号或强制全链路运行。  

## 0. 给 GPT-5.5-pro 的审查任务

请你以“本地投研知识系统与正式研究报告管控系统架构审查者”的身份审阅本文，重点判断：

1. 是否应该以 `trading-review-wiki-git` 为主系统，`ai_invest_research` 作为正式投研能力补充。
2. 本文提出的接口、目录、脚本级融合是否能兼顾 `trading-review-wiki-git` 作为外部拉取仓库的可更新性。
3. 是否清楚区分了 clue/navigation layer 与 formal evidence layer。
4. 是否遗漏了 `ai_invest_research` 中对正式投研报告至关重要的 evidence、source_targets、结构化季度指标、报告门禁、harness、monitor 能力。
5. 是否存在重复造轮子、双写事实、双写报告、把 Wiki 误当正式证据、或者把模型摘要当财务数据的风险。
6. 分阶段执行计划、修改范围、测试方案、监控提示词是否足够让后续 Codex 或其他执行者不跑偏。

本文不包含任何密钥、账号、cookie 或私有 API 凭证。

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
- 当前 `facts_jsonl` 可表达时间状态，但 formal evidence 四字段和报告门禁还不够硬。

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
| EvidenceContract | formal evidence 必须有四字段 | 避免 Wiki / 搜索摘要变正式证据 |
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

Formal evidence 规则：

```text
source_url
document_id
evidence_quote
fetch_time
```

缺任一字段不得进入 formal evidence。

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

- formal evidence 四字段硬约束。
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
4. 优先在 `.llm-wiki/formal-research/` 或新增 overlay 目录落产物，不污染 `raw/**` 和正式 `wiki/**`。
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

运行产物建议写入 live wiki project，而不是源码仓库：

```text
<wiki-project>/
├── .llm-wiki/
│   ├── company-research/
│   ├── formal-research/
│   │   ├── evidence-ledger/
│   │   ├── source-targets/
│   │   ├── quarterly-metrics/
│   │   ├── report-manifests/
│   │   ├── report-reviews/
│   │   ├── phase-reports/
│   │   └── monitor-packets/
│   └── codex-ingest/
├── data/
│   ├── facts/
│   ├── brain/
│   └── formal_research/
│       ├── source_targets.jsonl
│       ├── evidence_ledger.jsonl
│       ├── quarterly_metrics.jsonl
│       └── report_registry.json
└── wiki/
```

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
- CNInfo/SSE PDF、交易所公告、公司 IR、SEC 文件、可追溯研报、Tushare 结构化数据可以作为 formal evidence 候选，但仍要生成四字段。

### 5.2 公司研究流

```text
company-research --deep
  -> evidence-pack.json / evidence-ledger.json / financials.json / company-report.md
  -> formal adapter 标准化四字段
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

## 7. 分阶段执行计划

### Phase F0：设计冻结与边界确认

目标：

- 审查本文。
- 确认主系统为 `trading-review-wiki-git`。
- 确认只做 overlay，不大改核心。

允许修改：

- `docs/architecture_tasks/`
- `.planning/`

禁止修改：

- `src/`
- `scripts/codex-ingest-lib.mjs`
- `package.json`
- `raw/**`
- `wiki/**`

测试：

- Markdown 链接/路径检查。
- 人工审查。

完成标志：

- GPT-5.5-pro 审查 PASS。
- Owner 确认进入 Phase F1。

### Phase F1：formal-research overlay 脚手架

目标：

- 新增 `formal-research/`。
- 建立 README、specs、schemas、harness skeleton。
- 不接入真实数据，不改核心 CLI。

允许新增：

- `formal-research/README.md`
- `formal-research/specs/*.md`
- `formal-research/schemas/*.json`
- `formal-research/harness/*.mjs`
- `tests/formal-research/*.test.mjs`

测试：

```bash
npm test -- --run
node formal-research/harness/run_all_checks.mjs
```

诚实标志：

```text
FORMAL_RESEARCH_OVERLAY_DECLARED=true
FORMAL_RESEARCH_RUNTIME_ENFORCED=false
FULL_PIPELINE_ENFORCED=false
```

### Phase F2：EvidenceContract 与 clue boundary

目标：

- 把 formal evidence 四字段固化成 schema 和 validator。
- 检查 Wiki、Tavily、search snippet、LLM summary 不得作为 formal evidence。

新增/修改：

- `formal-research/schemas/evidence_record.schema.json`
- `formal-research/adapters/evidence_contract_validator.mjs`
- `formal-research/harness/check_evidence_contract.mjs`
- `formal-research/harness/check_no_fake_formal_evidence.mjs`
- `tests/formal-research/evidence-contract.test.mjs`

测试点：

- 缺 `source_url` 阻断。
- 缺 `document_id` 阻断。
- 缺 `evidence_quote` 阻断。
- 缺 `fetch_time` 阻断。
- `wiki_is_evidence=true` 阻断。
- Tavily snippet 只能 clue。
- `company-research` 产物如果没有四字段，只能 staging，不是 formal。

### Phase F3：source_targets 队列

目标：

- 把缺源、缺指标、缺估值、缺目标价、缺订单、缺客户关系变成明确队列。

新增/修改：

- `formal-research/schemas/source_target.schema.json`
- `formal-research/pipelines/source_targets_sweep.mjs`
- `formal-research/harness/check_source_targets_state.mjs`
- `tests/formal-research/source-targets.test.mjs`

状态机：

```text
new
candidate_kept
retry_later
credential_needed
no_source_found
waiting_for_filing
waiting_for_trading_day
verified
rejected
```

规则：

- terminal 状态不得被低质量线索覆盖。
- `credential_needed` 不能伪装成 `no_source_found`。
- Tavily 找到 URL 不等于 verified，必须回到原始来源。

### Phase F4：结构化季度指标前置门禁

目标：

- 公司报告生成前，检查核心季度指标是否齐全。

核心指标：

```text
revenue
net_profit_parent
operating_cash_flow
basic_eps
```

新增/修改：

- `formal-research/schemas/quarterly_metric.schema.json`
- `formal-research/pipelines/structured_metrics_gap_audit.mjs`
- `tests/formal-research/structured-metrics-preflight.test.mjs`

测试点：

- 缺任一指标生成 source_target。
- 缺多个指标全部列出。
- 不能从 prose 或 Wiki 猜指标。
- Tushare 无 token 时标记 `credential_needed` 或 `missing_config`，不编造。
- CNInfo 有 PDF 但未抽表时生成 `fill_quarterly_metrics`。

### Phase F5：公司研究层融合

目标：

- 基于 `company-research --deep` 的产物生成 formal company master report。

输入：

- `.llm-wiki/company-research/<report-id>/evidence-pack.json`
- `.llm-wiki/company-research/<report-id>/evidence-ledger.json`
- `.llm-wiki/company-research/<report-id>/financials.json`
- CNInfo/SSE PDF artifacts
- Tushare tables
- Wiki context as clue

输出：

- `company_master_report.md`
- `company_layer_manifest.json`
- `company_source_targets.jsonl`
- `company_quarterly_metrics_status.json`

测试点：

- Wiki/Tavily 线索不进入 formal facts。
- 目标价必须有模型/一致预期/券商来源。
- 公司报告中展示 structured_metrics_status。

### Phase F6：行业价值层融合

目标：

- 基于公司层和独立行业/头部公司证据生成行业价值报告。

新增能力：

- `head_company_freshness_preflight`
- `head_company_sub_signal_decomposition`

重点解决：

- Broadcom 类问题：不能只写“AI 总收入放缓”，必须拆出 AI Networking 等子方向。

测试点：

- 总量放缓但子方向加速时，报告同时展示：
  - `total_trend_signal`
  - `sub_direction_signal`
  - `direction_mapping`
  - `a_share_gate`
  - `source_url`
- 全球头部信号不能直接生成 A 股排序或目标价。

### Phase F7：题材对比层融合

目标：

- 基于公司层、行业层、Gate4、source map、估值来源生成题材对比报告。

输出：

- `theme_comparison_report.md`
- `theme_company_comparison_table.json`
- `target_price_source_map.json`
- `theme_source_targets.jsonl`

测试点：

- 缺 Gate4 阻断。
- 缺公司-题材关系证据阻断。
- 缺目标价来源阻断。
- Wiki 只能作为 navigation hint。

### Phase F8：report manifest 与 evidence status panel

目标：

- 每份公司/行业/题材报告都带 manifest 和证据状态面板。

Manifest 字段：

```text
report_type
industry
company
report_date
pipeline
layer
policy_version
evidence_contract_version
source_targets_summary
blocked_reasons
upstream_artifacts
no_llm_guessed_price
```

Panel 字段：

```text
Formal evidence count
Clue-only source count
Open source_targets
Blocked reasons
Latest structured metrics audit
Latest head company freshness preflight
no_llm_guessed_price
```

测试点：

- 每份 formal report 必须有 manifest。
- 正文必须有证据状态面板。
- `no_llm_guessed_price=true`。

### Phase F9：report_reviewer 与 report_auto_repair

目标：

- 建立报告审查与安全修复闭环。

Reviewer 检查：

- fact without evidence。
- clue written as fact。
- target price without source。
- stale quarterly period。
- head company signal missing。
- Gate4 mismatch。
- wiki_as_evidence。

Auto repair 允许：

- 修模板残留。
- 修 manifest 缺字段。
- 把缺口转 source_targets。
- 重排报告结构。

Auto repair 禁止：

- 补财务数字。
- 补订单。
- 补客户关系。
- 补目标价。
- 把 clue 升级为 formal evidence。

### Phase F10：Registry / schedules / E2E harness

目标：

- 建立 overlay registry，不直接强改上游 schedules。
- 定义最小 E2E 检查链。

E2E 最小链：

```text
company-research --deep
  -> evidence contract check
  -> source_targets gap audit
  -> structured metrics preflight
  -> company layer
  -> industry layer
  -> theme layer
  -> manifest/panel
  -> reviewer
  -> safe auto_repair
```

诚实标志：

```text
RUNTIME_DAG_ENFORCED=false
REPORT_GENERATION_ENFORCED=false
FULL_PIPELINE_ENFORCED=false
```

只有真实实现 runtime DAG 并测试后，才能改为 true。

### Phase F11：MVP 试点

建议首个试点：

- 行业：光模块/光互联。
- 全球头部：Broadcom、NVIDIA、Marvell、Arista。
- A 股公司：按现有 Wiki 和用户关注池选 3-5 家。

试点目标：

- 跑通一组公司报告。
- 跑通一份行业价值报告。
- 跑通一份题材对比报告。
- 检查 Broadcom 最新财报/分项信号能否被正确反映。
- 检查缺指标/缺目标价能否阻断。

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

每阶段至少保持：

```bash
npm test -- --run
npm run build
```

如果 build 因环境缺依赖失败，必须如实记录，不得声称通过。

### 9.2 formal-research overlay 测试

新增：

```bash
node formal-research/harness/run_all_checks.mjs
npm test -- --run tests/formal-research
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
3. CNInfo PDF artifact 有四字段时可以成为 formal evidence。
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

每个工程阶段都应生成：

```text
.llm-wiki/formal-research/phase-reports/<phase>.md
.llm-wiki/formal-research/monitor-packets/<phase>_monitor_packet.md
.llm-wiki/formal-research/manifests/current_diff_manifest.json
```

如果不想污染 live wiki project，也可以先放在源码仓库：

```text
formal-research/.codex_monitor/
```

但长期建议运行产物放到 live project 的 `.llm-wiki/formal-research/`。

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
4. 是否所有 formal evidence 都具备 source_url/document_id/evidence_quote/fetch_time。
5. 是否把 clue/navigation layer 误写为 formal evidence。
6. 是否生成或更新 source_targets，而不是编造缺失事实。
7. 是否保持 RUNTIME_DAG_ENFORCED=false / FULL_PIPELINE_ENFORCED=false，除非真实实现并测试。
8. 是否运行本阶段要求的 npm test、build、harness、rg 静态扫描。
9. 是否存在未运行却声称通过。

请按以下格式输出：

# 监控者审查结论

## 1. 总体结论
- Verdict: PASS / NEEDS_FIX / BLOCK
- 是否允许进入下一阶段：是 / 否

## 2. 范围检查
- 实际修改文件：
- 是否越权：
- 是否修改上游核心文件：

## 3. Evidence / Clue 边界
- formal evidence 四字段是否强制：
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
- 是否批准进入下一阶段：
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
- live wiki project 与源码仓库产物边界不清。
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

建议先把本文交给 GPT-5.5-pro 审查，提示词如下：

```text
请读取 trading-review-wiki-git/docs/architecture_tasks/fusion_ai_invest_research_master_plan.md。

你是 GPT-5.5-pro 架构审查者。
请重点判断：
1. 以 trading-review-wiki-git 为主、ai_invest_research 为 formal research overlay 是否合理。
2. 方案是否兼顾 trading-review-wiki-git 作为外部拉取仓库的可更新性。
3. 是否遗漏 ai_invest_research 的关键能力。
4. 是否存在把 Wiki/Tavily/搜索摘要误升格为 formal evidence 的风险。
5. 分阶段执行、修改范围、测试、monitor 提示词是否足够约束 Codex 后续执行。
6. 哪些阶段可以合并，哪些阶段必须拆开。
7. 哪些 P0 风险必须先修，哪些可以作为 P1/P2。

请输出：
# 架构审查结论
## 1. 总体 Verdict
PASS / NEEDS_FIX / BLOCK
## 2. 主系统选择是否合理
## 3. 融合方式是否低风险
## 4. 遗漏能力
## 5. 过度设计
## 6. P0/P1/P2 风险
## 7. 建议第一阶段执行范围
## 8. 是否允许进入 Phase F1
```

GPT 审查 PASS 后，再开 Phase F1。不要直接进入代码迁移。

