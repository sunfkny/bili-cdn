export interface NodeRecord {
  domain: string;
}

export interface RegionRecord {
  name: string;
  nodes: NodeRecord[];
}

export interface ProviderRecord {
  name: string;
  regions: Record<string, RegionRecord>;
}

export interface BcdnData {
  generated_at: string;
  count: number;
  results: Record<string, ProviderRecord>;
}

export interface CdnSettings {
  selectedDomains: string[];
  selectedRegionIds?: string[];
  activeDomains: string[];
  enabled?: boolean;
  interceptMcdn?: boolean;
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
