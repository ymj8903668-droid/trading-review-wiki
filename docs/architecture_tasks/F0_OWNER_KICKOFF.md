# Owner Instruction — Execute F0 Only

> 使用前把 `<...>` 替换为真实值。此文件是模板，不是自动批准记录。  
> 前置条件：canonical v1.2.1 已按 `DOCUMENT_LANDING_RUNBOOK.md` 落地、历史版本已 deprecated/archive、`BASELINE_MANIFEST.json` 校验通过。

```text
你是 EXECUTOR-CODEX。

请同时读取：
1. docs/architecture_tasks/fusion_ai_invest_research_master_plan.md
2. docs/architecture_tasks/fusion_ai_invest_research_codex_master_execution_guide.md

CURRENT_PHASE=F0
NETWORK_ALLOWED=false

本次只执行 F0：基线、仓库发现、root topology、设计冻结与 F1A draft contract。

硬限制：
- 只允许修改 docs/architecture_tasks/** 与 .planning/formal-research/**；
- 不修改 src/**、scripts/**、formal-research/**、tests/**、package.json、lockfiles、raw/**、wiki/**、data/**、.llm-wiki/**；
- 不迁移现有 raw/wiki/facts/brain；
- 不接入网络或密钥；
- 不创建 F0-to-F1A approval receipt；
- 不执行 F1A；
- 完成 monitor packet 后状态只能是 READY_FOR_MONITOR / NEEDS_FIX / BLOCKED，并立即停止。

F0 必须识别并记录：
- TRADING_REPO_ROOT；
- KNOWLEDGE_PROJECT_ROOT 是否与源码仓同址；
- FORMAL_RUNTIME_ROOT 的仓外候选位置；
- 旧 WIKI_PROJECT_ROOT 的实际含义；
- 上游 company-research staging 的写入位置和 artifact version；
- 当前真实测试/构建命令与 dirty worktree。

不得猜测命令或接口；未运行写 NOT_RUN；不得声称 Monitor PASS 或 Owner 已批准下一阶段。
```
