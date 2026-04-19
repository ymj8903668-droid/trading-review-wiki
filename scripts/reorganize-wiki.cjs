/**
 * Trading Review Wiki - 文件整理脚本
 * =====================================
 * 根据 frontmatter type 自动将 wiki 根目录下的 .md 文件移动到对应分类目录
 *
 * 用法:
 *   node reorganize-wiki.cjs <wiki目录路径> [选项]
 *
 * 示例:
 *   node reorganize-wiki.cjs "C:/Users/xxx/Documents/my-wiki/wiki"
 *   node reorganize-wiki.cjs "./wiki" --dry-run          # 预览模式（不执行移动）
 *   node reorganize-wiki.cjs "./wiki" --map 概念/主题=策略  # 自定义映射
 *
 * 支持的 type → directory 映射（可自定义扩展）:
 *   股票 / 个股档案   → wiki/股票/
 *   策略             → wiki/策略/
 *   模式 / 核心模式   → wiki/模式/
 *   错误             → wiki/错误/
 *   市场环境          → wiki/市场环境/
 *   进化             → wiki/进化/
 *   总结             → wiki/总结/
 *   概念 / 概念/主题  → wiki/概念/
 *   source           → wiki/sources/
 *
 * 特性:
 *   - 自动创建缺失的目标目录
 *   - 目标已存在时跳过（不覆盖）
 *   - 自动更新所有 wikilink 引用 ([[文件名]] → [[目录/文件名]])
 *   - 支持 --- 和 *** 两种 frontmatter 分隔符
 *   - 预览模式可安全查看将要执行的操作
 */

const fs = require('fs')
const path = require('path')

// ====== 默认 type → directory 映射 ======
// 可以在这里添加你自己的映射规则
const DEFAULT_TYPE_MAP = {
  // 标准中文类型
  '股票': '股票',
  '策略': '策略',
  '模式': '模式',
  '错误': '错误',
  '市场环境': '市场环境',
  '进化': '进化',
  '总结': '总结',
  '概念': '概念',
  'source': 'sources',

  // LLM 历史遗留类型（兼容旧版本生成的文件）
  '个股档案': '股票',
  '核心模式': '模式',
  '概念/主题': '概念',
}

// 保留在根目录的系统文件（不会被移动）
const PROTECTED_FILES = [
  'index.md',
  'log.md',
  'overview.md',
  'schema.md',
  'purpose.md',
]

// ====== 工具函数 ======

function parseFrontmatter(content) {
  // 支持 --- 和 *** 两种 frontmatter 分隔符
  const match = content.match(/^(?:---|\*\*\*)\r?\n([\s\S]*?)\r?\n(?:---|\*\*\*)/)
  if (!match) return {}

  const fm = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    value = value.replace(/^["']|["']$/g, '')
    fm[key] = value
  }
  return fm
}

function scanAllMdFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      scanAllMdFiles(fullPath, files)
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }
  return files
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function showHelp() {
  console.log(`
Trading Review Wiki 文件整理脚本
=================================

用法: node reorganize-wiki.cjs <wiki目录路径> [选项]

选项:
  --dry-run              预览模式，只显示将要执行的操作，不实际移动文件
  --map <type>=<dir>     添加自定义 type→directory 映射（可多次使用）
  --help                 显示此帮助信息

示例:
  node reorganize-wiki.cjs "C:/Users/xxx/Documents/my-wiki/wiki"
  node reorganize-wiki.cjs "./wiki" --dry-run
  node reorganize-wiki.cjs "./wiki" --map 自定义类型=策略 --map 研报=概念
`)
}

// ====== 主程序 ======

function main() {
  const args = process.argv.slice(2)

  // 解析参数
  if (args.includes('--help') || args.length === 0) {
    showHelp()
    process.exit(args.includes('--help') ? 0 : 1)
  }

  const dryRun = args.includes('--dry-run')
  const wikiPath = args.find(a => !a.startsWith('--'))

  // 收集自定义映射
  const typeMap = { ...DEFAULT_TYPE_MAP }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--map' && args[i + 1]) {
      const [type, dir] = args[i + 1].split('=')
      if (type && dir) {
        typeMap[type.trim()] = dir.trim()
        console.log(`📝 自定义映射: "${type.trim()}" → "${dir.trim()}"`)
      }
      i++
    }
  }

  if (!wikiPath) {
    console.error('❌ 错误: 请提供 wiki 目录路径')
    showHelp()
    process.exit(1)
  }

  const resolvedWikiPath = path.resolve(wikiPath)
  if (!fs.existsSync(resolvedWikiPath)) {
    console.error(`❌ 错误: 目录不存在: ${resolvedWikiPath}`)
    process.exit(1)
  }

  if (dryRun) {
    console.log('🔍 【预览模式】不会实际移动任何文件\n')
  }

  // 1. 扫描根目录下的 .md 文件
  const rootEntries = fs.readdirSync(resolvedWikiPath, { withFileTypes: true })
  const rootFiles = rootEntries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .filter(e => !PROTECTED_FILES.includes(e.name))
    .map(e => e.name)

  if (rootFiles.length === 0) {
    console.log('✅ wiki 根目录下没有需要整理的 .md 文件')
    return
  }

  console.log(`发现 ${rootFiles.length} 个需要整理的文件:\n`)

  const moves = []

  // 2. 读取每个文件的 frontmatter，确定目标目录
  for (const file of rootFiles) {
    const filePath = path.join(resolvedWikiPath, file)
    const content = fs.readFileSync(filePath, 'utf-8')
    const fm = parseFrontmatter(content)
    const type = fm.type

    if (!type) {
      console.log(`⚠️  跳过（无 frontmatter type）: ${file}`)
      continue
    }

    const dirName = typeMap[type]
    if (!dirName) {
      console.log(`⚠️  跳过（未知 type "${type}"）: ${file}`)
      console.log(`   提示: 可用 --map "${type}=<目录名>" 添加映射，或编辑脚本中的 DEFAULT_TYPE_MAP`)
      continue
    }

    const targetDir = path.join(resolvedWikiPath, dirName)
    const targetPath = path.join(targetDir, file)

    if (!fs.existsSync(targetDir) && !dryRun) {
      fs.mkdirSync(targetDir, { recursive: true })
      console.log(`📁 创建目录: ${dirName}`)
    } else if (!fs.existsSync(targetDir) && dryRun) {
      console.log(`📁 将创建目录: ${dirName}`)
    }

    if (fs.existsSync(targetPath)) {
      console.log(`⚠️  跳过（目标已存在）: ${file} → ${dirName}/${file}`)
      continue
    }

    const baseName = file.replace(/\.md$/, '')
    moves.push({
      fileName: file,
      baseName: baseName,
      oldRef: baseName,
      newRef: `${dirName}/${baseName}`,
      from: filePath,
      to: targetPath,
      dirName: dirName,
    })

    if (dryRun) {
      console.log(`[预览] 将移动: ${file} → ${dirName}/${file}  (type: ${type})`)
    } else {
      fs.renameSync(filePath, targetPath)
      console.log(`✅ 移动: ${file} → ${dirName}/${file}  (type: ${type})`)
    }
  }

  if (moves.length === 0) {
    console.log('\n没有文件需要移动')
    return
  }

  if (dryRun) {
    console.log(`\n🔍 预览结束。${moves.length} 个文件将被移动。`)
    console.log('   去掉 --dry-run 参数即可实际执行。')
    return
  }

  // 3. 扫描所有 wiki 文件，更新 wikilink 引用
  console.log(`\n🔍 扫描所有文件更新 wikilink 引用...`)
  const allMdFiles = scanAllMdFiles(resolvedWikiPath)
  let updatedCount = 0

  for (const filePath of allMdFiles) {
    let content = fs.readFileSync(filePath, 'utf-8')
    let changed = false

    for (const move of moves) {
      // 匹配 [[旧文件名]] 或 [[旧文件名|显示文本]]
      const regex = new RegExp(
        `\\[\\[${escapeRegex(move.oldRef)}(\\|[^\\]]*)?\\]\\]`,
        'g'
      )
      if (regex.test(content)) {
        content = content.replace(regex, (match, display) => {
          return `[[${move.newRef}${display || ''}]]`
        })
        changed = true
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content)
      const relPath = path.relative(resolvedWikiPath, filePath)
      console.log(`📝 更新引用: ${relPath}`)
      updatedCount++
    }
  }

  console.log(`\n✨ 完成!`)
  console.log(`   移动了 ${moves.length} 个文件`)
  console.log(`   更新了 ${updatedCount} 个文件中的引用`)
  console.log(`\n⚠️  提示:`)
  console.log(`   1. 重新打开 Trading Review Wiki 应用刷新文件树`)
  console.log(`   2. 检查跳过的文件，手动处理重复项和无 type 的文件`)
}

main()
