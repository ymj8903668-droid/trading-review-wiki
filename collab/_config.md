# OpenClaw Wiki 对接配置
> 本文件由 OpenClaw 自动读取，用于配置数据输出路径和格式
> 复盘体系：六部分完整复盘法（大盘→主线→持仓→交易→计划→心态）

```yaml
# ============================================
# OpenClaw Wiki 数据对接配置
# ============================================

# 版本
version: "0.7.5"
last_updated: "2026-04-22"
review_framework: "六部分完整复盘法"

# Wiki根目录（固定路径）
wiki_root: "C:/Users/Administrator/Documents/杰杰杰"

# OpenClaw数据目录
openclaw_data_dir: "raw/openclaw数据"

# ============================================
# 输出路径配置
# ============================================

paths:
  # 每日报告（六部分完整复盘）
  daily_report: "raw/openclaw数据/{YYYY-MM-DD}/daily-report.md"
  
  # 快速复盘（15分钟版）
  quick_report: "raw/openclaw数据/{YYYY-MM-DD}/quick-report.md"
  
  # 持仓数据
  positions: "raw/openclaw数据/{YYYY-MM-DD}/positions.json"
  
  # 交易记录
  trades: "raw/openclaw数据/{YYYY-MM-DD}/trades.json"
  
  # 交割单
  settlements: "raw/openclaw数据/settlements/{YYYY-MM-DD}.csv"
  
  # 心态记录
  mindset: "raw/openclaw数据/{YYYY-MM-DD}/mindset.md"
  
  # 微信聊天舆情（每10分钟自动追加）
  wechat_chat: "raw/微信聊天/{YYYY-MM-DD}.md"
  wechat_chat_max_size: 102400  # 100KB，超过自动分段
  
  # Wiki可写文件
  wiki_writable:
    position_tracking: "wiki/position-tracking.md"
    
  # Wiki只读文件
  wiki_readable:
    trading_rules: "wiki/trading-rules.md"

# ============================================
# 复盘内容配置（六部分完整复盘法）
# ============================================

review_sections:
  # 第一部分：大盘环境评估
  section_1_market:
    name: "大盘环境评估"
    required_fields:
      - 上证指数涨跌幅/成交量/形态
      - 创业板指涨跌幅/成交量/形态
      - 科创50涨跌幅/成交量/形态
      - 880005涨跌家数
      - 涨停家数/跌停家数/连板家数/炸板率
      - 增量/缩量判断
      - 情绪周期阶段（冰点/反弹/强化/高潮/退潮）
      - 开盘竞价回顾
    
  # 第二部分：主线与板块分析
  section_2_sector:
    name: "主线与板块分析"
    required_fields:
      - 今日最强板块
      - 龙头个股
      - 成交额排名靠前板块
      - 板块轮动情况
      - 容量品种表现（成交额前10）
      - 赚钱效应（涨停溢价、连板溢价）
    
  # 第三部分：自选股与持仓复盘
  section_3_positions:
    name: "自选股与持仓复盘"
    required_fields:
      - 持仓个股分析（逻辑/表现/预期/计划）
      - 关注个股复盘
      - 机会回顾（共振/分时/买点）
    
  # 第四部分：交易记录与对错分析（核心）
  section_4_trades:
    name: "交易记录与对错分析"
    required_fields:
      - 买入记录（时间/价格/仓位/逻辑/买点类型）
      - 卖出记录（时间/价格/盈亏/逻辑/对错）
      - 做对的交易分析
      - 做错的交易分析（含改进措施）
      - 系统执行检查（5项检查）
      - 盈亏统计
    evaluation_principle: "不以盈亏论对错，以是否符合系统论对错"
    
  # 第五部分：明日计划
  section_5_plan:
    name: "明日计划"
    required_fields:
      - 指数预判（增量/缩量/共振）
      - 主线预判（可持续性/新主线/轮动）
      - 重点关注列表
      - 仓位计划（按环境）
      - 风险提示
      - 交易铁律提醒
    position_rules:
      增量日: "20-30%，日内新方向首板做回封"
      竞价增量日: "10%，日内新方向一字卡"
      缩量日: "0-10%，只做低位新催化首板"
    
  # 第六部分：心态与反思
  section_6_mindset:
    name: "心态与反思"
    required_fields:
      - 心态评估（4个问题）
      - 心态问题记录
      - 核心改进点
      - 今日感悟
      - 明日注意

# ============================================
# 自动任务配置
# ============================================

tasks:
  # 每日盘后完整复盘（18:00执行）
  daily_review:
    enabled: true
    time: "18:00"
    type: "完整复盘（六部分）"
    duration: "30分钟"
    files:
      - "daily-report.md"
      - "positions.json"
      - "trades.json"
      - "mindset.md"
      
  # 快速复盘（盘中或时间紧时）
  quick_review:
    enabled: true
    trigger: "manual_or_time_limited"
    type: "快速复盘（15分钟版）"
    duration: "15分钟"
    file: "quick-report.md"
    sections:
      - 大盘环境（880005+涨跌停+情绪周期）
      - 主线（板块+龙头+轮动）
      - 交易（买卖记录）
      - 对错（核心要点）
      - 明日计划（关注+仓位+注意）
      
  # 微信聊天舆情同步（每10分钟）
  wechat_chat_sync:
    enabled: true
    interval_seconds: 600
    source: "chatlog-api (10个微信群)"
    target: "raw/微信聊天/{YYYY-MM-DD}.md"
    script: "raw/openclaw数据/scripts/append-chat-to-wiki.cjs"
    features:
      - 追加写入（不覆盖）
      - 基于内容hash自动去重
      - 超过100KB自动分段
      - 写入失败不影响舆情推送
      - 每条带时间戳标记
    groups:
      - "2026"
      - "4月爆赚"
      - "财闻京华"
      - "周期有道"
      - "杰哥学霸圈🔥🔥🔥"
      - "赵毅@华创"
      - "多多短线精灵2026"
      - "2026资讯"
      - "调研纪要【禁言】"
      - "杰哥学霸圈YYDS"
    
  # 持仓实时同步（每5分钟）
  position_sync:
    enabled: true
    interval_seconds: 300
    file: "positions.json"
    
  # 交割单归档（收盘后）
  settlement_archive:
    enabled: true
    time: "18:30"
    format: "csv"
    
  # 周度Lint（每周日）
  weekly_lint:
    enabled: true
    day: "sunday"
    time: "20:00"
    duration: "30分钟"
    focus: "本周模式总结、胜率统计、系统优化"
    
  # 月度大Lint（每月末）
  monthly_lint:
    enabled: true
    trigger: "last_day_of_month"
    time: "21:00"
    duration: "1小时"
    focus: "月度总结、系统进化、下月计划"

# ============================================
# 规则阈值配置
# ============================================

rules:
  # 仓位限制
  position:
    max_sector: 0.25        # 单赛道最大25%
    max_single: 0.10        # 单票最大10%
    min_cash: 0.20          # 最小现金20%
    
  # 交易频率
  frequency:
    max_daily_trades: 30    # 单日最大30笔
    max_daily_buys: 15      # 单日最大买入15笔
    max_daily_sells: 10     # 单日最大卖出10笔
    max_simultaneous: 20    # 最大同时持仓数
    cooldown_after_sell: 24 # 卖出后冷静期24小时
    
  # 风控
  risk:
    max_daily_loss: 0.03   # 单日最大亏损3%
    hard_stop: 0.08        # 硬止损8%
    soft_stop: 0.05        # 软止损5%
    trailing_stop: 0.15    # 移动止盈15%
    fixed_exit: 0.20       # 固定止盈20%

  # 情绪信号规则
  emotion_signals:
    ice_point:              # 冰点信号
      condition: "上涨家数 < 1500"
      action: "watch_for_buy, increase_cash"
      
    recovery:               # 复苏信号
      condition: "涨停家数 > 50 & 炸板率 < 30%"
      action: "consider_buy"
      
    climax:                 # 高潮信号
      condition: "上涨家数 > 3500 | 涨停家数 > 150"
      action: "reduce_position, take_profit"
      
    retreat:                # 退潮信号
      condition: "跌停家数 > 80 | 炸板率 > 50%"
      action: "exit_positions, hold_cash"

# ============================================
# 复盘质量检查清单
# ============================================

quality_checklist:
  must_record:
    - 每一笔买、卖都要记录
    - 不以盈亏论对错，以是否符合系统论对错
    - 制定明确的可执行计划
    - 找到需要改进的地方
    
  common_mistakes_to_avoid:
    - ❌ 只看盈亏（盈亏不是对错标准）
    - ❌ 不记录（好记性不如烂笔头）
    - ❌ 不总结（同样错误重复犯）
    - ❌ 太主观（用盈亏评判对错）

# ============================================
# 复盘工具清单
# ============================================

tools:
  daily_essential:
    - name: "通达信880005"
      use: "涨跌家数，判断情绪冰点与高潮"
    - name: "逐笔成交过滤"
      use: "200手以上大单过滤，看主力行为"
    - name: "成交额排行榜"
      use: "判断容量品种和主线方向"
    - name: "开盘啦"
      use: "实时盯开盘竞价量，对比昨日量能"
    - name: "分时图"
      use: "看承接和压力，判断分时强弱"
      
  auxiliary:
    - name: "涨停板复盘"
      use: "看昨日涨停今日溢价"
    - name: "连板股排行"
      use: "看高度票和情绪核心"
    - name: "板块资金流向"
      use: "判断主线方向"
    - name: "龙虎榜"
      use: "看主多资金动向"
```
