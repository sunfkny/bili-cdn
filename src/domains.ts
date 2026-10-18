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
const listeners = new Set<() => void>();

export function onDomainsChange(listener: () => void): void { listeners.add(listener); }

export function getDomains(): string[] {
  return activeDomains;
}

export function setDomains(domains: string[]): void {
  const next = [...new Set(domains.filter((domain) => available.has(domain)))];
  if (next.length === activeDomains.length && next.every((domain, index) => domain === activeDomains[index])) return;
  activeDomains = next;
  GM_setValue(storageKey, activeDomains);
  for (const listener of listeners) listener();
}

export function getRandomDomain(): string | undefined {
  return activeDomains[Math.floor(Math.random() * activeDomains.length)];
}
