import { DEFAULT_REGION_IDS } from "./constants";
import type { BcdnData } from "./types";

const MIRROR_CDN_DOMAINS = [
  "upos-sz-mirrorali.bilivideo.com",
  "upos-sz-mirroralib.bilivideo.com",
  "upos-sz-mirroralio1.bilivideo.com",
  "upos-sz-mirrorbd.bilivideo.com",
  "upos-sz-mirrorcos.bilivideo.com",
  "upos-sz-mirrorcosb.bilivideo.com",
  "upos-sz-mirrorcoso1.bilivideo.com",
  "upos-sz-mirrorhw.bilivideo.com",
  "upos-sz-mirrorhwb.bilivideo.com",
  "upos-sz-mirrorhwo1.bilivideo.com",
  "upos-sz-mirror08c.bilivideo.com",
  "upos-sz-mirror08h.bilivideo.com",
  "upos-sz-mirror08ct.bilivideo.com",
];

const UPOS_STORAGE_DOMAINS = [
  "upos-sz-estghw.bilivideo.com",
  "upos-sz-estgcos.bilivideo.com",
  "upos-sz-estgoss.bilivideo.com",
];

export async function loadNodeData(): Promise<BcdnData> {
  const response = await fetch(browser.runtime.getURL("bcdn_out.json" as never));
  if (!response.ok) {
    throw new Error(`节点数据加载失败（HTTP ${response.status}）`);
  }
  const data = (await response.json()) as BcdnData;
  const virtualNodeCount = MIRROR_CDN_DOMAINS.length + UPOS_STORAGE_DOMAINS.length;
  return {
    ...data,
    count: data.count + virtualNodeCount,
    results: {
      virtual: {
        name: "云服务节点",
        regions: {
          mirror: {
            name: "Mirror 型 CDN",
            nodes: MIRROR_CDN_DOMAINS.map((domain) => ({ domain })),
          },
          upos: {
            name: "UPOS 型对象存储",
            nodes: UPOS_STORAGE_DOMAINS.map((domain) => ({ domain })),
          },
        },
      },
      ...data.results,
    },
  };
}

export function getAvailableRegionIds(data: BcdnData): string[] {
  return Object.entries(data.results).flatMap(([providerId, provider]) =>
    Object.keys(provider.regions).map((regionId) => `${providerId}/${regionId}`),
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
    const [providerId, regionId] = id.split("/", 2);
    if (!providerId || !regionId) continue;
    const region = data.results[providerId]?.regions[regionId];
    region?.nodes.forEach((node) => domains.add(node.domain));
  }
  return [...domains];
}

export function getAllDomains(data: BcdnData): string[] {
  return Object.values(data.results).flatMap((provider) =>
    Object.values(provider.regions).flatMap((region) =>
      region.nodes.map((node) => node.domain),
    ),
  );
}
