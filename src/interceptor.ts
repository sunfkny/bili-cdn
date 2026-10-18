import { transformPlayInfo } from "./play-info";
import { getPlaybackSettings, onPlaybackSettingsChange } from "./playback-settings";
import { isBlockedMediaUrl } from "./playback-policy";
import { getDomains, onDomainsChange } from "./domains";
import { createThreadRipper } from "./thread-ripper/engine";
import { player, acceptableCandidates } from "./media/player";
import { defaultCandidate, findCandidate } from "./media/candidates";
import { findFile, toMediaAddress } from "./media/registry";
import { parseRangeHeader } from "./network/range";
import { isDedicatedMediaPath } from "./media/cdn-classify";
import { PatchedXMLHttpRequest, xhrHooks } from "./network/xhr-override";
import type { unsafeWindow } from "$";
import type { XhrSendContext } from "./network/xhr-types";

type PageWindow = typeof unsafeWindow & { __playinfo__?: Record<string, any> };
const playurlPaths = new Set([
  "/x/player/wbi/playurl", "/x/player/playurl", "/pgc/player/web/v2/playurl",
  "/pgc/player/web/playurl", "/pugv/player/web/playurl",
]);
function isPlayurl(url: string): boolean {
  const parsed = new URL(url, location.href);
  return parsed.hostname === "api.bilibili.com" && playurlPaths.has(parsed.pathname);
}

export function installInterceptor(pageWindow: PageWindow): void {
  const nativeFetch = pageWindow.fetch.bind(pageWindow);
  let engine = createThreadRipper(player, nativeFetch);
  const reset = (): void => { engine.dispose(); engine = createThreadRipper(player, nativeFetch); };
  onPlaybackSettingsChange(reset);
  onDomainsChange(reset);

  function route(href: string): string {
    const url = new URL(href, pageWindow.location.href);
    const address = toMediaAddress(url);
    const file = findFile(address);
    if (getPlaybackSettings().cdnSelection && getDomains().includes(url.hostname) && isDedicatedMediaPath(url.pathname)) {
      const chosen = defaultCandidate(acceptableCandidates(file, address), file, performance.now());
      if (!chosen) throw new DOMException("手选 CDN 不支持 /v1/ 等专用路径，且没有可用的普通播放地址", "NetworkError");
      return chosen.href;
    }
    if (!file && address.class === "unknown") return href;
    const candidates = acceptableCandidates(file, address);
    const requested = findCandidate(candidates, address);
    const chosen = requested && player.isCandidateUsable(requested, file, performance.now(), Date.now() / 1000)
      ? requested : defaultCandidate(candidates, file, performance.now());
    if (!chosen) throw new DOMException("CDN 选择或 PCDN 规则未留下可用播放地址", "NetworkError");
    return chosen.href;
  }

  xhrHooks.open.add(args => {
    args[1] = route(String(args[1]));
    return args;
  });
  xhrHooks.response.add((_method, url, response, xhr) => {
    if (xhr.readyState !== xhr.DONE || !isPlayurl(String(url))) return response;
    const json = typeof response === "string" ? JSON.parse(response) : response;
    if (!json || typeof json !== "object") return response;
    transformPlayInfo(json);
    return typeof response === "string" ? JSON.stringify(json) : json;
  });
  xhrHooks.send.add((ctx: XhrSendContext) => {
    if (ctx.method !== "GET" || !ctx.async || ctx.responseType !== "arraybuffer"
      || ctx.body != null || ctx.withCredentials || ctx.hasUrlCredentials) return null;
    const address = toMediaAddress(new URL(ctx.url));
    const file = findFile(address);
    if (!file && address.class === "unknown") return null;
    const candidates = acceptableCandidates(file, address);
    if (!findCandidate(candidates, address)) return sink => sink.error();
    const ranges = ctx.headers.filter(([name]) => name === "range");
    const range = ranges.length === 1 ? parseRangeHeader(ranges[0][1]) : null;
    const eligible = ctx.headers.every(([name]) => name === "range" || name === "accept");
    const responder = getPlaybackSettings().threadRipper && eligible
      ? engine.serve({ ctx, range, file, candidates, requested: findCandidate(candidates, address) }) : null;
    if (responder) return responder;
    if (!getPlaybackSettings().blockPcdn && !getPlaybackSettings().cdnSelection) return null;
    return sink => {
      void nativeFetch(ctx.url, {
        headers: Object.fromEntries(ctx.headers), signal: sink.signal, credentials: "omit", mode: "cors",
      }).then(async response => {
        if (isBlockedMediaUrl(response.url || ctx.url, getPlaybackSettings(), getDomains())) {
          void response.body?.cancel().catch(() => undefined);
          throw new Error("媒体重定向不符合 CDN 选择或 PCDN 规则");
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        sink.headersReceived(response.status, [...response.headers], response.statusText);
        sink.done(await response.arrayBuffer());
      }).catch(() => sink.error());
    };
  });
  pageWindow.XMLHttpRequest = PatchedXMLHttpRequest;
  pageWindow.fetch = async (input, init) => {
    const href = typeof input === "string" ? input : "url" in input ? input.url : input.href;
    const routed = route(href);
    const request = typeof input === "object" && "url" in input && routed !== href ? new Request(routed, input) : routed === href ? input : routed;
    const response = await nativeFetch(request, init);
    const address = toMediaAddress(new URL(routed, pageWindow.location.href));
    if ((findFile(address) || address.class !== "unknown") && isBlockedMediaUrl(response.url || routed, getPlaybackSettings(), getDomains())) {
      void response.body?.cancel().catch(() => undefined);
      throw new TypeError("媒体重定向不符合 CDN 选择或 PCDN 规则");
    }
    if (!isPlayurl(href) || !response.ok) return response;
    try {
      const json = await response.clone().json();
      transformPlayInfo(json);
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      return new Response(JSON.stringify(json), { status: response.status, statusText: response.statusText, headers });
    } catch (cause) {
      console.warn("[BiliCDN] 播放信息处理失败", cause);
      return response;
    }
  };

  let playInfo = pageWindow.__playinfo__;
  if (playInfo) transformPlayInfo(playInfo);
  const descriptor = Object.getOwnPropertyDescriptor(pageWindow, "__playinfo__");
  if (!descriptor || descriptor.configurable) Object.defineProperty(pageWindow, "__playinfo__", {
    configurable: true,
    get: () => playInfo,
    set: (value: Record<string, any>) => { transformPlayInfo(value); playInfo = value; },
  });
}
