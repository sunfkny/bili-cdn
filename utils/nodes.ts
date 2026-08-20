import { DEFAULT_REGION_IDS, ZONE_API_URL } from "./constants";
import type { BcdnData, ZoneData } from "./types";

export async function loadNodeData(): Promise<BcdnData> {
  const response = await fetch(browser.runtime.getURL("bcdn_out.json" as never));
  if (!response.ok) {
    throw new Error(`节点数据加载失败（HTTP ${response.status}）`);
  }
  return response.json() as Promise<BcdnData>;
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

export async function getRecommendedRegionIds(data: BcdnData): Promise<string[]> {
  try {
    const response = await fetch(ZONE_API_URL, { credentials: "include" });
    if (!response.ok) return getDefaultRegionIds(data);
    const payload = (await response.json()) as { code?: number; data?: ZoneData };
    if (payload.code !== 0 || !payload.data) return getDefaultRegionIds(data);
    return matchZoneToRegions(data, payload.data);
  } catch {
    return getDefaultRegionIds(data);
  }
}

export function matchZoneToRegions(data: BcdnData, zone: ZoneData): string[] {
  const providerAliases: Array<[string, string]> = [
    ["电信通", "cc"],
    ["鹏博士", "cc"],
    ["长城", "cc"],
    ["珠江", "bn"],
    ["天威", "twsx"],
    ["华数", "wasu"],
    ["电信", "ct"],
    ["联通", "cu"],
    ["移动", "cm"],
    ["广电", "gd"],
  ];
  const mappedProviderId = providerAliases.find(([alias]) =>
    zone.isp.includes(alias),
  )?.[1];
  const providerEntry = mappedProviderId && data.results[mappedProviderId]
    ? ([mappedProviderId, data.results[mappedProviderId]] as const)
    : Object.entries(data.results).find(([, provider]) =>
        provider.name === zone.isp,
      );
  if (!providerEntry) return getDefaultRegionIds(data);

  const [providerId, provider] = providerEntry;
  const regions = Object.entries(provider.regions);
  const cityMatches = regions.filter(([, region]) =>
    region.name.includes(zone.province) && region.name.includes(zone.city),
  );
  const provinceMatches = regions.filter(([, region]) =>
    region.name.includes(zone.province),
  );
  const matches = cityMatches.length
    ? cityMatches
    : provinceMatches.length
      ? provinceMatches
      : regions;
  return matches.map(([regionId]) => `${providerId}/${regionId}`);
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
