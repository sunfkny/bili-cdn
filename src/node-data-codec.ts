import type { NodeData } from "./types.ts";

const domainSuffix = ".bilivideo.com";

interface RecordedNodeData {
  providers: Array<{
    id: string;
    name: string;
    regions: Array<{
      id: string;
      name: string;
      nodeGroups: Array<{ nodes: Array<{ domain: string; status: string }> }>;
    }>;
  }>;
}

export type PackedNodeData = Array<[
  providerId: string,
  providerName: string,
  regions: Array<[
    regionId: string,
    regionName: string,
    domains: Array<string | [prefix: string, numericSuffixes: string]>,
  ]>,
]>;

function encodeNumbers(values: string[]): string {
  const tokens: string[] = [];
  for (let index = 0; index < values.length;) {
    let end = index;
    while (
      end + 1 < values.length &&
      Number(values[end + 1]) === Number(values[end]) + 1
    ) end++;
    tokens.push(end > index + 1 ? `${values[index]}-${values[end]}` : values[index]);
    if (end === index + 1) tokens.push(values[end]);
    index = end + 1;
  }
  return tokens.join(",");
}

function packDomains(domains: string[]): Array<string | [string, string]> {
  const labels = domains.map((domain) => {
    if (!domain.endsWith(domainSuffix)) throw new Error(`Unsupported CDN domain: ${domain}`);
    return domain.slice(0, -domainSuffix.length);
  });
  const packed: Array<string | [string, string]> = [];
  for (let index = 0; index < labels.length;) {
    const match = /^(.*?)(\d+)$/.exec(labels[index]);
    if (!match) {
      packed.push(labels[index++]);
      continue;
    }
    const prefix = match[1];
    const width = match[2].length;
    const numbers = [match[2]];
    let next = index + 1;
    while (next < labels.length) {
      const item = /^(.*?)(\d+)$/.exec(labels[next]);
      if (!item || item[1] !== prefix || item[2].length !== width) break;
      numbers.push(item[2]);
      next++;
    }
    const group: [string, string] = [prefix, encodeNumbers(numbers)];
    const originals = labels.slice(index, next);
    if (JSON.stringify(group).length < JSON.stringify(originals).length) {
      packed.push(group);
    } else {
      packed.push(...originals);
    }
    index = next;
  }
  return packed;
}

export function packNodeData(recorded: RecordedNodeData): PackedNodeData {
  return recorded.providers.flatMap((provider) => {
    const regions: PackedNodeData[number][2] = provider.regions.flatMap((region) => {
      const domains = region.nodeGroups.flatMap((group) =>
        group.nodes.filter((node) => node.status === "available").map((node) => node.domain),
      );
      return domains.length
        ? [[region.id, region.name, packDomains(domains)]] as PackedNodeData[number][2]
        : [];
    });
    return regions.length ? [[provider.id, provider.name, regions]] as PackedNodeData : [];
  });
}

export function decodeNodeData(packed: PackedNodeData): NodeData {
  return {
    providers: packed.map(([id, name, regions]) => ({
      id,
      name,
      regions: regions.map(([regionId, regionName, entries]) => ({
        id: regionId,
        name: regionName,
        nodes: entries.flatMap((entry) => {
          if (typeof entry === "string") return [{ domain: `${entry}${domainSuffix}` }];
          const [prefix, encoded] = entry;
          return encoded.split(",").flatMap((token) => {
            const range = /^(\d+)-(\d+)$/.exec(token);
            if (!range) return [{ domain: `${prefix}${token}${domainSuffix}` }];
            const start = Number(range[1]);
            const end = Number(range[2]);
            return Array.from({ length: end - start + 1 }, (_, index) => ({
              domain: `${prefix}${String(start + index).padStart(range[1].length, "0")}${domainSuffix}`,
            }));
          });
        }),
      })),
    })),
  };
}
