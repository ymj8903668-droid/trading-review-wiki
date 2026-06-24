# v1.2.1 Revision Notes

## Patch classification

- 类型：文档一致性补丁。
- 风险等级：P1 文档问题；在 F0 前修复。
- 架构语义：不变。
- 执行 phase 顺序：不变。
- Owner/Monitor 审批：不变。

## Corrected inconsistency

v1.2 的 master plan 推荐 runtime 布局中仍残留 `phase-reports/` 与 `monitor-packets/`，而 execution guide 已将工程审查材料固定到源码仓 `.planning/formal-research/`。v1.2.1 统一为：

```text
TRADING_REPO_ROOT/.planning/formal-research/
  phase-contracts/
  phase-reports/
  monitor-packets/
  approvals/
  manifests/

FORMAL_RUNTIME_ROOT/data/formal_research/
  canonical state

FORMAL_RUNTIME_ROOT/.llm-wiki/formal-research/
  runs/
  reports/
  runtime-reviews/
  run-manifests/
```

`runtime-reviews` 不具备工程阶段放行权；`monitor-packets` 不得进入业务 runtime root。

## Frozen decisions retained

1. Owner/Monitor brake remains P0.
2. `KNOWLEDGE_PROJECT_ROOT` may temporarily equal the source repository and remains read-only to the overlay.
3. Live `FORMAL_RUNTIME_ROOT` must remain outside `TRADING_REPO_ROOT`.
4. Master plan uses `M0-M11`; only execution-guide `F*` identifiers are executable.
5. F3B remains fixture-first, after F5 and before F6, with network disabled by default.
6. First executable phase remains F0 only.

## Repository bootstrap addition

- 新增 `DOCUMENT_LANDING_RUNBOOK.md`，把 canonical 文档复制、旧版归档和 hash 校验定义为 F0 前的非 phase 动作。
- F0 仍必须由 Owner 另行明确授权；文档落地完成不等于 F0 已执行。
