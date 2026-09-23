import { nodeData } from "./node-data";
import { GM_getValue, GM_setValue } from "$";

const storageKey = "selectedCdnDomains";
const available = new Set(nodeData.providers.flatMap((provider) =>
  provider.regions.flatMap((region) => region.nodes.map((node) => node.domain)),
));
const defaultDomains = nodeData.providers
  .find((provider) => provider.id === "cloud")?.regions
  .find((region) => region.id === "mirror")?.nodes
  .map((node) => node.domain) ?? [];

function readDomains(): string[] {
  const domains = GM_getValue<unknown>(storageKey, null);
  if (!Array.isArray(domains)) return defaultDomains.slice();
  return domains.filter((domain): domain is string => typeof domain === "string" && available.has(domain));
}

let activeDomains = readDomains();

export function getDomains(): string[] {
  return activeDomains;
}

export function setDomains(domains: string[]): void {
  activeDomains = domains.filter((domain) => available.has(domain));
  GM_setValue(storageKey, activeDomains);
}

export function getRandomDomain(): string | undefined {
  return activeDomains[Math.floor(Math.random() * activeDomains.length)];
}
