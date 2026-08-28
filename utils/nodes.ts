import { DEFAULT_REGION_IDS } from "./constants";
import type { BcdnData, NodeRecord } from "./types";

function isAvailable(node: NodeRecord): boolean {
  return node.status === "available";
}

export async function loadNodeData(): Promise<BcdnData> {
  const response = await fetch(browser.runtime.getURL("bcdn_out.json" as never));
  if (!response.ok) {
    throw new Error(`节点数据加载失败（HTTP ${response.status}）`);
  }
  return (await response.json()) as BcdnData;
}

export function getAvailableRegionIds(data: BcdnData): string[] {
  return data.providers.flatMap((provider) =>
    provider.regions
      .filter((region) =>
        region.nodeGroups.some((group) => group.nodes.some(isAvailable)),
      )
      .map((region) => `${provider.id}/${region.id}`),
  );
}

export function getDefaultRegionIds(data: BcdnData): string[] {
  const available = new Set(getAvailableRegionIds(data));
  const defaults = DEFAULT_REGION_IDS.filter((id) => available.has(id));
  return defaults.length > 0 ? defaults : [...available];
}

export function resolveDomains(data: BcdnData, regionIds: Iterable<string>): string[] {
  const domains = new Set<string>();
  for (const id of regionIds) {
    const [rawProviderId, regionId] = id.split("/", 2);
    const providerId = rawProviderId === "virtual" ? "cloud" : rawProviderId;
    if (!providerId || !regionId) continue;
    const provider = data.providers.find((item) => item.id === providerId);
    const region = provider?.regions.find((item) => item.id === regionId);
    region?.nodeGroups.forEach((group) =>
      group.nodes
        .filter(isAvailable)
        .forEach((node) => domains.add(node.domain)),
    );
  }
  return [...domains];
}

export function getAllDomains(data: BcdnData): string[] {
  return data.providers.flatMap((provider) =>
    provider.regions.flatMap((region) =>
      region.nodeGroups.flatMap((group) =>
        group.nodes.filter(isAvailable).map((node) => node.domain),
      ),
    ),
  );
}
