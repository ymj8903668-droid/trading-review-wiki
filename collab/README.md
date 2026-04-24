# OpenClaw × Trading Review Wiki 协作包

> 版本：v0.7.5（跟随主程序版本）
> 将 OpenClaw 多 Agent 自动化与 Trading Review Wiki 知识库打通，实现每日盘后自动复盘。

---

## 协作流程图

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   交易日    │     │  OpenClaw 18:00 │     │  raw/openclaw/  │
│  收盘后     │────▶│  自动生成复盘   │────▶│ {日期}/         │
│             │     │  大盘/主线/计划 │     │ daily-report.md │
└─────────────┘     └─────────────────┘     └─────────────────┘
                                                       │
                                                       ▼
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Wiki LLM   │◀────│  用户说：       │◀────│   用户查看      │
│ 执行 Ingest │     │ "摄入今日复盘"  │     │   并补充感悟    │
│ 更新知识库  │     │                 │     │                 │
└─────────────┘     └─────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                      wiki/ 知识库更新                        │
│  ├── 股票/          ← 个股档案维护                          │
│  ├── 模式/          ← 交易策略提炼                          │
│  ├── 错误/          ← 错误案例归档                          │
│  ├── 市场环境/      ← 情绪周期记录                          │
│  └── 进化/          ← 系统迭代日志                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 功能特性

| 功能 | 说明 | 触发方式 |
|------|------|----------|
| **每日自动复盘** | 大盘环境、主线板块、情绪周期、明日计划 | 定时任务 18:00（周一至周五） |
| **持仓追踪** | 自动更新 `wiki/position-tracking.md` | 用户告知 OpenClaw 交易后 |
| **交易规则检查** | 仓位、风控、情绪信号自动提醒 | 每次复盘时自动执行 |
| **交割单归档** | 收盘后自动归档到 `settlements/` | 定时任务 18:30 |
| **周度 Lint** | 模式总结、胜率统计、系统优化 | 每周日 20:00 |
| **月度大 Lint** | 月度总结、系统进化、下月计划 | 每月末 21:00 |

---

## 文件说明

```
collab/
├── README.md                      ← 本文件
├── _config.md                     ← OpenClaw 全局配置（路径、规则、阈值）
│                                     ⚠️ 部署时必须替换其中的路径变量
├── trading-rules.md               ← 交易规则示例（仓位、风控、禁止事项）
├── scripts/
│   └── append-to-wiki.cjs         ← 通用追加写入脚本（支持多种目标）
└── templates/
    └── daily-report-template.md   ← 六部分复盘报告模板
```

---

## 快速部署

### 第一步：复制文件到 Wiki 工作区

将 `collab/` 目录下的所有文件复制到你的 Wiki 工作区：

```
C:\Users\<你的用户名>\Documents\<你的Wiki工作区名>\raw\openclaw数据\
```

复制后结构：
```
raw/openclaw数据/
├── _config.md
├── trading-rules.md
├── scripts/
│   └── append-to-wiki.cjs
└── templates/
    └── daily-report-template.md
```

### 第二步：修改路径配置

打开 `_config.md`，全局替换以下变量：

| 搜索内容 | 替换为 |
|---------|--------|
| `<你的用户名>` | 你的 Windows 用户名 |
| `<你的Wiki工作区名>` | 你的 Wiki 工作区目录名 |

### 第三步：在 OpenClaw 中创建定时任务

参考 `_config.md` 中 `tasks.daily_review` 配置，在 OpenClaw 控制台添加每日 18:00 复盘任务。

---

## 数据保留策略

| 数据类型 | 保留天数 | 说明 |
|---------|---------|------|
| 每日复盘报告 | 90 天 | 超过自动归档到 `archive/` |
| 交割单 | 365 天 | 长期保存用于盈亏统计 |
| 持仓快照 | 30 天 | 短期追踪用 |

清理命令（PowerShell）：
```powershell
Get-ChildItem "raw/openclaw数据/archive" -Recurse | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-365) } | Remove-Item -Recurse
```

---

## 与主程序的关系

本协作包是 **Trading Review Wiki 的 optional 扩展**，不依赖主程序代码，仅通过文件系统与 Wiki 工作区交互：

- **OpenClaw 只写**：`raw/openclaw数据/` 和 `wiki/position-tracking.md`
- **Wiki LLM 只读**：`raw/` 中的文件，输出到 `wiki/`
- **用户只写**：`raw/日复盘/`、`raw/交割单/` 等原始素材

---

## 更多信息

- 主程序文档：[项目根目录 README.md](../README.md)
- 更新日志：[CHANGELOG.md](../CHANGELOG.md)
