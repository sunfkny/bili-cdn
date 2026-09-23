import { getDomains, getRandomDomain } from "./domains";

type PlayInfo = Record<string, any>;
const log = console.log.bind(console, "[BiliCDNSwitcher]:");
const warn = console.warn.bind(console, "[BiliCDNSwitcher]:");
const error = console.error.bind(console, "[BiliCDNSwitcher]:");
const debug = console.debug.bind(console, "[BiliCDNSwitcher]:");
const seenHostname = new Set<string>();
const seenMcdnHostname = new Set<string>();
const seenMcdnV1Hostname = new Set<string>();

function shuffle<T>(array: T[]): T[] {
  const result = array.slice();
  let remaining = result.length;
  while (remaining) {
    const index = Math.floor(Math.random() * remaining--);
    const value = result[remaining];
    result[remaining] = result[index];
    result[index] = value;
  }
  return result;
}

function normalHostname(hostname: string): string {
  if (hostname.endsWith("edge.mountaintoys.cn")) return "*.edge.mountaintoys.cn";
  if (hostname.endsWith("mcdn.bilivideo.cn")) return "*.mcdn.bilivideo.cn";
  return hostname;
}

function replaceUrl(url: string | undefined, host = getRandomDomain()): string | undefined {
  if (!host || !url) return url;
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const normalized = normalHostname(hostname);
  const os = parsed.searchParams.get("os");
  if (getDomains().includes(hostname)) return url;

  if (parsed.pathname.startsWith("/v1/resource/")) {
    if (!seenMcdnV1Hostname.has(normalized)) {
      seenMcdnV1Hostname.add(normalized);
      debug(`os=${os} mcdn v1 resource ${normalized} -> undefined`);
    }
    return undefined;
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    parsed.host = host;
    parsed.port = "443";
    if (!seenMcdnHostname.has(normalized)) {
      seenMcdnHostname.add(normalized);
      debug(`os=${os} mcdn ${normalized}`);
    }
    return parsed.toString();
  }
  parsed.host = host;
  if (!seenHostname.has(normalized)) {
    seenHostname.add(normalized);
    debug(`os=${os} ${normalized}`);
  }
  return parsed.toString();
}

function createBaseUrl(urls: string[]): string | string[] {
  const url = urls.find((item) => item.startsWith("https://upos-"));
  if (!url) {
    warn("No upos url found");
    return urls;
  }
  const parsed = new URL(url);
  if (parsed.port !== "" && parsed.port !== "443") parsed.port = "443";
  parsed.host = getRandomDomain()!;
  return parsed.toString();
}

function createBackupUrl(urls: string[]): string[] {
  const url = urls.find((item) => item.startsWith("https://upos-"));
  if (!url) {
    warn("No upos url found");
    return urls;
  }
  const parsed = new URL(url);
  return shuffle(getDomains()).map((host) => {
    if (parsed.port !== "" && parsed.port !== "443") parsed.port = "443";
    parsed.host = host;
    return parsed.toString();
  });
}

export function transformPlayInfo(playInfo: PlayInfo): void {
  if (getDomains().length === 0) return;

  const transformUrl = (item: PlayInfo): void => {
    if (!item.backupUrl || !item.backup_url || !item.baseUrl || !item.base_url) return;
    const urls: string[] = [item.baseUrl, item.base_url, ...item.backupUrl, ...item.backup_url];
    const baseUrl = createBaseUrl(urls);
    const backupUrl = createBackupUrl(urls);
    item.baseUrl = baseUrl;
    item.base_url = baseUrl;
    item.backupUrl = backupUrl;
    item.backup_url = backupUrl;
  };
  const transformDurl = (item: PlayInfo): void => { item.url = replaceUrl(item.url); };

  if (playInfo.code !== undefined && playInfo.code !== 0) {
    error("Failed to get playInfo, message:", playInfo.message);
    return;
  }

  let videoInfo: PlayInfo | undefined;
  if (playInfo.result) {
    log("bangumi pages");
    videoInfo = playInfo.result.dash === undefined ? playInfo.result.video_info : playInfo.result;
    if (!videoInfo?.dash) {
      if (playInfo.result.durl && playInfo.result.durls) {
        videoInfo = playInfo.result;
      } else {
        error("Failed to get video_info, limit_play_reason:", playInfo.result.play_check?.limit_play_reason);
      }
      videoInfo?.durl?.forEach(transformDurl);
      videoInfo?.durls?.forEach((durl: PlayInfo) => durl.durl?.forEach(transformDurl));
      return;
    }
  } else {
    log("video pages");
    videoInfo = playInfo.data;
  }

  try {
    if (videoInfo?.dash?.video) {
      videoInfo.dash.video.forEach(transformUrl);
      videoInfo.dash.audio.forEach(transformUrl);
    }
  } catch (cause) {
    if (videoInfo?.durl) {
      debug("accept_description:", videoInfo.accept_description?.join(", "));
      videoInfo.durl.forEach(transformDurl);
    } else {
      error("ERR:", cause);
    }
  }
}
