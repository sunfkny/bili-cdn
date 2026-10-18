import { measureSpeedMbps } from "./network/transfer-metrics";
import type { BenchmarkResult, BenchmarkSettings, VideoIds } from "./types";
import { isAkamaiHost, isPortableUposPath } from "./media/cdn-classify";

const benchmarkApiUrl = "https://api.bilibili.com/x/player/playurl?bvid=BV1qM4y1w716&cid=455439756&fnval=1616&fnver=0&fourk=1&otype=json";

function findUposUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.startsWith("upos-") && isPortableUposPath(url.pathname) && !isAkamaiHost(url.hostname) ? value : undefined;
    } catch { return undefined; }
  }
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

export async function resolveBenchmarkVideo(value: string, part: number, nativeFetch: typeof fetch, signal?: AbortSignal): Promise<{ bvid: string; cid: string }> {
  let id = value.trim();
  if (/^https?:\/\//i.test(id)) {
    const url = new URL(id);
    if (url.hostname !== "bilibili.com" && !url.hostname.endsWith(".bilibili.com")) throw new Error("请填写 B 站视频链接、BV 号或 av 号");
    id = url.pathname.match(/\/video\/([^/]+)/)?.[1] ?? "";
  }
  const api = new URL("https://api.bilibili.com/x/web-interface/view");
  if (/^BV[a-zA-Z0-9]{10}$/.test(id)) api.searchParams.set("bvid", id);
  else if (/^av[1-9]\d*$/i.test(id)) api.searchParams.set("aid", id.slice(2));
  else throw new Error("测试视频格式无效，请填写 BV 号、av 号或完整视频链接");
  const timeout = AbortSignal.timeout(10000);
  const response = await nativeFetch(api, { credentials: "include", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(`视频信息请求失败（HTTP ${response.status}）`);
  const info = await response.json();
  if (info.code !== 0 || !info.data?.bvid) throw new Error(info.message || "无法获取测试视频信息");
  const page = info.data.pages?.find((item: { page: number }) => item.page === part);
  const cid = page?.cid ?? (part === 1 ? info.data.cid : undefined);
  if (!cid) throw new Error(`测试视频没有第 ${part} P`);
  return { bvid: String(info.data.bvid), cid: String(cid) };
}

export async function getBenchmarkUrl(nativeFetch: typeof fetch, useCurrentVideo: boolean, getCurrentVideoIds: () => VideoIds, signal?: AbortSignal, testVideo = "", testVideoPart = 1): Promise<string> {
  let url = benchmarkApiUrl;
  if (useCurrentVideo || testVideo.trim() || testVideoPart !== 1) {
    const ids = useCurrentVideo ? getCurrentVideoIds() : await resolveBenchmarkVideo(testVideo.trim() || "BV1qM4y1w716", testVideoPart, nativeFetch, signal);
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
    credentials: "include", cache: "no-store", signal: signal ? AbortSignal.any([AbortSignal.timeout(10000), signal]) : AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`播放地址请求失败（HTTP ${response.status}）`);
  const playUrl = findUposUrl(await response.json());
  if (!playUrl) throw new Error("播放接口中没有可用于测速的 /upgcxcode/ 地址，不能将 /v1/ 等专用路径用于手选 CDN");
  return playUrl;
}

export async function benchmarkDomain(domain: string, sourceUrl: string, settings: BenchmarkSettings, nativeFetch: typeof fetch, signal?: AbortSignal): Promise<BenchmarkResult> {
  const url = new URL(sourceUrl);
  if (!isPortableUposPath(url.pathname) || isAkamaiHost(url.hostname)) {
    throw new Error("测速地址不支持迁移到手选 CDN，仅支持 /upgcxcode/ 路径");
  }
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
      redirect: "error",
      headers: { Range: `bytes=0-${settings.sampleSizeKb * 1024 - 1}` },
      signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
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
