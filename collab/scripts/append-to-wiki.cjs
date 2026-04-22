#!/usr/bin/env node
/**
 * 通用 Wiki 内容追加写入脚本
 *
 * 用法: node append-to-wiki.cjs --content "分析内容" --date 2026-04-22 --target daily-report
 *
 * 特性:
 * - 追加写入（不覆盖已有内容）
 * - 按时间戳标记每次追加
 * - 自动去重（基于内容hash）
 * - 文件大小控制（超过阈值自动分段）
 * - 写入失败不影响主流程
 * - 支持从环境变量或命令行参数读取 Wiki 根目录
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 配置：优先从环境变量读取，其次命令行参数，最后fallback
const WIKI_ROOT = process.env.WIKI_ROOT || 'C:/Users/<你的用户名>/Documents/<你的Wiki工作区名>';
const MAX_FILE_SIZE = 100 * 1024; // 100KB per file, 超过则分段

// 目标文件映射
const TARGET_MAP = {
  'daily-report': 'raw/openclaw数据/{DATE}/daily-report.md',
  'quick-report': 'raw/openclaw数据/{DATE}/quick-report.md',
  'mindset': 'raw/openclaw数据/{DATE}/mindset.md',
  'position-tracking': 'wiki/position-tracking.md',
};

// 解析参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      options[key] = value;
      if (value !== true) i++;
    }
  }
  return options;
}

// 生成内容hash（用于去重）
function contentHash(text) {
  const cleaned = text.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '').trim();
  return crypto.createHash('md5').update(cleaned).digest('hex').slice(0, 12);
}

// 获取当前日期
function getDateString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() + 8 * 60;
  const local = new Date(now.getTime() + offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

// 获取当前时间
function getTimeString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() + 8 * 60;
  const local = new Date(now.getTime() + offset * 60 * 1000);
  return local.toISOString().replace('T', ' ').slice(0, 19);
}

// 检查内容是否已存在（去重）
function isDuplicate(filePath, hash) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.includes(`hash:${hash}`);
}

// 确定写入文件（处理分段）
function getTargetFile(basePath) {
  let filePath = basePath;
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      let part = 2;
      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      while (fs.existsSync(path.join(dir, `${base}-part${part}${ext}`))) {
        const partStats = fs.statSync(path.join(dir, `${base}-part${part}${ext}`));
        if (partStats.size <= MAX_FILE_SIZE) {
          filePath = path.join(dir, `${base}-part${part}${ext}`);
          break;
        }
        part++;
      }
      if (!filePath.includes('-part')) {
        filePath = path.join(dir, `${base}-part${part}${ext}`);
      }
    }
  }
  return filePath;
}

// 写入frontmatter（新文件时）
function ensureFrontmatter(filePath, title, dateStr) {
  if (!fs.existsSync(filePath)) {
    const frontmatter = `---\ntitle: ${title} ${dateStr}\ncreated: ${dateStr}\ntype: openclaw-report\nstatus: 活跃\ningested: false\n---\n\n# ${title} ${dateStr}\n\n`;
    fs.writeFileSync(filePath, frontmatter, 'utf-8');
  }
}

// 主函数
function main() {
  const options = parseArgs();
  const content = options.content || options.c;
  const dateStr = options.date || options.d || getDateString();
  const target = options.target || options.t || 'daily-report';

  if (!content || content.trim().length === 0) {
    console.log(JSON.stringify({ success: true, message: '内容为空，跳过写入', skipped: true }));
    return;
  }

  // 检查 WIKI_ROOT 是否已配置
  if (WIKI_ROOT.includes('<你的用户名>') || WIKI_ROOT.includes('<你的Wiki工作区名>')) {
    console.log(JSON.stringify({
      success: false,
      message: 'WIKI_ROOT 未配置。请设置环境变量 WIKI_ROOT 或修改脚本中的默认路径',
      error: true
    }));
    return;
  }

  try {
    const relativePath = (TARGET_MAP[target] || TARGET_MAP['daily-report']).replace('{DATE}', dateStr);
    const fullPath = path.join(WIKI_ROOT, relativePath);

    // 确保目录存在
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 去重检查
    const hash = contentHash(content);
    if (isDuplicate(fullPath, hash)) {
      console.log(JSON.stringify({ success: true, message: '内容重复，跳过写入', hash, skipped: true }));
      return;
    }

    // 确定目标文件（处理分段）
    const filePath = getTargetFile(fullPath);

    // 确保有frontmatter
    const titleMap = {
      'daily-report': '每日复盘报告',
      'quick-report': '快速复盘',
      'mindset': '心态记录',
      'position-tracking': '持仓追踪',
    };
    ensureFrontmatter(filePath, titleMap[target] || 'OpenClaw报告', dateStr);

    // 追加内容
    const timeStr = getTimeString();
    const appendBlock = `\n---\n\n## ${timeStr} 更新\n\n<!-- hash:${hash} -->\n\n${content}\n\n`;

    const existingContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    fs.writeFileSync(filePath, existingContent + appendBlock, 'utf-8');

    const fileSize = fs.statSync(filePath).size;
    console.log(JSON.stringify({
      success: true,
      message: `已追加写入 ${path.basename(filePath)}`,
      file: filePath,
      hash,
      time: timeStr,
      fileSize: `${(fileSize / 1024).toFixed(1)}KB`
    }));

  } catch (e) {
    console.log(JSON.stringify({
      success: false,
      message: `写入失败: ${e.message}`,
      error: true
    }));
  }
}

main();
