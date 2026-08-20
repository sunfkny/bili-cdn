export const STORAGE_KEY = "cdnSettings";
export const BENCHMARK_SETTINGS_KEY = "benchmarkSettings";
export const CONFIG_EVENT = "bili-cdn:config";

export const DEFAULT_REGION_IDS = ["virtual/mirror"];

// https://www.bilibili.com/video/BV1rp4y1e745/
export const BENCHMARK_API_URL =
  "https://api.bilibili.com/x/player/playurl?avid=969628065&bvid=BV1rp4y1e745&cid=244954665&qn=120&fnver=0&fnval=4048&fourk=1&otype=json";
export const DEFAULT_BENCHMARK_SETTINGS = {
  maxLatencyMs: 100,
  minSpeedMbps: 10,
  concurrency: 1,
  timeoutMs: 2000,
  sampleSizeKb: 5 * 1024,
} as const;
