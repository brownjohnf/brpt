import { homedir } from "./platform";
import type { ProjectEntry } from "../../shared/types";
import type { Tab } from "./types";

export interface TabGroup {
  name: string;
  rootPath: string;
  tabs: { tab: Tab; index: number }[];
}

function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return homedir + p.slice(1);
  }
  return p;
}

function getTabGroup(
  filePath: string,
  projects: ProjectEntry[],
  containerFolders: string[],
): { name: string; rootPath: string } | null {
  for (const entry of projects) {
    const path = typeof entry === "string" ? entry : entry.path;
    const alias = typeof entry === "string" ? undefined : entry.alias;
    const expanded = expandPath(path).replace(/\/$/, "");
    if (filePath.startsWith(expanded + "/")) {
      const name = alias ?? expanded.split("/").pop()!;
      return { name, rootPath: expanded };
    }
  }

  const sortedFolders = [...containerFolders].sort((a, b) => expandPath(b).length - expandPath(a).length);
  for (const folder of sortedFolders) {
    const expanded = expandPath(folder).replace(/\/$/, "");
    if (filePath.startsWith(expanded + "/")) {
      const rest = filePath.slice(expanded.length + 1);
      const childDir = rest.split("/")[0];
      if (childDir) {
        return { name: childDir, rootPath: expanded + "/" + childDir };
      }
    }
  }

  return null;
}

export function groupTabs(
  tabs: Tab[],
  projects: ProjectEntry[],
  containerFolders: string[],
  groupOrder?: string[],
): { grouped: TabGroup[]; ungrouped: { tab: Tab; index: number }[] } {
  const groups = new Map<string, TabGroup>();
  const ungrouped: { tab: Tab; index: number }[] = [];

  tabs.forEach((tab, index) => {
    const group = getTabGroup(tab.path, projects, containerFolders);
    if (group) {
      if (!groups.has(group.name)) {
        groups.set(group.name, {
          name: group.name,
          rootPath: group.rootPath,
          tabs: [],
        });
      }
      groups.get(group.name)!.tabs.push({ tab, index });
    } else {
      ungrouped.push({ tab, index });
    }
  });

  const grouped: TabGroup[] = Array.from(groups.values()).sort((a, b) => {
    const ai = groupOrder ? groupOrder.indexOf(a.name) : -1;
    const bi = groupOrder ? groupOrder.indexOf(b.name) : -1;
    if (ai !== -1 && bi !== -1) { return ai - bi; }
    if (ai !== -1) { return -1; }
    if (bi !== -1) { return 1; }
    return a.name.localeCompare(b.name);
  });

  return { grouped, ungrouped };
}
