export interface NodeRecord {
  domain: string;
  status: "available" | "unreachable";
}

export interface NodeGroupRecord {
  type: "bcache" | "non-bcache" | "mirror" | "upos";
  nodes: NodeRecord[];
}

export interface RegionRecord {
  id: string;
  name: string;
  scope: "mainland" | "oversea";
  nodeGroups: NodeGroupRecord[];
}

export interface ProviderRecord {
  id: string;
  name: string;
  regions: RegionRecord[];
}

export interface BcdnData {
  schemaVersion: number;
  providers: ProviderRecord[];
}

export interface CdnSettings {
  selectedDomains: string[];
  selectedRegionIds?: string[];
  activeDomains: string[];
  dynamicRequestInterception?: boolean;
  benchmarkResults?: Record<string, BenchmarkResult>;
  optimizedAt?: number;
}

export interface CdnRuntimeConfig {
  activeDomains: string[];
}

export interface BenchmarkResult {
  domain: string;
  status: "passed" | "rejected" | "failed";
  latencyMs?: number;
  speedMbps?: number;
  testedAt: number;
}

export interface BenchmarkSettings {
  maxLatencyMs: number;
  minSpeedMbps: number;
  concurrency: number;
  timeoutMs: number;
  sampleSizeKb: number;
}
