import { homedir } from "./platform"
import type { Tab } from "./types"

export interface TabGroup {
  name: string
  rootPath: string
  tabs: { tab: Tab; index: number }[]
}

function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return homedir + p.slice(1)
  }
  return p
}

export function getTabGroup(
  filePath: string,
  containerFolders: string[],
): { name: string; rootPath: string } | null {
  for (const folder of containerFolders) {
    const expanded = expandPath(folder).replace(/\/$/, "")
    if (filePath.startsWith(expanded + "/")) {
      const rest = filePath.slice(expanded.length + 1)
      const childDir = rest.split("/")[0]
      if (childDir) {
        return { name: childDir, rootPath: expanded + "/" + childDir }
      }
    }
  }
  return null
}

export function groupTabs(
  tabs: Tab[],
  containerFolders: string[],
): { grouped: TabGroup[]; ungrouped: { tab: Tab; index: number }[] } {
  const groups = new Map<string, TabGroup>()
  const ungrouped: { tab: Tab; index: number }[] = []

  tabs.forEach((tab, index) => {
    const group = getTabGroup(tab.path, containerFolders)
    if (group) {
      if (!groups.has(group.name)) {
        groups.set(group.name, { name: group.name, rootPath: group.rootPath, tabs: [] })
      }
      groups.get(group.name)!.tabs.push({ tab, index })
    } else {
      ungrouped.push({ tab, index })
    }
  })

  const grouped: TabGroup[] = Array.from(groups.values())
    .sort((a, b) => a.name.localeCompare(b.name))

  return { grouped, ungrouped }
}
