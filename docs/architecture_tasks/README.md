# Fusion Architecture Task Baseline

状态：`CURRENT`  
基准版本：`1.2.1`  
生效日期：`2026-06-24`

## Canonical documents

1. `fusion_ai_invest_research_master_plan.md`：架构理由与非执行里程碑 `M0-M11`。
2. `fusion_ai_invest_research_codex_master_execution_guide.md`：Codex 唯一执行手册，执行 phase 使用 `F*`。

两份文档必须同时读取；新的 phase contract 只能基于 v1.2.1 canonical 文件生成。

## v1.2.1 patch scope

本补丁只修正文档路径一致性，不改变 v1.2 已冻结的架构与执行规则：

- 工程 phase contract、phase report、Monitor packet、approval receipt 与 diff manifest 写入 `TRADING_REPO_ROOT/.planning/formal-research/`；
- 业务 pipeline 的 runs、reports、runtime reviews 与 run manifests 写入 `FORMAL_RUNTIME_ROOT/.llm-wiki/formal-research/`；
- formal canonical state 仍只写入 `FORMAL_RUNTIME_ROOT/data/formal_research/`；
- F0、Owner/Monitor 刹车、fixture-first 和 F3B 时点均不变。

## Document landing before F0

先按 `DOCUMENT_LANDING_RUNBOOK.md` 完成 repository bootstrap。它不是 F0，不得创建 `.planning/formal-research/` phase 状态、phase report、Monitor packet 或 approval receipt。文档与哈希验证完成后，Owner 再使用 `F0_OWNER_KICKOFF.md` 发起独立的 F0 委托。

## Deprecated and superseded documents

以下文件或内容版本不得作为当前执行依据：

- v1.0、v1.1：状态为 `DEPRECATED`；
- 未包含本路径修正的 v1.2：状态为 `SUPERSEDED`；
- 任何没有明确 `文档版本：1.2.1` 与 `基准状态：CURRENT` 的副本。

不要静默覆盖历史文件。应在旧文件头增加状态 banner，或移入 `docs/architecture_tasks/archive/`，保留审计链。

## Phase governance

```text
EXECUTOR-CODEX completes one approved phase
  -> READY_FOR_MONITOR
  -> MONITOR-GPT5.5 PASS
  -> AWAITING_OWNER
  -> OWNER explicitly approves one next phase and reviewed Head SHA
  -> next independent Codex invocation
```

首次只允许 `CURRENT_PHASE=F0`。F0 不需要前置 approval receipt；F1A 及以后需要。

## Root topology

- `TRADING_REPO_ROOT`：上游源码、overlay 代码和工程治理记录。
- `KNOWLEDGE_PROJECT_ROOT`：现有知识输入；可暂时与源码仓同址，overlay 默认只读。
- `FORMAL_RUNTIME_ROOT`：formal canonical state 和业务运行输出；live 模式必须位于源码仓外。
- F0 不迁移现有 `raw/wiki/facts/brain`。

## Output ownership

| 输出 | 唯一路径 |
|---|---|
| 工程 phase report / Monitor packet / approval | `TRADING_REPO_ROOT/.planning/formal-research/` |
| Formal canonical state | `FORMAL_RUNTIME_ROOT/data/formal_research/` |
| Runs / reports / runtime reviews / run manifests | `FORMAL_RUNTIME_ROOT/.llm-wiki/formal-research/` |

## Baseline execution order

```text
F0 -> F1A -> F1B -> F2 -> F3A -> F4 -> F5 -> F3B -> F6 -> F7 -> F8 -> F9
                                                          \
                                                           -> F10 (optional)
```

F3B 采用 fixture-first，固定在 F5 后、F6 前；默认不联网。
