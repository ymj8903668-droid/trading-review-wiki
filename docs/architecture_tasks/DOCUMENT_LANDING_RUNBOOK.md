# Document Landing Runbook — v1.2.1

> 性质：repository bootstrap，不是 Codex execution phase。  
> 目标：把 canonical 文档安全落入 `trading-review-wiki-git/docs/architecture_tasks/`，保留历史审计链，然后停止。  
> 禁止：业务代码修改、runtime 写入、网络访问、phase report、Monitor packet、approval receipt、F0 实施。

## 1. 前置检查

在 `TRADING_REPO_ROOT` 执行只读检查：

```bash
pwd
git rev-parse --show-toplevel
git status --short
git rev-parse HEAD
find docs/architecture_tasks -maxdepth 2 -type f -print 2>/dev/null | sort
```

若 `docs/architecture_tasks/` 存在来源不明的未提交修改，不覆盖、不 reset、不 stash；记录冲突并停止。

## 2. 建立目录与历史归档

```bash
mkdir -p docs/architecture_tasks/archive
```

对已有 canonical 文件先保留副本。示例中的时间戳必须替换为实际 UTC 时间：

```bash
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
for f in \
  docs/architecture_tasks/fusion_ai_invest_research_master_plan.md \
  docs/architecture_tasks/fusion_ai_invest_research_codex_master_execution_guide.md
do
  if [ -f "$f" ]; then
    cp -p "$f" "docs/architecture_tasks/archive/$(basename "$f" .md)_pre_v1.2.1_${STAMP}.md"
  fi
done
```

不得删除 v1.0/v1.1/v1.2 文件。可将其移入 `archive/`，或在文件头加入 `DEPRECATED` banner；不得更改其历史正文。

推荐 banner：

```text
> DEPRECATED — 不得用于生成新 phase contract。当前基准为 canonical v1.2.1。
```

## 3. 复制 canonical 文档

从本部署包的 `docs/architecture_tasks/` 复制以下文件到仓库同名路径：

```text
fusion_ai_invest_research_master_plan.md
fusion_ai_invest_research_codex_master_execution_guide.md
README.md
F0_OWNER_KICKOFF.md
DOCUMENT_LANDING_RUNBOOK.md
REVISION_NOTES_v1.2.1.md
BASELINE_MANIFEST.json
```

只允许修改 `docs/architecture_tasks/**`。不要创建 `.planning/formal-research/**`；那属于 F0。

## 4. 校验基准哈希

在 `docs/architecture_tasks/` 目录执行：

```bash
python3 - <<'PY'
from pathlib import Path
import hashlib, json
root = Path('.')
manifest = json.loads((root / 'BASELINE_MANIFEST.json').read_text(encoding='utf-8'))
failed = False
for rel, expected in manifest['files'].items():
    path = root / rel
    actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else 'MISSING'
    ok = actual == expected
    print(('OK   ' if ok else 'FAIL '), rel, actual)
    failed |= not ok
raise SystemExit(1 if failed else 0)
PY
```

## 5. 一致性扫描

```bash
rg -n "phase-reports/|monitor-packets/" fusion_ai_invest_research_master_plan.md
rg -n "FORMAL_RUNTIME_ROOT|TRADING_REPO_ROOT/.planning/formal-research" \
  fusion_ai_invest_research_master_plan.md \
  fusion_ai_invest_research_codex_master_execution_guide.md
```

允许出现的含义只有：

- 工程 `phase-reports/`、`monitor-packets/` 位于 `TRADING_REPO_ROOT/.planning/formal-research/`；
- runtime 目录使用 `runs/`、`reports/`、`runtime-reviews/`、`run-manifests/`、`current/`；
- 不得在 `FORMAL_RUNTIME_ROOT` 的推荐布局中出现工程 `phase-reports/` 或 `monitor-packets/`。

## 6. 审阅 diff 并停止

```bash
git diff -- docs/architecture_tasks/
git status --short
```

完成标准：

- canonical v1.2.1 文件已落地并通过 hash；
- 历史版本仍可审计且标为 deprecated/archive；
- diff 只在 `docs/architecture_tasks/**`；
- 未创建 F0 artifacts；
- 未修改业务代码、runtime 数据或 lockfile。

完成后停止。下一步只能由 Owner 使用 `F0_OWNER_KICKOFF.md` 明确授权 `CURRENT_PHASE=F0`。
