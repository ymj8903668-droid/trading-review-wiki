import { readFile, writeFile, createDirectory } from "@/commands/fs"
import type { OpeningPosition } from "./trade-stats"

const FILENAME = "opening-positions.json"

function getPath(projectPath: string): string {
  return `${projectPath}/.llm-wiki/${FILENAME}`
}

export async function loadOpeningPositions(projectPath: string): Promise<OpeningPosition[]> {
  try {
    const content = await readFile(getPath(projectPath))
    const parsed = JSON.parse(content) as OpeningPosition[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is OpeningPosition =>
        typeof p.code === "string" &&
        typeof p.name === "string" &&
        typeof p.quantity === "number" &&
        typeof p.avgCost === "number" &&
        typeof p.asOfDate === "string"
    )
  } catch {
    return []
  }
}

export async function saveOpeningPositions(
  projectPath: string,
  positions: OpeningPosition[]
): Promise<void> {
  await createDirectory(`${projectPath}/.llm-wiki`).catch(() => {})
  await writeFile(getPath(projectPath), JSON.stringify(positions, null, 2))
}
