import { readFile, listDirectory } from "@/commands/fs"
import type { FileNode } from "@/types/wiki"
import { normalizePath } from "@/lib/path-utils"
import { extractFrontmatterData } from "@/lib/frontmatter"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetrievalNode {
  readonly id: string
  readonly title: string
  readonly type: string
  readonly path: string
  readonly sources: readonly string[]
  readonly outLinks: ReadonlySet<string>
  readonly inLinks: ReadonlySet<string>
}

export interface RetrievalGraph {
  readonly nodes: ReadonlyMap<string, RetrievalNode>
  readonly dataVersion: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIKILINK_REGEX = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g

const WEIGHTS = {
  directLink: 3.0,
  sourceOverlap: 4.0,
  commonNeighbor: 1.5,
  typeAffinity: 1.0,
} as const

const TYPE_AFFINITY: Record<string, Record<string, number>> = {
  entity: { concept: 1.2, entity: 0.8, source: 1.0, synthesis: 1.0, query: 0.8 },
  concept: { entity: 1.2, concept: 0.8, source: 1.0, synthesis: 1.2, query: 1.0 },
  source: { entity: 1.0, concept: 1.0, source: 0.5, query: 0.8, synthesis: 1.0 },
  query: { concept: 1.0, entity: 0.8, synthesis: 1.0, source: 0.8, query: 0.5 },
  synthesis: { concept: 1.2, entity: 1.0, source: 1.0, query: 1.0, synthesis: 0.8 },
}

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

let cachedGraph: RetrievalGraph | null = null

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------

function flattenMdFiles(nodes: readonly FileNode[]): FileNode[] {
  const files: FileNode[] = []
  for (const node of nodes) {
    if (node.is_dir && node.children) {
      files.push(...flattenMdFiles(node.children))
    } else if (!node.is_dir && node.name.endsWith(".md")) {
      files.push(node)
    }
  }
  return files
}

function fileNameToId(fileName: string): string {
  return fileName.replace(/\.md$/, "")
}

function extractGraphFrontmatter(content: string): { title: string; type: string; sources: string[] } {
  const fm = extractFrontmatterData(content)

  let title = fm?.title && typeof fm.title === "string" ? fm.title.trim() : ""
  if (!title) {
    const headingMatch = content.match(/^#\s+(.+)$/m)
    title = headingMatch ? headingMatch[1].trim() : ""
  }

  const sources = Array.isArray(fm?.sources) ? fm.sources.filter((s): s is string => typeof s === "string") : []

  return {
    title,
    type: fm?.type && typeof fm.type === "string" ? fm.type.trim().toLowerCase() : "other",
    sources,
  }
}

function extractWikilinks(content: string): string[] {
  const links: string[] = []
  const regex = new RegExp(WIKILINK_REGEX.source, "g")
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim())
  }
  return links
}

function resolveTarget(
  raw: string,
  nodeIds: ReadonlySet<string>,
): string | null {
  // Direct match
  if (nodeIds.has(raw)) return raw

  // Handle prefixed links like "股票/英维克" → match "英维克"
  const basename = raw.includes("/") ? raw.split("/").pop()! : raw
  if (nodeIds.has(basename)) return basename

  const normalized = basename.toLowerCase().replace(/\s+/g, "-")
  for (const id of nodeIds) {
    const idLower = id.toLowerCase()
    if (idLower === normalized) return id
    if (idLower === basename.toLowerCase()) return id
    if (idLower.replace(/\s+/g, "-") === normalized) return id
  }
  return null
}

function getNeighbors(node: RetrievalNode): ReadonlySet<string> {
  const neighbors = new Set<string>()
  for (const id of node.outLinks) neighbors.add(id)
  for (const id of node.inLinks) neighbors.add(id)
  return neighbors
}

function getNodeDegree(node: RetrievalNode): number {
  return node.outLinks.size + node.inLinks.size
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

export async function buildRetrievalGraph(
  projectPath: string,
  dataVersion: number = 0,
): Promise<RetrievalGraph> {
  // Return cached if version matches
  if (cachedGraph !== null && cachedGraph.dataVersion === dataVersion) {
    return cachedGraph
  }

  const wikiRoot = `${normalizePath(projectPath)}/wiki`
  let tree: FileNode[]
  try {
    tree = await listDirectory(wikiRoot)
  } catch {
    const emptyGraph: RetrievalGraph = { nodes: new Map(), dataVersion }
    cachedGraph = emptyGraph
    return emptyGraph
  }

  const mdFiles = flattenMdFiles(tree)

  // First pass: read all files and build raw node data
  const rawNodes: Array<{
    id: string
    title: string
    type: string
    path: string
    sources: string[]
    rawLinks: string[]
    fileName: string
  }> = []

  for (const file of mdFiles) {
    const id = fileNameToId(file.name)
    let content = ""
    try {
      content = await readFile(file.path)
    } catch {
      continue
    }

    const fm = extractGraphFrontmatter(content)
    rawNodes.push({
      id,
      title: fm.title || file.name.replace(/\.md$/, "").replace(/-/g, " "),
      type: fm.type,
      path: file.path,
      sources: fm.sources,
      rawLinks: extractWikilinks(content),
      fileName: file.name,
    })
  }

  const nodeIds = new Set(rawNodes.map((n) => n.id))

  // Second pass: resolve links and build graph nodes
  const outLinksMap = new Map<string, Set<string>>()
  const inLinksMap = new Map<string, Set<string>>()

  for (const id of nodeIds) {
    outLinksMap.set(id, new Set())
    inLinksMap.set(id, new Set())
  }

  for (const raw of rawNodes) {
    for (const linkTarget of raw.rawLinks) {
      const resolvedId = resolveTarget(linkTarget, nodeIds)
      if (resolvedId === null || resolvedId === raw.id) continue
      outLinksMap.get(raw.id)!.add(resolvedId)
      inLinksMap.get(resolvedId)!.add(raw.id)
    }
  }

  // Build immutable nodes map
  const nodes = new Map<string, RetrievalNode>()
  for (const raw of rawNodes) {
    nodes.set(raw.id, {
      id: raw.id,
      title: raw.title,
      type: raw.type,
      path: raw.path,
      sources: Object.freeze([...raw.sources]),
      outLinks: Object.freeze(outLinksMap.get(raw.id) ?? new Set()),
      inLinks: Object.freeze(inLinksMap.get(raw.id) ?? new Set()),
    })
  }

  const graph: RetrievalGraph = { nodes, dataVersion }
  cachedGraph = graph
  return graph
}

export function calculateRelevance(
  nodeA: RetrievalNode,
  nodeB: RetrievalNode,
  graph: RetrievalGraph,
): number {
  if (nodeA.id === nodeB.id) return 0

  // Signal 1: Direct links (weight 3.0)
  const forwardLinks = nodeA.outLinks.has(nodeB.id) ? 1 : 0
  const backwardLinks = nodeB.outLinks.has(nodeA.id) ? 1 : 0
  const directLinkScore = (forwardLinks + backwardLinks) * WEIGHTS.directLink

  // Signal 2: Source overlap (weight 4.0)
  const sourcesA = new Set(nodeA.sources)
  let sharedSourceCount = 0
  for (const src of nodeB.sources) {
    if (sourcesA.has(src)) sharedSourceCount += 1
  }
  const sourceOverlapScore = sharedSourceCount * WEIGHTS.sourceOverlap

  // Signal 3: Common neighbors - Adamic-Adar (weight 1.5)
  const neighborsA = getNeighbors(nodeA)
  const neighborsB = getNeighbors(nodeB)
  let adamicAdar = 0
  for (const neighborId of neighborsA) {
    if (neighborsB.has(neighborId)) {
      const neighbor = graph.nodes.get(neighborId)
      if (neighbor) {
        const degree = getNodeDegree(neighbor)
        adamicAdar += 1 / Math.log(Math.max(degree, 2))
      }
    }
  }
  const commonNeighborScore = adamicAdar * WEIGHTS.commonNeighbor

  // Signal 4: Type affinity (weight 1.0)
  const affinityMap = TYPE_AFFINITY[nodeA.type]
  const typeAffinityScore = (affinityMap?.[nodeB.type] ?? 0.5) * WEIGHTS.typeAffinity

  return directLinkScore + sourceOverlapScore + commonNeighborScore + typeAffinityScore
}

export function getRelatedNodes(
  nodeId: string,
  graph: RetrievalGraph,
  limit: number = 5,
): ReadonlyArray<{ node: RetrievalNode; relevance: number }> {
  const sourceNode = graph.nodes.get(nodeId)
  if (!sourceNode) return []

  const scored: Array<{ node: RetrievalNode; relevance: number }> = []
  for (const [id, node] of graph.nodes) {
    if (id === nodeId) continue
    const relevance = calculateRelevance(sourceNode, node, graph)
    if (relevance > 0) {
      scored.push({ node, relevance })
    }
  }

  scored.sort((a, b) => b.relevance - a.relevance)
  return scored.slice(0, limit)
}

export function clearGraphCache(): void {
  cachedGraph = null
}
