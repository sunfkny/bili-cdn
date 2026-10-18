export interface PlaybackSettings {
  cdnSelection: boolean;
  threadRipper: boolean;
  blockPcdn: boolean;
  blockDomains: boolean;
  blockMcdnDomain: boolean;
  blockSzbdydDomain: boolean;
  blockNexusDomain: boolean;
  blockQiniuDomain: boolean;
  blockMountaintoysDomain: boolean;
  blockMcdn: boolean;
  blockRedirect: boolean;
  blockResource: boolean;
  blockIp: boolean;
  allowedDomains: string;
  concurrency: number;
  hostConcurrency: number;
  maxPieces: number;
  warmup: boolean;
}

export const playbackDefaults: PlaybackSettings = {
  cdnSelection: true, threadRipper: false, blockPcdn: false,
  blockDomains: true, blockMcdn: true, blockRedirect: true, blockResource: true, blockIp: false,
  blockMcdnDomain: true, blockSzbdydDomain: true, blockNexusDomain: true,
  blockQiniuDomain: true, blockMountaintoysDomain: true,
  allowedDomains: "", concurrency: 16, hostConcurrency: 4, maxPieces: 16, warmup: true,
};

export function normalizePlaybackSettings(value: Partial<PlaybackSettings>): PlaybackSettings {
  const result = { ...playbackDefaults };
  for (const key of Object.keys(result) as (keyof PlaybackSettings)[]) {
    if (typeof result[key] === "boolean" && typeof value[key] === "boolean") {
      (result as unknown as Record<string, unknown>)[key] = value[key];
    }
  }
  for (const key of ["concurrency", "hostConcurrency", "maxPieces"] as const) {
    const max = key === "concurrency" ? 32 : key === "hostConcurrency" ? 6 : 16;
    const min = key === "concurrency" ? 3 : 1;
    if (Number.isFinite(value[key])) result[key] = Math.max(min, Math.min(max, Math.round(value[key]!)));
  }
  result.hostConcurrency = Math.min(result.hostConcurrency, result.concurrency);
  if (typeof value.allowedDomains === "string") result.allowedDomains = value.allowedDomains;
  if (result.cdnSelection) result.blockPcdn = false;
  return result;
}

export function isBlockedUrl(value: string, settings: PlaybackSettings): boolean {
  if (!settings.blockPcdn) return false;
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const allowed = settings.allowedDomains.toLowerCase().split(/[\s,，;；]+/).filter(Boolean);
  if (allowed.some(rule => rule.startsWith("*.")
    ? host.endsWith(rule.slice(1)) && host !== rule.slice(2)
    : host === rule)) return false;
  const matchesDomain = (domain: string): boolean => host === domain || host.endsWith(`.${domain}`);
  const blockedDomain = (settings.blockMcdnDomain && ["com", "cn", "net"].some(tld => matchesDomain(`mcdn.bilivideo.${tld}`)))
    || (settings.blockSzbdydDomain && matchesDomain("szbdyd.com"))
    || (settings.blockNexusDomain && matchesDomain("nexusedgeio.com"))
    || (settings.blockQiniuDomain && matchesDomain("ahdohpiechei.com"))
    || (settings.blockMountaintoysDomain && matchesDomain("mountaintoys.cn"));
  return (settings.blockDomains && blockedDomain)
    || (settings.blockMcdn && url.searchParams.get("os") === "mcdn")
    || (settings.blockRedirect && host.split(".")[0].includes("302"))
    || (settings.blockResource && /^\/v\d+\/resource\//.test(url.pathname))
    || (settings.blockIp && (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("["))
      && (url.port !== "" || /^\/v\d+\/resource\//.test(url.pathname)));
}

export function isBlockedMediaUrl(value: string, settings: PlaybackSettings, domains: readonly string[]): boolean {
  return isBlockedUrl(value, settings)
    || (settings.cdnSelection && domains.length > 0
      && (!domains.includes(new URL(value).hostname) || /^\/v\d+(?:\/|$)/.test(new URL(value).pathname)));
}
