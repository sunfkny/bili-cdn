export interface NodeRecord {
  domain: string;
}

export interface RegionRecord {
  id: string;
  name: string;
  nodes: NodeRecord[];
}

export interface ProviderRecord {
  id: string;
  name: string;
  regions: RegionRecord[];
}

export interface NodeData {
  providers: ProviderRecord[];
}

export interface BenchmarkSettings {
  maxLatencyMs: number;
  minSpeedMbps: number;
  timeoutMs: number;
  sampleSizeKb: number;
  useCurrentVideo: boolean;
  concurrency: number;
  testVideo: string;
  testVideoPart: number;
}

export interface VideoIds {
  aid: string;
  cid: string;
  bvid: string;
}

export interface BenchmarkResult {
  status: "passed" | "rejected" | "failed";
  latencyMs?: number;
  speedMbps?: number;
  error?: string;
  testedAt: number;
}
