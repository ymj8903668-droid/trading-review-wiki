import { readFile, writeFile, listDirectory, copyDirectory, deleteFile, renameFile } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"

export interface DoctorIssue {
  type: "duplicate_index" | "duplicate_folder" | "loose_file" | "pinyin_name" | "link_format"
  severity: "auto" | "confirm" | "conflict"
  description: string
  details: string[]
}

export interface LinkFix {
  filePath: string
  oldLink: string
  newLink: string
}

export interface DoctorPlan {
  autoOps: AutoOperation[]
  moves: FileMove[]
  conflicts: FileConflict[]
  indexMerge: IndexMergePlan | null
  pinyinFiles: PinyinFile[]
  linkFixes: LinkFix[]
  prefixFixes: LinkFix[]
}

export interface AutoOperation {
  type: "merge_index" | "delete_empty_dir" | "dedup_file" | "fix_link"
  description: string
}

export interface FileMove {
  from: string
  to: string
  reason: string
}

export interface FileConflict {
  basename: string
  pathA: string
  pathB: string
  sizeA: number
  sizeB: number
  suggestion: "keep-a" | "keep-b" | "keep-both" | null
}

export interface IndexMergePlan {
  keep: string
  delete: string[]
  uniqueLinks: string[]
}

export interface PinyinFile {
  path: string
  basename: string
  suggestedName: string | null
}

export interface DoctorResult {
  success: boolean
  backupPath: string
  operationsApplied: number
  errors: string[]
}

const FOLDER_MERGE_MAP: Record<string, string> = {
  stock: "股票",
  stocks: "股票",
  concepts: "概念",
  entities: "概念",
}

const DIR_TYPE_MAP: Record<string, string> = {
  股票: "股票",
  概念: "概念",
  模式: "模式",
  策略: "策略",
  人物: "人物",
  错误: "错误",
  总结: "总结",
  预测: "预测",
  进化: "进化",
  查询: "查询",
  来源: "sources",
}

function extractFrontmatter(content: string): Record<string, unknown> | null {
  // Try wrapped format: ```yaml\n---\n...\n---\n```
  const wrapped = content.match(/^```yaml\n---\n([\s\S]*?)\n---\n```\n/)
  if (wrapped) {
    return parseYaml(wrapped[1])
  }
  // Try standard format: ---\n...\n---
  const standard = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (standard) {
    return parseYaml(standard[1])
  }
  return null
}

function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yaml.split("\n")
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/)
    if (match) {
      const key = match[1]
      const value = match[2].trim()
      if (value.startsWith("[") && value.endsWith("]")) {
        result[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      } else {
        result[key] = value.replace(/^["']|["']$/g, "")
      }
    }
  }
  return result
}

function isPinyin(name: string): boolean {
  // Heuristic: if filename has no Chinese chars but looks like pinyin
  const stem = name.replace(/\.md$/i, "")
  if (/[\u4e00-\u9fa5]/.test(stem)) return false
  // Pure ASCII, length > 5, no spaces → likely pinyin
  return /^[a-zA-Z]+$/.test(stem) && stem.length > 5
}

function extractChineseTitle(content: string): string | null {
  // From frontmatter title
  const fm = extractFrontmatter(content)
  if (fm?.title && typeof fm.title === "string") {
    const title = fm.title.trim()
    if (/[\u4e00-\u9fa5]/.test(title)) return title
  }
  // From first H1
  const h1 = content.match(/^#\s+(.+)$/m)
  if (h1) {
    const title = h1[1].trim()
    if (/[\u4e00-\u9fa5]/.test(title)) return title
  }
  return null
}

function computeHash(content: string): string {
  // Simple hash for content comparison
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return hash.toString(16)
}

export async function scanWiki(wikiPath: string): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = []
  const pp = normalizePath(wikiPath)

  // 1. Check for duplicate indexes
  const rootFiles = await listDirectory(pp)
  // Normalize all paths from listDirectory (Windows returns \ separators)
  for (const f of rootFiles) {
    f.path = normalizePath(f.path)
    if (f.children) {
      for (const c of f.children) {
        c.path = normalizePath(c.path)
      }
    }
  }
  const indexFiles = rootFiles.filter(
    (f) =>
      !f.is_dir &&
      (f.name === "index.md" ||
        f.name === "交易复盘知识库索引.md" ||
        f.name === "索引.md"),
  )

  if (indexFiles.length > 1) {
    const details = indexFiles.map((f) => `${f.name} (${Math.round(f.path.length / 1024)}KB)`)
    issues.push({
      type: "duplicate_index",
      severity: "auto",
      description: `发现 ${indexFiles.length} 个索引文件`,
      details,
    })
  }

  // 2. Check for duplicate folders
  const dirs = rootFiles.filter((f) => f.is_dir)
  const dirNames = dirs.map((d) => d.name)

  for (const [en, cn] of Object.entries(FOLDER_MERGE_MAP)) {
    const hasEn = dirNames.includes(en)
    const hasCn = dirNames.includes(cn)
    if (hasEn && hasCn) {
      const enCount = dirs.find((d) => d.name === en)?.children?.length ?? 0
      const cnCount = dirs.find((d) => d.name === cn)?.children?.length ?? 0
      issues.push({
        type: "duplicate_folder",
        severity: "confirm",
        description: `发现重复文件夹：${en}/ 和 ${cn}/`,
        details: [`${en}/ 有 ${enCount} 个文件`, `${cn}/ 有 ${cnCount} 个文件`, `建议合并到 ${cn}/`],
      })
    }
  }

  // 3. Check for loose .md files in root
  const looseFiles = rootFiles.filter(
    (f) =>
      !f.is_dir &&
      f.name.endsWith(".md") &&
      f.name !== "index.md" &&
      f.name !== "overview.md" &&
      f.name !== "log.md",
  )

  if (looseFiles.length > 0) {
    const typed: string[] = []
    const untyped: string[] = []

    for (const f of looseFiles) {
      try {
        const content = await readFile(f.path)
        const fm = extractFrontmatter(content)
        if (fm?.type && typeof fm.type === "string") {
          typed.push(`${f.name} → ${DIR_TYPE_MAP[fm.type] ?? fm.type}/`)
        } else {
          untyped.push(f.name)
        }
      } catch {
        untyped.push(f.name)
      }
    }

    if (typed.length > 0) {
      issues.push({
        type: "loose_file",
        severity: "confirm",
        description: `根目录有 ${typed.length} 个文件可归类到子目录`,
        details: typed,
      })
    }
  }

  // 4. Check for pinyin filenames in stock folders
  for (const folder of ["stock", "stocks", "股票"]) {
    const folderNode = dirs.find((d) => d.name === folder)
    if (!folderNode?.children) continue

    const pinyinFiles = folderNode.children.filter(
      (f) => !f.is_dir && isPinyin(f.name),
    )

    if (pinyinFiles.length > 0) {
      issues.push({
        type: "pinyin_name",
        severity: "confirm",
        description: `${folder}/ 中有 ${pinyinFiles.length} 个拼音文件名`,
        details: pinyinFiles.map((f) => f.name),
      })
    }
  }

  return issues
}

export async function generatePlan(
  wikiPath: string,
): Promise<DoctorPlan> {
  const pp = normalizePath(wikiPath)
  const plan: DoctorPlan = {
    autoOps: [],
    moves: [],
    conflicts: [],
    indexMerge: null,
    pinyinFiles: [],
    linkFixes: [],
    prefixFixes: [],
  }

  const rootFiles = await listDirectory(pp)
  // Normalize all paths from listDirectory (Windows returns \ separators)
  for (const f of rootFiles) {
    f.path = normalizePath(f.path)
    if (f.children) {
      for (const c of f.children) {
        c.path = normalizePath(c.path)
      }
    }
  }
  const dirs = rootFiles.filter((f) => f.is_dir)
  const dirNames = dirs.map((d) => d.name)

  // ── 1. Index merge ──
  const indexFiles = rootFiles.filter(
    (f) =>
      !f.is_dir &&
      (f.name === "index.md" ||
        f.name === "交易复盘知识库索引.md" ||
        f.name === "索引.md"),
  )

  if (indexFiles.length > 1) {
    // Sort by modified time (we don't have mtime, use path length as proxy for size)
    // In practice, index.md is usually the largest/most recent
    const keep = indexFiles.find((f) => f.name === "index.md") ?? indexFiles[0]
    const deleteFiles = indexFiles.filter((f) => f.name !== keep.name)

    // Extract unique links from other indexes
    const uniqueLinks: string[] = []
    const keepContent = await readFile(keep.path)
    const keepLinks = new Set(extractWikiLinks(keepContent))

    for (const df of deleteFiles) {
      try {
        const content = await readFile(df.path)
        const links = extractWikiLinks(content)
        for (const link of links) {
          if (!keepLinks.has(link)) {
            uniqueLinks.push(link)
          }
        }
      } catch {
        // ignore
      }
    }

    plan.indexMerge = {
      keep: keep.path,
      delete: deleteFiles.map((f) => f.path),
      uniqueLinks,
    }

    plan.autoOps.push({
      type: "merge_index",
      description: `合并 ${indexFiles.length} 个索引 → ${keep.name}`,
    })
  }

  // ── 2. Folder merges ──
  for (const [en, cn] of Object.entries(FOLDER_MERGE_MAP)) {
    if (!dirNames.includes(en) || !dirNames.includes(cn)) continue

    const enDir = dirs.find((d) => d.name === en)
    const cnDir = dirs.find((d) => d.name === cn)
    if (!enDir?.children) continue

    for (const file of enDir.children) {
      if (file.is_dir) continue

      const basename = file.name
      const fromPath = file.path
      const toPath = `${pp}/${cn}/${basename}`

      // Check if same file exists in target
      const existsInTarget = cnDir?.children?.some((c) => c.name === basename)

      if (existsInTarget) {
        // Compare content
        try {
          const contentA = await readFile(fromPath)
          const contentB = await readFile(toPath)
          const hashA = computeHash(contentA)
          const hashB = computeHash(contentB)

          if (hashA === hashB) {
            plan.autoOps.push({
              type: "dedup_file",
              description: `删除重复文件 ${en}/${basename}（内容与 ${cn}/ 相同）`,
            })
            plan.moves.push({
              from: fromPath,
              to: "__DELETE__",
              reason: "内容与目标文件夹中的文件相同",
            })
          } else {
            plan.conflicts.push({
              basename,
              pathA: fromPath,
              pathB: toPath,
              sizeA: contentA.length,
              sizeB: contentB.length,
              suggestion: null,
            })
          }
        } catch {
          // If can't read, treat as conflict
          plan.conflicts.push({
            basename,
            pathA: fromPath,
            pathB: toPath,
            sizeA: 0,
            sizeB: 0,
            suggestion: null,
          })
        }
      } else {
        plan.moves.push({
          from: fromPath,
          to: toPath,
          reason: `从 ${en}/ 合并到 ${cn}/`,
        })
      }
    }

    // Mark empty dir for deletion
    plan.autoOps.push({
      type: "delete_empty_dir",
      description: `删除空文件夹 ${en}/`,
    })
    plan.moves.push({
      from: `${pp}/${en}`,
      to: "__DELETE__",
      reason: "合并后删除空文件夹",
    })
  }

  // ── 3. Loose files → typed dirs ──
  const looseFiles = rootFiles.filter(
    (f) =>
      !f.is_dir &&
      f.name.endsWith(".md") &&
      f.name !== "index.md" &&
      f.name !== "overview.md" &&
      f.name !== "log.md",
  )

  // Build a map of basename -> target directory from existing subdirectories
  const basenameToTargetDir = new Map<string, string>()
  for (const dir of dirs) {
    if (!dir.children) continue
    for (const child of dir.children) {
      if (child.is_dir) continue
      const basename = child.name.replace(/\.md$/i, "")
      // Only record if not already recorded (first wins, or could track multiple)
      if (!basenameToTargetDir.has(basename)) {
        basenameToTargetDir.set(basename, dir.name)
      }
    }
  }

  for (const f of looseFiles) {
    const basename = f.name.replace(/\.md$/i, "")
    let moved = false

    try {
      const content = await readFile(f.path)
      const fm = extractFrontmatter(content)
      const type = fm?.type as string | undefined

      if (type && DIR_TYPE_MAP[type]) {
        const targetDir = DIR_TYPE_MAP[type]
        const targetPath =
          targetDir === "./"
            ? `${pp}/${f.name}`
            : `${pp}/${targetDir}/${f.name}`

        if (targetPath !== f.path) {
          // Check if target already exists
          const targetExists = basenameToTargetDir.has(basename)
          if (targetExists) {
            // Same name exists in target dir -> conflict
            plan.conflicts.push({
              basename: f.name,
              pathA: f.path,
              pathB: targetPath,
              sizeA: content.length,
              sizeB: 0, // Will read later if needed
              suggestion: null,
            })
          } else {
            plan.moves.push({
              from: f.path,
              to: targetPath,
              reason: `frontmatter type="${type}" → ${targetDir}/`,
            })
          }
          moved = true
        }
      }
    } catch {
      // ignore
    }

    // If not moved by frontmatter, check if same basename exists in a subdirectory
    if (!moved && basenameToTargetDir.has(basename)) {
      const targetDir = basenameToTargetDir.get(basename)!
      const targetPath = `${pp}/${targetDir}/${f.name}`

      if (targetPath !== f.path) {
        // Read both files to compare
        try {
          const rootContent = await readFile(f.path)
          const dirContent = await readFile(targetPath)
          const hashA = computeHash(rootContent)
          const hashB = computeHash(dirContent)

          if (hashA === hashB) {
            // Same content, just delete root file
            plan.autoOps.push({
              type: "dedup_file",
              description: `删除根目录重复文件 ${f.name}（内容与 ${targetDir}/ 相同）`,
            })
            plan.moves.push({
              from: f.path,
              to: "__DELETE__",
              reason: `内容与 ${targetDir}/${f.name} 相同`,
            })
          } else {
            // Different content, mark as conflict
            plan.conflicts.push({
              basename: f.name,
              pathA: f.path,
              pathB: targetPath,
              sizeA: rootContent.length,
              sizeB: dirContent.length,
              suggestion: null,
            })
          }
        } catch {
          // Can't read, treat as conflict
          plan.conflicts.push({
            basename: f.name,
            pathA: f.path,
            pathB: targetPath,
            sizeA: 0,
            sizeB: 0,
            suggestion: null,
          })
        }
      }
    }
  }

  // ── 4. Pinyin files ──
  for (const folder of ["stock", "stocks", "股票"]) {
    const folderNode = dirs.find((d) => d.name === folder)
    if (!folderNode?.children) continue

    for (const file of folderNode.children) {
      if (file.is_dir || !isPinyin(file.name)) continue

      try {
        const content = await readFile(file.path)
        const suggestedName = extractChineseTitle(content)
        plan.pinyinFiles.push({
          path: file.path,
          basename: file.name,
          suggestedName: suggestedName
            ? `${suggestedName}.md`
            : null,
        })
      } catch {
        plan.pinyinFiles.push({
          path: file.path,
          basename: file.name,
          suggestedName: null,
        })
      }
    }
  }

  // ── 5. Link fixes ──
  // Collect all file basenames for link resolution
  const allBasenames = new Set<string>()
  const allPrefixedPaths = new Set<string>()

  function collectFiles(nodes: typeof rootFiles, prefix: string) {
    for (const node of nodes) {
      if (node.is_dir && node.children) {
        collectFiles(node.children, prefix ? `${prefix}/${node.name}` : node.name)
      } else if (!node.is_dir && node.name.endsWith(".md")) {
        allBasenames.add(node.name.replace(/\.md$/i, ""))
        allPrefixedPaths.add(prefix ? `${prefix}/${node.name.replace(/\.md$/i, "")}` : node.name.replace(/\.md$/i, ""))
      }
    }
  }

  collectFiles(rootFiles, "")

  // Map old English prefixes to Chinese directories
  const OLD_PREFIX_MAP: Record<string, string> = {
    stock: "股票",
    stocks: "股票",
    concepts: "概念",
    entities: "概念",
  }

  // Collect all .md file paths for scanning
  const allMdFiles: { path: string; content: string }[] = []
  function collectMdFiles(nodes: typeof rootFiles) {
    for (const node of nodes) {
      if (node.is_dir && node.children) {
        collectMdFiles(node.children)
      } else if (!node.is_dir && node.name.endsWith(".md")) {
        allMdFiles.push({ path: node.path, content: "" })
      }
    }
  }
  collectMdFiles(rootFiles)

  // Read all .md files and find links to fix
  const linkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  for (const mdFile of allMdFiles) {
    try {
      const content = await readFile(mdFile.path)
      mdFile.content = content
      let match
      while ((match = linkRegex.exec(content)) !== null) {
        const link = match[1].trim()
        // Check if link uses old folder prefix
        const prefixMatch = link.match(/^([a-zA-Z]+)\//)
        if (prefixMatch) {
          const oldPrefix = prefixMatch[1]
          const newPrefix = OLD_PREFIX_MAP[oldPrefix]
          if (newPrefix) {
            const basename = link.replace(/^[a-zA-Z]+\//, "")
            const newLink = `${newPrefix}/${basename}`
            // Only fix if target exists (either as prefixed path or basename)
            if (allPrefixedPaths.has(newLink) || allBasenames.has(basename)) {
              const display = match[2]
              const newLinkText = display ? `[[${newLink}|${display}]]` : `[[${newLink}]]`
              plan.linkFixes.push({
                filePath: mdFile.path,
                oldLink: match[0],
                newLink: newLinkText,
              })
            }
          }
        }
      }
    } catch {
      // ignore unreadable files
    }
  }

  if (plan.linkFixes.length > 0) {
    // Group by file for description
    const fileCount = new Set(plan.linkFixes.map((f) => f.filePath)).size
    plan.autoOps.push({
      type: "fix_link",
      description: `修复 ${plan.linkFixes.length} 个旧格式链接（涉及 ${fileCount} 个文件）`,
    })
  }

  // ── 7. Prefix fixes: add directory prefix to unprefixed links ──
  // Build basename -> directories map (excluding root)
  const basenameToDirs = new Map<string, string[]>()
  function collectBasenames(nodes: typeof rootFiles, currentDir: string) {
    for (const node of nodes) {
      if (node.is_dir && node.children) {
        collectBasenames(node.children, node.name)
      } else if (!node.is_dir && node.name.endsWith(".md") && currentDir) {
        // Ensure basename is just the filename, no path
        const basename = node.name.replace(/\.md$/i, "").split("/").pop()!
        const list = basenameToDirs.get(basename) ?? []
        list.push(currentDir)
        basenameToDirs.set(basename, list)
      }
    }
  }
  collectBasenames(rootFiles, "")

  // Also collect root-level files to detect ambiguity
  const rootBasenames = new Set<string>()
  for (const node of rootFiles) {
    if (!node.is_dir && node.name.endsWith(".md")) {
      rootBasenames.add(node.name.replace(/\.md$/i, "").split("/").pop()!)
    }
  }

  // Use a fresh regex to avoid state pollution from earlier loops
  const prefixRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  for (const mdFile of allMdFiles) {
    // Skip files that failed to read
    if (!mdFile.content) continue
    let match
    prefixRegex.lastIndex = 0
    while ((match = prefixRegex.exec(mdFile.content)) !== null) {
      const link = match[1].trim()
      // Only process unprefixed links (no "/" in link target)
      if (!link.includes("/")) {
        const dirs = basenameToDirs.get(link)
        // Only add prefix if:
        // 1. File exists in exactly one subdirectory
        // 2. Root directory does NOT have a file with the same name (ambiguous)
        if (dirs && dirs.length === 1 && !rootBasenames.has(link)) {
          const newLink = `${dirs[0]}/${link}`
          const display = match[2]
          const newLinkText = display ? `[[${newLink}|${display}]]` : `[[${newLink}]]`
          plan.prefixFixes.push({
            filePath: mdFile.path,
            oldLink: match[0],
            newLink: newLinkText,
          })
        }
      }
    }
  }

  if (plan.prefixFixes.length > 0) {
    const fileCount = new Set(plan.prefixFixes.map((f) => f.filePath)).size
    plan.autoOps.push({
      type: "fix_link",
      description: `统一 ${plan.prefixFixes.length} 个无前缀链接格式（涉及 ${fileCount} 个文件）`,
    })
  }

  return plan
}

function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  const links: string[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim())
  }
  return links
}

export async function executePlan(
  wikiPath: string,
  plan: DoctorPlan,
  conflictResolutions: Record<string, "keep-a" | "keep-b" | "keep-both">,
  pinyinRenames: Record<string, string>,
): Promise<DoctorResult> {
  const pp = normalizePath(wikiPath)
  const timestamp = Date.now()
  const backupPath = `${pp}/../wiki-backup-${timestamp}`
  const errors: string[] = []
  let operationsApplied = 0

  // Step 1: Backup
  try {
    await copyDirectory(pp, backupPath)
  } catch (e) {
    return {
      success: false,
      backupPath: "",
      operationsApplied: 0,
      errors: [`备份失败: ${e}`],
    }
  }

  // Step 2: Execute auto ops (index merge)
  if (plan.indexMerge) {
    try {
      const keepContent = await readFile(plan.indexMerge.keep)
      let newContent = keepContent

      // Append unique links if any
      if (plan.indexMerge.uniqueLinks.length > 0) {
        const linksSection =
          "\n\n---\n\n## 历史归档链接（自动合并）\n\n" +
          plan.indexMerge.uniqueLinks.map((l) => `- [[${l}]]`).join("\n")
        newContent = newContent + linksSection
      }

      await writeFile(plan.indexMerge.keep, newContent)
      operationsApplied++

      // Delete old indexes
      for (const delPath of plan.indexMerge.delete) {
        try {
          await deleteFile(delPath)
          operationsApplied++
        } catch (e) {
          errors.push(`删除索引失败 ${delPath}: ${e}`)
        }
      }
    } catch (e) {
      errors.push(`合并索引失败: ${e}`)
    }
  }

  // Helper to check if a path still exists (using readFile as proxy)
  async function pathExists(path: string): Promise<boolean> {
    try {
      await readFile(path)
      return true
    } catch {
      return false
    }
  }

  // Step 3: Handle conflicts first (before moves, while source files still exist)
  for (const conflict of plan.conflicts) {
    const resolution = conflictResolutions[conflict.basename]
    if (!resolution) {
      errors.push(`冲突未解决: ${conflict.basename}`)
      continue
    }

    // Skip if source no longer exists
    const existsA = await pathExists(conflict.pathA)
    if (!existsA) {
      continue
    }

    try {
      if (resolution === "keep-a") {
        await deleteFile(conflict.pathB)
        await renameFile(conflict.pathA, conflict.pathB)
      } else if (resolution === "keep-b") {
        await deleteFile(conflict.pathA)
      } else if (resolution === "keep-both") {
        const newName = conflict.pathB.replace(/\.md$/, "-2.md")
        await renameFile(conflict.pathA, newName)
      }
      operationsApplied++
    } catch (e) {
      errors.push(`处理冲突失败 ${conflict.basename}: ${e}`)
    }
  }

  // Step 4: Rename pinyin files that are NOT being moved (root-level pinyin files)
  const movedPaths = new Set(plan.moves.map((m) => m.from))
  for (const pf of plan.pinyinFiles) {
    // Skip if this file will be moved (pinyin rename is handled during move)
    if (movedPaths.has(pf.path)) continue

    const newName = pinyinRenames[pf.path]
    if (!newName || newName === pf.basename) continue

    // Skip if source no longer exists
    const exists = await pathExists(pf.path)
    if (!exists) {
      continue
    }

    try {
      const dir = pf.path.substring(0, pf.path.lastIndexOf("/"))
      const newPath = normalizePath(`${dir}/${newName}`)
      await renameFile(pf.path, newPath)
      operationsApplied++
    } catch (e) {
      errors.push(`重命名失败 ${pf.basename}: ${e}`)
    }
  }

  // Step 5: Execute moves (with pinyin rename integrated)
  for (const move of plan.moves) {
    // Skip if source no longer exists (may have been processed in conflict resolution)
    const exists = await pathExists(move.from)
    if (!exists) {
      continue
    }

    if (move.to === "__DELETE__") {
      try {
        await deleteFile(move.from)
        operationsApplied++
      } catch (e) {
        errors.push(`删除失败 ${move.from}: ${e}`)
      }
      continue
    }

    // Check if this file has a pinyin rename pending
    const pinyinRename = plan.pinyinFiles.find((pf) => pf.path === move.from)
    const newName = pinyinRename ? pinyinRenames[pinyinRename.path] : null

    let finalTo = move.to
    if (newName && newName !== pinyinRename?.basename) {
      // Apply pinyin rename to the destination path
      const dir = move.to.substring(0, move.to.lastIndexOf("/"))
      finalTo = normalizePath(`${dir}/${newName}`)
    }

    try {
      await renameFile(move.from, finalTo)
      operationsApplied++
    } catch (e) {
      errors.push(`移动失败 ${move.from} → ${finalTo}: ${e}`)
    }
  }

  // Step 5: Fix links in all .md files
  if (plan.linkFixes.length > 0) {
    // Group fixes by file
    const fixesByFile = new Map<string, { oldLink: string; newLink: string }[]>()
    for (const fix of plan.linkFixes) {
      const list = fixesByFile.get(fix.filePath) ?? []
      list.push({ oldLink: fix.oldLink, newLink: fix.newLink })
      fixesByFile.set(fix.filePath, list)
    }

    for (const [filePath, fixes] of fixesByFile) {
      // Skip if file no longer exists
      const exists = await pathExists(filePath)
      if (!exists) {
        continue
      }

      try {
        let content = await readFile(filePath)
        let modified = false
        for (const fix of fixes) {
          if (content.includes(fix.oldLink)) {
            content = content.replace(fix.oldLink, fix.newLink)
            modified = true
          }
        }
        if (modified) {
          await writeFile(filePath, content)
          operationsApplied++
        }
      } catch (e) {
        errors.push(`修复链接失败 ${filePath}: ${e}`)
      }
    }
  }

  // Step 6: Fix prefix links (add directory prefix to unprefixed links)
  if (plan.prefixFixes.length > 0) {
    const fixesByFile = new Map<string, { oldLink: string; newLink: string }[]>()
    for (const fix of plan.prefixFixes) {
      const list = fixesByFile.get(fix.filePath) ?? []
      list.push({ oldLink: fix.oldLink, newLink: fix.newLink })
      fixesByFile.set(fix.filePath, list)
    }

    for (const [filePath, fixes] of fixesByFile) {
      const exists = await pathExists(filePath)
      if (!exists) {
        continue
      }

      try {
        let content = await readFile(filePath)
        let modified = false
        for (const fix of fixes) {
          if (content.includes(fix.oldLink)) {
            content = content.replace(fix.oldLink, fix.newLink)
            modified = true
          }
        }
        if (modified) {
          await writeFile(filePath, content)
          operationsApplied++
        }
      } catch (e) {
        errors.push(`统一链接前缀失败 ${filePath}: ${e}`)
      }
    }
  }

  return {
    success: errors.length === 0,
    backupPath,
    operationsApplied,
    errors,
  }
}
