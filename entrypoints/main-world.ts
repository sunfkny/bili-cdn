import { CONFIG_EVENT } from "../utils/constants";
import type { CdnRuntimeConfig } from "../utils/types";

type JsonRecord = Record<string, any>;

export default defineUnlistedScript(() => {
  const prefix = "[Bili CDN]:";
  const log = console.log.bind(console, prefix);
  const warn = console.warn.bind(console, prefix);
  const error = console.error.bind(console, prefix);
  const debug = console.debug.bind(console, prefix);

  let activeDomains = readInitialDomains();
  let activeDomainSet = new Set(activeDomains);

  function readInitialDomains(): string[] {
    const raw = document.currentScript?.dataset.domains;
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((domain): domain is string => typeof domain === "string")
        : [];
    } catch {
      return [];
    }
  }

  window.addEventListener(CONFIG_EVENT, (event) => {
    const config = (event as CustomEvent<CdnRuntimeConfig>).detail;
    if (!config || !Array.isArray(config.activeDomains)) return;
    activeDomains = config.activeDomains.filter(
      (domain): domain is string => typeof domain === "string",
    );
    activeDomainSet = new Set(activeDomains);
    log(`已载入 ${activeDomains.length} 个 CDN 节点`);
  });

  function shuffle<T>(array: T[]): T[] {
    const result = array.slice();
    let remaining = result.length;
    while (remaining) {
      const index = Math.floor(Math.random() * remaining--);
      const value = result[remaining]!;
      result[remaining] = result[index]!;
      result[index] = value;
    }
    return result;
  }

  function getCdnDomain(): string | undefined {
    return activeDomains[Math.floor(Math.random() * activeDomains.length)];
  }

  const seenHostnames = new Set<string>();
  const seenMcdnHostnames = new Set<string>();
  const seenMcdnV1Hostnames = new Set<string>();

  function normalizeHostname(hostname: string): string {
    if (hostname.endsWith("edge.mountaintoys.cn")) {
      return "*.edge.mountaintoys.cn";
    }
    if (hostname.endsWith("mcdn.bilivideo.cn")) {
      return "*.mcdn.bilivideo.cn";
    }
    return hostname;
  }

  function shouldBlockUrl(value: unknown): value is string {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value);
      return (
        url.pathname.startsWith("/v1/resource/") ||
        url.hostname.endsWith("mcdn.bilivideo.cn") ||
        url.hostname.endsWith("edge.mountaintoys.cn") ||
        url.searchParams.get("os") === "mcdn"
      );
    } catch {
      return false;
    }
  }

  function replaceUrl(url: unknown, host = getCdnDomain()): unknown {
    if (!host || typeof url !== "string") return url;

    const parsed = new URL(url);
    const normalizedHostname = normalizeHostname(parsed.hostname);
    const os = parsed.searchParams.get("os");
    if (shouldBlockUrl(url)) {
      if (!seenMcdnV1Hostnames.has(normalizedHostname)) {
        seenMcdnV1Hostnames.add(normalizedHostname);
        debug(`os=${os} blocked ${normalizedHostname} -> undefined`);
      }
      return undefined;
    }
    if (activeDomainSet.has(parsed.hostname)) return url;

    if (parsed.port && parsed.port !== "443") {
      parsed.host = host;
      parsed.port = "443";
      if (!seenMcdnHostnames.has(normalizedHostname)) {
        seenMcdnHostnames.add(normalizedHostname);
        debug(`os=${os} mcdn ${normalizedHostname}`);
      }
      return parsed.toString();
    }

    parsed.host = host;
    if (!seenHostnames.has(normalizedHostname)) {
      seenHostnames.add(normalizedHostname);
      debug(`os=${os} ${normalizedHostname}`);
    }
    return parsed.toString();
  }

  function findUposUrl(urls: unknown[]): string | undefined {
    return urls.find(
      (url): url is string =>
        typeof url === "string" && url.startsWith("https://upos-"),
    );
  }

  function createBaseUrl(urls: unknown[]): string | undefined {
    const source = findUposUrl(urls);
    const host = getCdnDomain();
    if (!source || !host) return undefined;
    const url = new URL(source);
    url.port = "";
    url.host = host;
    return url.toString();
  }

  function createBackupUrls(urls: unknown[]): string[] {
    const source = findUposUrl(urls);
    if (!source) return [];
    return shuffle(activeDomains).map((host) => {
      const url = new URL(source);
      url.port = "";
      url.host = host;
      return url.toString();
    });
  }

  function transformPlayInfo(playInfo: JsonRecord): void {
    if (activeDomains.length === 0) return;
    if (playInfo.code !== undefined && playInfo.code !== 0) {
      error("Failed to get playInfo, message:", playInfo.message);
      return;
    }

    const transformDashItem = (item: JsonRecord): boolean => {
      const baseUrl = item.baseUrl ?? item.base_url;
      const backupUrls = item.backupUrl ?? item.backup_url ?? [];
      const allUrls = [baseUrl, ...(Array.isArray(backupUrls) ? backupUrls : [])];
      const sourceUrls = allUrls.filter(
        (url): url is string => typeof url === "string" && !shouldBlockUrl(url),
      );
      if (sourceUrls.length === 0) return false;
      const nextBaseUrl = createBaseUrl(sourceUrls);
      if (nextBaseUrl) {
        const nextBackupUrls = createBackupUrls(sourceUrls);
        item.baseUrl = nextBaseUrl;
        item.base_url = nextBaseUrl;
        item.backupUrl = nextBackupUrls;
        item.backup_url = nextBackupUrls;
      } else if (sourceUrls.length < allUrls.length) {
        const [nextSourceUrl, ...nextBackupUrls] = sourceUrls;
        item.baseUrl = nextSourceUrl;
        item.base_url = nextSourceUrl;
        item.backupUrl = nextBackupUrls;
        item.backup_url = nextBackupUrls;
      }
      return true;
    };

    const transformDurl = (item: JsonRecord): boolean => {
      item.url = replaceUrl(item.url);
      return typeof item.url === "string";
    };

    let videoInfo: JsonRecord | undefined;
    if (playInfo.result) {
      log("bangumi pages");
      videoInfo = playInfo.result.dash
        ? playInfo.result
        : playInfo.result.video_info;
      if (!videoInfo?.dash) {
        if (playInfo.result.durl || playInfo.result.durls) {
          videoInfo = playInfo.result;
        }
        if (Array.isArray(videoInfo?.durl)) {
          videoInfo.durl = videoInfo.durl.filter(transformDurl);
        }
        videoInfo?.durls?.forEach((group: JsonRecord) => {
          if (Array.isArray(group.durl)) {
            group.durl = group.durl.filter(transformDurl);
          }
        });
        return;
      }
    } else {
      log("video pages");
      videoInfo = playInfo.data;
    }

    try {
      if (Array.isArray(videoInfo?.dash?.video)) {
        videoInfo.dash.video = videoInfo.dash.video.filter(transformDashItem);
      }
      if (Array.isArray(videoInfo?.dash?.audio)) {
        videoInfo.dash.audio = videoInfo.dash.audio.filter(transformDashItem);
      }
    } catch (cause) {
      if (Array.isArray(videoInfo?.durl)) {
        videoInfo.durl = videoInfo.durl.filter(transformDurl);
      } else {
        error("ERR:", cause);
      }
    }
  }

  const playUrlPrefixes = [
    "https://api.bilibili.com/x/player/wbi/playurl",
    "https://api.bilibili.com/pgc/player/web/v2/playurl",
    "https://api.bilibili.com/x/player/playurl",
    "https://api.bilibili.com/pgc/player/web/playurl",
    "https://api.bilibili.com/pugv/player/web/playurl",
  ];

  function getRequestUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url;
  }

  function shouldIntercept(url: string): boolean {
    return playUrlPrefixes.some((prefix) => url.startsWith(prefix));
  }

  function transformJsonText(text: string, url: string): string {
    if (!shouldIntercept(url)) return text;
    try {
      const playInfo = JSON.parse(text) as JsonRecord;
      transformPlayInfo(playInfo);
      log("(Intercepted) playurl api response.");
      return JSON.stringify(playInfo);
    } catch (cause) {
      warn("播放地址响应解析失败", cause);
      return text;
    }
  }

  const OriginalXMLHttpRequest = window.XMLHttpRequest;
  window.XMLHttpRequest = class extends OriginalXMLHttpRequest {
    override get responseText(): string {
      const text = super.responseText;
      return this.readyState === this.DONE
        ? transformJsonText(text, this.responseURL)
        : text;
    }

    override get response(): any {
      const response = super.response;
      if (this.readyState !== this.DONE || !shouldIntercept(this.responseURL)) {
        return response;
      }
      if (typeof response === "string") {
        return transformJsonText(response, this.responseURL);
      }
      if (response && typeof response === "object") {
        transformPlayInfo(response);
      }
      return response;
    }
  };

  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (!shouldIntercept(getRequestUrl(input))) return response;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return response;

    const text = await response.text();
    return new Response(transformJsonText(text, getRequestUrl(input)), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  const pageWindow = window as typeof window & { __playinfo__?: JsonRecord };
  if (pageWindow.__playinfo__) {
    log("Directly modify window.__playinfo__");
    transformPlayInfo(pageWindow.__playinfo__);
  }
  let internalPlayInfo = pageWindow.__playinfo__;
  Object.defineProperty(pageWindow, "__playinfo__", {
    configurable: true,
    get: () => internalPlayInfo,
    set: (value: JsonRecord | undefined) => {
      if (value) transformPlayInfo(value);
      internalPlayInfo = value;
    },
  });
});
