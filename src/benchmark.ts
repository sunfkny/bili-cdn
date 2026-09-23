import { measureSpeedMbps } from "./transfer-metrics";
import type { BenchmarkResult, BenchmarkSettings, VideoIds } from "./types";

const benchmarkApiUrl = "https://api.bilibili.com/x/player/playurl?bvid=BV1qM4y1w716&cid=455439756&fnval=1616&fnver=0&fourk=1&otype=json";

function findUposUrl(value: unknown): string | undefined {
  if (typeof value === "string") return value.startsWith("https://upos-") ? value : undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findUposUrl(item);
      if (url) return url;
    }
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const url = findUposUrl(item);
      if (url) return url;
    }
  }
  return undefined;
}

export async function getBenchmarkUrl(nativeFetch: typeof fetch, useCurrentVideo: boolean, getCurrentVideoIds: () => VideoIds): Promise<string> {
  let url = benchmarkApiUrl;
  if (useCurrentVideo) {
    const ids = getCurrentVideoIds();
    const apiUrl = new URL("https://api.bilibili.com/x/player/playurl");
    apiUrl.searchParams.set("bvid", ids.bvid);
    apiUrl.searchParams.set("cid", ids.cid);
    apiUrl.searchParams.set("fnval", "1616");
    apiUrl.searchParams.set("fnver", "0");
    apiUrl.searchParams.set("fourk", "1");
    apiUrl.searchParams.set("otype", "json");
    url = apiUrl.toString();
  }
  const response = await nativeFetch(url, {
    credentials: "include", cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`播放地址请求失败（HTTP ${response.status}）`);
  const playUrl = findUposUrl(await response.json());
  if (!playUrl) throw new Error("播放接口中没有可用于测速的 UPOS 地址");
  return playUrl;
}

export async function benchmarkDomain(domain: string, sourceUrl: string, settings: BenchmarkSettings, nativeFetch: typeof fetch): Promise<BenchmarkResult> {
  const url = new URL(sourceUrl);
  url.hostname = domain;
  url.port = "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
  const startedAt = performance.now();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await nativeFetch(url.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { Range: `bytes=0-${settings.sampleSizeKb * 1024 - 1}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error("响应没有可读取的数据流");

    reader = response.body.getReader();
    let firstByteAt: number | undefined;
    let totalBytes = 0;
    const sampleBytes = settings.sampleSizeKb * 1024;
    while (totalBytes < sampleBytes) {
      const { done, value } = await reader.read();
      const receivedAt = performance.now();
      if (done) break;
      if (!value?.byteLength) continue;
      firstByteAt ??= receivedAt;
      totalBytes += value.byteLength;
    }
    const finishedAt = performance.now();
    if (firstByteAt === undefined) throw new Error("未收到测速数据");
    const latencyMs = firstByteAt - startedAt;
    const speedMbps = measureSpeedMbps(totalBytes, startedAt, finishedAt);
    return {
      status: latencyMs <= settings.maxLatencyMs && speedMbps >= settings.minSpeedMbps ? "passed" : "rejected",
      latencyMs, speedMbps, testedAt: Date.now(),
    };
  } catch (cause) {
    return { status: "failed", error: cause instanceof Error ? cause.message : String(cause), testedAt: Date.now() };
  } finally {
    clearTimeout(timeout);
    if (reader) void reader.cancel().catch(() => undefined);
    controller.abort();
  }
}
