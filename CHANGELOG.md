# Trading Review Wiki 更新日志

> 版本发布历史，按时间倒序排列。

---

## v0.6.1 — 2026-04-19

### 紧急修复

- **修复 v0.6.0 运行时崩溃**：`chat-message.tsx` 中 `useChatStore.getState().queryPages` 引用了不存在的状态字段（正确应为 `lastQueryPages`），导致 `extractCitedPages` 读取 `undefined.length`，页面报 "Something went wrong"。

---

## v0.6.0 — 2026-04-19

### 修复（主题切换白屏 + 全项目 Bug 清理）

- **修复 v0.5.9 主题切换白屏**：`app-layout.tsx` 中使用了未声明的 `appTheme` 变量，导致 `ReferenceError`，React 崩溃白屏。
- **修复 ingest 异常状态泄漏**：`startIngest` / `executeIngestWrites` 中 `streamChat` 若直接抛异常，`isStreaming` 将永久为 `true`。已添加 `try-finally` 确保重置。
- **修复 ingest 文件写入卡死**：`autoIngest` 中 `writeFileBlocks` 未处理异常，activity 状态将永久停留在 "Writing files..."。已添加 `try-catch`。
- **修复聊天闭包陷阱**：`chat-panel.tsx` `handleSend` 的 `useCallback` 缺少 `project` 依赖，切换项目后消息仍发送到旧路径。
- **修复聊天滚动过度触发**：`useEffect` 依赖 `activeMessages`（每次渲染新数组引用），导致每次渲染都强制滚动。改为依赖稳定的消息数量。
- **修复 lastQueryPages 竞态**：将模块级可变变量 `lastQueryPages` 迁移到 `chat-store`，避免多请求并行时互相覆盖。
- **修复 clip-watcher 重复处理**：`setInterval` async 回调缺少防重叠机制，已添加 `isPolling` 锁。
- **修复 settings 页面 timer 泄漏**：保存成功的 `setTimeout` 未在组件卸载时清理。
- **修复 App 启动竞态**：`init()` 异步操作缺少取消机制，快速切换项目可能导致中间状态混乱。
- **修复 auto-save 订阅泄漏**：`setupAutoSave` 未保存 `subscribe` 返回值，HMR/重载时产生重复订阅。新增 `teardownAutoSave()`。
- **修复暗色主题未生效**：全局从未设置 `.dark` 类，导致所有 `dark:` Tailwind 变体失效。已在 App mount 时自动添加。
- **修复 trade-stats 除零风险**：FIFO 引擎中 `remaining / r.quantity` 在 quantity 为 0 时产生 `NaN`。
- **修复构建语法错误**：`ingest.ts` 中存在跨行双引号字符串未闭合，导致 Vite/Rolldown 构建失败。

---

## v0.5.10 — 2026-04-19

### 修复

- **Wiki 页面目录路由**：`buildGenerationPrompt` 强化目录分类规则：
  - frontmatter `type` 示例从英文改为中文值（`股票 | 策略 | 模式 | 错误 | 市场环境 | 进化 | 总结`），避免 LLM 跟随英文示例生成错误类型。
  - 新增明确的 type→directory 映射规则：`股票→wiki/股票/`, `策略→wiki/策略/` 等。
  - 新增规则要求 frontmatter `type` 必须与文件所在目录严格一致。
  - 文件名示例明确为中文，如 `wiki/股票/沃格光电.md`。

## v0.5.9 — 2026-04-18

### 新增

- **主题切换功能**：设置面板新增「外观」选项，支持 5 种预设主题：
  - **默认** — 经典暗色主题
  - **午夜蓝** — 深蓝调，经典交易终端风格
  - **墨绿** — 护眼墨绿，长时间盯盘更舒适
  - **深紫** — 优雅紫调，沉稳大气
  - **琥珀** — 暖琥珀色，温馨夜间氛围
  - 主题选择即时生效，自动持久化到本地存储。

## v0.5.8 — 2026-04-18

### 修复

- **文本格式 `.xls` 交割单无法导入**：部分券商导出的 `.xls` 实际是纯文本 TSV（GBK 编码、制表符分隔），`parseTradeExcel` 新增 fallback 直接按文本解析，不再依赖 SheetJS。
- **HEADER_MAP 扩展**：`transferFee` 增加 `其他杂费`、`杂费`、`其他费用` 别名。

## v0.5.7 — 2026-04-18

### 修复

- **卖出记录被过滤**：`parseDirection` 扩展支持 `-`、`-1`、`负`、`融券卖出`、`担保品卖出` 等卖出方向；增加 quantity 负数推断方向 fallback；quantity 统一取绝对值。
- **Wiki 英文目录问题**：`buildGenerationPrompt` 增加强制规则，禁止 LLM 在中文目录存在时创建英文等价目录；已迁移现有英文目录文件到中文目录。
- **Graph View 节点颜色**：增加 `entity`/`concept`/`comparison`/`query`/`synthesis` 英文类型的颜色映射，解决知识树全部显示为 "other" 的问题。
- **frontmatter type 强制中文值**：LLM 生成页面时，若 Schema 定义了中文类型（策略/股票/模式等），必须使用中文值而非英文 `entity`/`concept`。
- 交互修复：移除 `setOpeningPositions([])` 残留引用；交割单导入增加空记录/失败/不支持格式的明确提示；多文件导入汇总结果。

### 已知问题

- **macOS 安装提示"已损坏"**：当前版本缺少 Apple Developer 代码签名，macOS Gatekeeper 会阻止安装。
  - **绕过方法**：安装前在终端执行 `xattr -c /Applications/Trading\ Review\ Wiki.app`，或右键点击 app 选择"打开"。
  - 正式签名需要 Apple Developer 账号和 Notarization 配置，后续版本将解决。

---

## v0.5.6 — 2026-04-18

### 新增：交割单导入与统计看板

- **交割单 CSV/Excel 自动导入**：在 Sources 面板点击「导入交割单」，选择券商导出的 `.csv` / `.xlsx` / `.xls` 文件，自动解析并生成每日 markdown 交割单。
  - 支持 20+ 种表头别名自动识别（成交日期/证券代码/方向/数量/成交价/成交金额/手续费/印花税/过户费等）。
  - 双层扫描策略：前 50 行精确匹配 → 前 100 行评分 fallback。
  - 自动过滤撤单/废单、红利/送转/配股/中签等非交易流水。
  - 五维合法性校验（日期/代码/方向/数量/金额），异常时明确报错。
- **FIFO 盈亏计算**：基于先进先出原则逐笔匹配买入/卖出成本，自动计算每日和每只股票已实现盈亏。
  - **超卖保护**：当卖出数量超过已知买入持仓时，只计算匹配部分盈亏，并标记 `hasUnknownCost`。
  - **数据一致性原则**：不引入手工录入的"期初持仓"，完全依赖交割单导入的完整性保证准确率。
- **交易统计看板（Dashboard）**：
  - KPI 卡片：总盈亏、成交笔数、日均盈亏、胜率。
  - 月度盈亏柱状图、股票盈亏排行 Top 10、最近交易日明细表。
  - 当前持仓标签页：支持手动输入市价，实时计算浮动盈亏和市值。
  - 缺少成本基准时顶部显示 ⚠️ 提示，引导用户导入更早的交割单补全历史。
- **导入交互优化**：
  - 批量导入时逐文件汇总结果（成功/无记录/失败/不支持的格式）。
  - 解析 0 条记录时给出明确提示，告知用户检查文件格式和表头。
  - 跨文件 FIFO 连续性：同一批次导入的多个文件按顺序累积计算成本。

### 修复

- **卖出记录被过滤**：`parseDirection` 扩展支持 `-`、`-1`、`负`、`融券卖出`、`担保品卖出` 等卖出方向；增加 quantity 负数推断方向 fallback；quantity 统一取绝对值。
- **Wiki 英文目录问题**：`buildGenerationPrompt` 增加强制规则，禁止 LLM 在中文目录存在时创建英文等价目录；已迁移现有英文目录文件到中文目录。
- **Graph View 节点颜色**：增加 `entity`/`concept`/`comparison`/`query`/`synthesis` 英文类型的颜色映射，解决知识树全部显示为 "other" 的问题。
- **交互修复**：移除 `setOpeningPositions([])` 残留引用；交割单导入增加空记录/失败/不支持格式的明确提示；多文件导入汇总结果。
- `normalizeDate` 非日期输入返回 `""`（原返回脏字符串）。
- `normalizeDate` short-date 增加月份/日期范围校验，防止 `04/15/25` 被误解析为 `2004-15-25`。
- Dashboard `useEffect` 增加 `cancelled` flag + `dataVersion` 依赖，防止快速切换项目时的 race condition。
- 空状态不再阻断「当前持仓」标签页的访问。

---

## v0.5.5 — 2026-04-18

### 新增：Deep Research 人工审核

- **问题**：Deep Research 合成完成后直接自动保存到 Wiki，用户没有机会检查和修改。
- **实现**：
  1. 新增 `pending_review` 状态，位于 `synthesizing` 和 `saving` 之间。
  2. 合成完成后自动剥离 `<think>` / `<thinking>` 块，展示干净草稿预览。
  3. 用户可选择：**保存到 Wiki**、**重新生成**（复用原 topic + queries 重新排队）、**丢弃**。
  4. 保存时才执行文件写入和 auto-ingest，防止误操作污染 Wiki。

### 修复：彻底清理切换工作区后的状态残留

- **问题**：切换项目后，右侧面板仍显示旧项目的研究任务/文件预览/聊天流式状态，`activeView` 也未重置。
- **根因**：`handleSwitchProject` 和 `handleProjectOpened` 仅清空了 review/chat 的 conversations/messages，遗漏了 `fileContent`、`activeView`、`chatExpanded`、`researchStore.tasks`、`isStreaming` 等状态。
- **修复**：
  1. `chat-store` 新增 `resetProjectState()` 一键重置所有聊天相关状态。
  2. `research-store` 新增 `clearTasks()` 清空所有研究任务。
  3. `handleSwitchProject` 和 `handleProjectOpened` 统一调用上述方法，并额外重置 `setFileContent("")`、`setActiveView("wiki")`、`setChatExpanded(false)`、`setPanelOpen(false)`。

---

## v0.5.4 — 2026-04-17

### 修复：切换工作区后旧数据残留

- **问题**：更换工作区（或打开新项目）后，"待审阅"面板和聊天历史仍显示旧工作区的内容。
- **根因**：`App.tsx` 在加载新项目的 review/chat 数据时，若新工作区为空数组，由于 `if (savedReview.length > 0)` 的保护逻辑，`setItems` 未被调用，导致旧数据继续驻留在内存中。
- **修复**：
  1. `handleProjectOpened` 开头先清空 `reviewStore` 和 `chatStore`。
  2. 去掉空数组保护，直接 `setItems(savedReview)` / `setConversations(savedChat.conversations)`。
  3. `handleSwitchProject` 切回欢迎页时也同步清空相关 stores。

---

## v0.5.3 — 2026-04-16

### 修复：截图文件夹 PNG 图片无法显示 + 聊天图片引用路径错误

- **问题 1**：在 `截图` 文件夹中点击 PNG 图片，预览面板黑屏/空白，无法显示。
  - **根因**：`file-preview.tsx` 使用 Tauri 的 `convertFileSrc` 生成 asset URL，在 Windows 环境下该方式对本地图片的解析不稳定，常导致加载失败。
  - **修复**：弃用 `convertFileSrc`，改为通过 Rust `readFileBinary` 读取图片二进制，再用浏览器原生 `URL.createObjectURL` 生成 Blob URL 进行展示。此方案同时应用于 `ImagePreview`、`VideoPreview`、`AudioPreview`。
- **问题 2**：聊天窗口中用户发送的图片（保存为 `raw/截图/xxx.png`）在消息气泡里不显示。
  - **根因**：`chat-message.tsx` 的 `img` 渲染组件把 markdown 中的相对路径 `raw/截图/xxx.png` 直接传给了 `convertFileSrc`，但 `convertFileSrc` 要求绝对路径，导致 URL 非法。
  - **修复**：新增 `LocalImage` 组件，先根据 `project.path` 将相对路径解析为绝对路径，再通过 `readFileBinary` + `URL.createObjectURL` 加载并渲染。

---

## v0.5.2 — 2026-04-16

### 新增：聊天图片上传 + 截图文件夹图片预览修复

- **聊天窗口支持图片**：
  1. `chat-input.tsx` 支持拖拽、粘贴、点击上传图片（最多 5 张，仅接受 `image/*`）。
  2. 发送时自动将图片保存到 `raw/截图/YYYY-MM-DD-HH-MM-SS-filename.png`。
  3. 在用户消息中插入 markdown 图片引用 `![name](raw/截图/xxx.png)`，聊天历史可持久化显示。
  4. `chat-message.tsx` 的 `MarkdownContent` 新增 `img` 组件渲染，本地图片路径通过 `convertFileSrc` 安全转换，支持 Windows 反斜杠路径。
- **修复截图文件夹图片无法显示**：
  1. `file-preview.tsx` 中 `convertFileSrc` 接收的路径若含 Windows 反斜杠，会生成非法 asset URL。
  2. 已在 `ImagePreview`、`VideoPreview`、`AudioPreview` 中统一将反斜杠替换为正斜杠后再调用 `convertFileSrc`。
- **Rust 后端新增二进制写入命令**：`write_binary_file` command，支持前端直接把 `Uint8Array` 落盘到任意路径。

---

## v0.5.1 — 2026-04-16

### 修复：Save to Wiki 后个股文件错误创建在 entities/ 目录

- **问题**：用户点击聊天消息中的 **Save to Wiki** 后，`autoIngest` 的生成提示硬编码要求 LLM 把实体页放在 `wiki/entities/`，导致交易复盘项目中的个股档案被错误地写到了 `entities/`，而不是 `wiki/股票/`。
- **修复**：
  1. `ingest.ts` 的 `autoIngest` 在生成阶段前，先扫描 `wiki/` 下的实际子目录列表。
  2. 将子目录列表传入 `buildGenerationPrompt`，替换原有的硬编码 `wiki/entities/` 和 `wiki/concepts/` 指令。
  3. 新提示要求 LLM **根据 Wiki Schema 把页面放到正确的子目录**（如股票 → `wiki/股票/`、策略 → `wiki/策略/`、模式 → `wiki/模式/`、通用实体 → `wiki/entities/` 等）。

---

## v0.5.0 — 2026-04-16

### 改进：System Prompt 明确告知 LLM 保存能力

- **问题**：用户在聊天中要求 LLM "写入反思"时，LLM 回复"我没有手，不能直接创建文件"，导致体验断裂。
- **修复**：在 `chat-panel.tsx` 的 system prompt 中新增 **"保存到 Wiki"** 规则：
  1. 明确告知 LLM 每条回复旁边都有 **"Save to Wiki"** 按钮。
  2. 当用户要求写入/保存/生成反思时，LLM 应直接输出完整 markdown，并引导用户点击该按钮保存。
  3. 保留 `<!-- save-worthy: yes | 理由 -->` 的主动提示机制。

---

## v0.4.9 — 2026-04-16

### 安全与稳定性修复（静态代码审查整改）

- **【致命】Clip Server CSRF 防护**：本地剪藏服务 (`127.0.0.1:19827`) 原允许任意来源跨域访问，恶意网页可静默向用户知识库注入数据。现已实施 Token 鉴权：
  1. App 启动时生成 32 字节随机 Token 保存在内存中。
  2. 新增 Tauri command `get_clip_server_token()` 供前端获取。
  3. Clip Server 所有端点（`/clip`、`/project`、`/projects`、`/clips/pending` 等）均要求请求头携带 `X-Clip-Token`，未携带或错误时返回 `401 Unauthorized`。
  4. 前端 `App.tsx`、`clip-watcher.ts` 等所有调用 Clip Server 的位置均已同步携带 Token。
- **【严重】修复 Rust unwrap() Panic 风险**：`clip_server.rs` 中 `Header::from_bytes(...).unwrap()` 和多处 `Mutex.lock().unwrap()` 在极端情况下可能导致后台线程 Panic。现已替换为安全的模式匹配和错误回退逻辑。
- **【严重】修复大量空 Catch 块导致的静默失败**：`App.tsx`、`embedding.ts`、`sources-view.tsx` 中大量 `catch {}` 被改为至少输出 `console.warn`，确保异常可被排查。关键业务路径（如项目打开）保留原有用户提示。
- **【一般】修复 Excel 金额解析浮点精度丢失**：`fs.rs` 中处理 `Data::Float` 时原使用 `*f == (*f as i64) as f64` 自行判断整数，在金融场景下存在 IEEE 754 截断风险。现已统一使用 `format!("{:.4}", f)` 保留精度并去除末尾无效零。
- **【一般】修复 TypeScript catch (backendErr: any)**：`sources-view.tsx` 中交割单导入 fallback 的异常捕获类型从不安全的 `any` 改为 `unknown`，并使用类型保护提取错误信息。
- **【提示】FIFO 边界场景文档化**：在 `trade-import.ts` 的 `calculateFifoPnL` 和 `isWithdrawn` 附近添加注释，明确说明当前 FIFO 算法不支持 A 股除权除息、送转股、配股、新股中签等特殊行为，提醒用户在导入前自行确认。

---

## v0.4.8 — 2026-04-16

### 新增：快速复盘内置模板 + 编辑器手动保存

- **快速复盘升级**：
  1. 侧边栏 🖊️ 快速复盘现在内置完整的交易复盘模板（与 `raw/日复盘/日复盘模板.md` 保持一致），包含今日操作、市场环境、心态与纪律、关键反思、明日计划五个模块。
  2. 去掉了原来的研究笔记、阅读笔记、日常随笔三个模板，简化为一键 **"创建今日复盘"**。
  3. 创建的文件自动保存到 `raw/日复盘/YYYY-MM-DD-复盘.md`，若当日文件已存在则直接打开。
- **编辑器手动保存按钮**：在 wiki 编辑器顶部标题栏新增显式 **"保存"** 按钮（位于关闭按钮左侧），点击立即落盘，保存成功后短暂显示 **"已保存"**。自动保存机制仍然保留。

---

## v0.4.7 — 2026-04-16

### 修复：LLM 对话正常访问 raw/ 下的交割单/日复盘（含深度审查修复 + 模板骨架补全）

- **根因**：v0.4.3 修复了 `searchWiki()` 的检索范围，但 `chat-panel.tsx` 构建 system prompt 时只取搜索前 10 名去竞争 budget，导致排第 11 名及以后的 raw 文件无法进入上下文。v0.4.4 用"强制注入"补丁临时解决，但破坏了三层架构设计。
- **检索链路修复**：
  1. 移除 P-1 强制注入逻辑，恢复 `raw/` 通过正常检索链路被访问。
  2. 页面加载阶段改用全部 20 个搜索结果竞争 budget，不再只截断前 10 名。
  3. 在 `search.ts` 中为 `raw/` 目录下的命中文件增加 `RAW_BONUS = +4` 分，确保交割单/日复盘在相关性排序中不会被 wiki 页面埋没。
  4. **新增 Recency Boost**：文件名含 `YYYY-MM-DD` 的资料按日期近远加分（≤7天 +6，≤30天 +3，≤90天 +1）；若用户查询含"最近一个月"等时间词，范围内文件额外 +15 分，解决"最近交割单读到 2 月、3 月、4 月混排"的问题。
- **代码审查中发现并修复的 bug**：
  1. `chat-message.tsx` 补回缺失的 `Paperclip` import，修复 SourceRef 按钮导致的运行时崩溃。
  2. `chat-panel.tsx` 增加 `addedPaths` 去重机制，防止同一文件被搜索命中和 Graph expansion 重复加载，避免浪费 budget。
  3. `chat-message.tsx` 简化 wikilink fallback 解析逻辑，移除始终指向 `entities/` 的错误循环。
  4. `search.ts` 修复 Vector Search fallback：不再硬编码 `entities/`、`concepts/` 等旧目录，改为在整个 `wiki/` 树中按文件名匹配（适配中文目录结构如 `股票/`、`策略/`）。
  5. `search.ts` 扩展 raw 目录文件过滤规则，排除 `.exe`、`.zip`、`.db`、`.tmp` 等二进制/临时文件。
  6. **搜索闪退**：`search-view.tsx` 的 `HighlightedText` 组件中 RegExp 带 `g` 标志重复 `test()` 导致 `lastIndex` 错乱，改用字符串比较修复。
  7. **raw/ 检索性能闪退**：当 `raw/` 目录下积累 100+ 个历史文件时，`search.ts` 会逐个 `readFile()` 读取全部文件，Tauri IPC 阻塞主线程导致 Windows 判定程序无响应并强制关闭。现已限制每个 raw 子目录仅读取按文件名排序后的最新 20 个文件，避免 IPC 洪水。
  8. **交割单收益计算严重错误**：部分券商 CSV 中买入金额为负数，导致 FIFO 成本算成负数、盈利虚高。`trade-import.ts` 与 `trade-stats.ts` 中统一对 `amount` 取 `Math.abs()`。
  8. **markdown 表格解析丢记录**：`trade-stats.ts` 的 `parseTradeMarkdown` 误用 `.filter((s) => s.length > 0)` 去掉空单元格，导致空费用列的行被丢弃。改为仅去掉首尾 `|` 产生的空字符串。
  9. **FIFO 买入成本不一致**：`trade-import.ts` 的 `calculateFifoPnL` 买入时错误地包含了印花税，现已与 `trade-stats.ts` 统一为 `|amount| + fee + transferFee`。
- **项目创建模板修复（关键）**：
  - **问题**：App 使用"交易复盘"模板创建项目时，只创建了空目录，没有复制任何初始文件。导致 `raw/日复盘/日复盘模板.md`、`wiki/index.md`、`wiki/策略/交易策略总览.md`、`wiki/进化/交易进化史.md`、`wiki/模式/市场模式库.md`、`wiki/错误/错误类型手册.md` 全部缺失，用户每次都要手动去模板仓库复制。
  - **修复**：
    1. 在 `WikiTemplate` 中新增 `files` 字段，支持定义模板专属的初始文件。
    2. 在 `tradingTemplate` 中嵌入全部 6 个初始文件的内容。
    3. 修改 `create-project-dialog.tsx`，创建项目时自动遍历并写入 `template.files` 中定义的所有文件。
    4. 同步 `templates.ts` 中 `tradingTemplate.schema` 为最新版 `AGENTS.md`（含 Recency Boost 和 FIFO 规则说明）。

## v0.4.6 — 2026-04-16（已弃用）

> **弃用原因**：v0.4.6 安装包存在已知问题——`tradingTemplate.schema` 未被正确更新为最新版 `AGENTS.md`，导致新建项目的 `schema.md` 仍使用旧内容（缺少 Recency Boost 和 FIFO 规则说明）。该问题已在 **v0.4.7** 修复，请勿使用 v0.4.6 安装包。

## v0.4.5 — 2026-04-16

### 修复：LLM 对话正常访问 raw/ 下的交割单/日复盘

- **根因**：v0.4.3 修复了 `searchWiki()` 的检索范围，但 `chat-panel.tsx` 构建 system prompt 时只取搜索前 10 名去竞争 budget，导致排第 11 名及以后的 raw 文件无法进入上下文。v0.4.4 用"强制注入"补丁临时解决，但破坏了三层架构设计。
- **修复**：
  1. 移除 P-1 强制注入逻辑，恢复 `raw/` 通过正常检索链路被访问。
  2. 页面加载阶段改用全部 20 个搜索结果竞争 budget，不再只截断前 10 名。
  3. 在 `search.ts` 中为 `raw/` 目录下的命中文件增加 `RAW_BONUS = +4` 分，确保交割单/日复盘在相关性排序中不会被 wiki 页面埋没。

## v0.4.4 — 2026-04-15

### 修复：LLM 对话仍然无法访问交割单/日复盘（强制注入上下文）

- **根因**：v0.4.3 仅修复了 `searchWiki()` 的检索范围，但 `chat-panel.tsx` 构建 system prompt 时只取搜索前 10 名，交割单文件仍可能因排名或 budget 限制被挤出上下文。因此 LLM 依然"看不到"这些文件。
- **修复**：在 `chat-panel.tsx` 的上下文组装逻辑中增加 **P-1 强制注入阶段**：每次对话前，无条件将 `raw/交割单/` 和 `raw/日复盘/` 下最近 7 个 `.md` 文件直接加载进 system prompt（最高优先级，不受搜索排名影响），确保 LLM 始终能基于最新交易记录回答。

---

## v0.4.3 — 2026-04-15

### 修复：LLM 对话无法访问 raw/交割单 和 raw/日复盘

- **根因**：`searchWiki()` 函数在构建 Chat 上下文时，只检索了 `wiki/` 和 `raw/sources/`，完全遗漏了 `raw/交割单/`、`raw/日复盘/`、`raw/研报新闻/` 等原始资料目录。因此 LLM 的 system prompt 中不会包含交割单和日复盘内容，导致用户提问时 LLM "看不到" 这些文件。
- **修复**：将原始资料的检索范围从 `raw/sources` 扩大到整个 `raw/` 树，并过滤掉 `.png`、`.jpg`、`.mp4` 等二进制文件，确保所有文本类原始资料（交割单 markdown、日复盘、研报等）都能被纳入 Chat 上下文中。

---

## v0.4.2 — 2026-04-15

### 修复：原始资料页面无法滚动

- **根因**：`SourcesView` 中使用的 `ScrollArea` 组件在 flex 容器内缺少 `min-h-0`，导致 flex item 随内容自动撑高，视口永远不会小于内容高度，因此不显示滚动条。
- **修复**：给 `ScrollArea` 添加 `min-h-0`，使其在 flex 布局中正确约束高度并启用滚动。

---

## v0.4.1 — 2026-04-15

### 修复：交割单统计逻辑全面重构（FIFO 统一引擎）

**问题根因：**
- 之前 `parseTradeMarkdown` 用「卖出金额 - 买入金额 - 费用」估算单日盈亏，这实际上是**资金流动**（cash flow），不是真正的**已实现盈亏**。导致买入多的日子显示大亏，卖出多的日子显示大赚，严重误导。
- 股票级别的盈亏也是按单条记录简单加减，没有考虑持仓成本。
- 持仓成本与盈亏统计分别维护，逻辑存在不一致风险。

**修复方案：**
- 在 `src/lib/trade-stats.ts` 中引入统一的 `runFifoEngine` 引擎，基于**先进先出（FIFO）**计算：
  1. **每日已实现盈亏** — 仅在卖出日产生盈亏，按历史买入成本精确计算
  2. **每只股票累计已实现盈亏** — 同一只股票跨日多次买卖也能准确归集
  3. **当前持仓成本与浮动盈亏** — 复用同一套 FIFO 批次数据
- `computeDashboardStats` 现在会**全局回溯**所有交割单，用 FIFO 结果回填每一天、每一只股票、每一个月的真实盈亏。
- Dashboard 中的「净盈亏」列标题统一改为「**已实现盈亏**」，语义更准确。
- `plan-audit.ts` 也统一调用 `computeDashboardStats`，确保 LLM 看到的每日盈亏数据准确。

**验证：**
- 全部 21 个单元测试通过（含更新后的 FIFO 盈亏断言）
- TypeScript 0 错误
- Vite + Tauri build 成功

---

## v0.4.0 — 2026-04-15

### 新增功能：交易计划审计

在左侧导航栏新增了「**计划审计**」独立入口（位于「统计看板」与「深度复盘」之间）。

**功能说明：**
- AI 自动读取 `raw/日复盘/` 中的「**明日计划**」，与次日（或最近交易日）的实际交割单进行对比。
- 输出 5 种执行状态标签：
  - 🟢 **完全执行** — 计划与实际一致
  - 🟡 **部分执行** — 有计划但执行不完整，或有额外操作
  - 🔴 **严重偏离** — 违反计划（如计划观望却追高、计划卖出却买入等）
  - 🔵 **无交易** — 有计划但次日未交易
  - ⚪ **即兴交易** — 无计划但有交易
- 支持选择审计范围：最近 7 天 / 30 天 / 90 天 / 一年。
- 顶部展示 4 个核心指标：审计天数、完全执行天数、严重偏离天数、即兴交易次数。
- 每条审计结果均可展开，查看 AI 分析详情、原始计划文本与实际交易摘要。

**使用前提：**
- 需要在「设置」中配置 LLM（OpenAI / Anthropic / Ollama / 自定义端点）。
- 需要在 `raw/日复盘/` 中写有包含「## 五、明日计划」的复盘文件，并导入对应的交割单。

---

## v0.3.1 — 2026-04-15

### 修复：Dashboard 当前持仓页白屏（React Error #310）

- **根因**：`useMemo` 被放置在条件提前返回（`if (loading)` / `if (!project)`）之后，当状态变化导致提前返回时，React Hook 调用顺序不一致，触发 Error #310（Rendered more hooks than during the previous render）。
- **修复**：将 `useMemo` 与价格记录构造逻辑全部移至组件顶部，确保在所有条件分支之前执行。

---

## v0.3.0 — 2026-04-15

### 新增功能：当前持仓（Holdings Dashboard）

在「统计看板」中新增「**当前持仓**」标签页。

**功能说明：**
- 基于 FIFO 先进先出算法，自动从全部历史交割单计算出当前持有的股票、数量与成本均价。
- 买入成本包含手续费与过户费，卖出时按最早买入批次扣减持仓。
- 表格中支持手动输入每只股票的市场价格，实时计算：
  - **持仓市值** = 市价 × 持股数
  - **浮动盈亏** = (市价 - 成本均价) × 持股数
- 顶部展示持仓 KPI：持仓股票数、持仓总市值、持仓总成本、总浮动盈亏。

---

## 安装包说明

每次构建会生成两个安装文件：

| 文件名 | 说明 |
|--------|------|
| `Trading Review Wiki_x.x.x_x64-setup.exe` | **推荐** — NSIS 安装程序，支持自定义安装路径与卸载 |
| `Trading Review Wiki_x.x.x_x64_en-US.msi` | Windows Installer 包，适合企业批量部署 |

> 所有安装包均不含数字签名，首次安装时 Windows 可能会弹出「未知发布者」提示，点击「更多信息」→「仍要运行」即可。
