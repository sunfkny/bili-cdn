import { getDomains } from "./domains";
import { ingestPlayinfo, toMediaAddress } from "./media/registry";
import { acceptableCandidates } from "./media/player";
import { defaultCandidate } from "./media/candidates";
import { getPlaybackSettings } from "./playback-settings";

type PlayInfo = Record<string, any>;

export function transformPlayInfo(playInfo: PlayInfo): void {
  if (!playInfo || (playInfo.code !== undefined && playInfo.code !== 0)) return;
  ingestPlayinfo(playInfo, "playurl");
  const settings = getPlaybackSettings();
  if ((!settings.cdnSelection || getDomains().length === 0) && !settings.blockPcdn) return;
  const info = playInfo.result?.video_info ?? playInfo.result ?? playInfo.data ?? playInfo;
  const transform = (item: PlayInfo, dash: boolean): void => {
    const urls = dash
      ? [item.baseUrl, item.base_url, ...(item.backupUrl ?? []), ...(item.backup_url ?? [])]
      : [item.url, ...(item.backup_url ?? [])];
    const addresses = [...new Set(urls.filter((url): url is string => typeof url === "string"))];
    if (!addresses.length) return;
    const candidates = addresses.flatMap(href => {
      try { return acceptableCandidates(null, toMediaAddress(new URL(href))); }
      catch { return []; }
    });
    const chosen = defaultCandidate(candidates, null, performance.now());
    const backups = [...new Set(candidates.map(candidate => candidate.href))].filter(href => href !== chosen?.href);
    if (dash) {
      item.baseUrl = item.base_url = chosen?.href ?? "";
      item.backupUrl = item.backup_url = backups;
    } else {
      item.url = chosen?.href ?? "";
      item.backup_url = backups;
    }
    if (!chosen) console.warn("[BiliCDN] 当前 CDN 选择或 PCDN 规则没有留下可用地址", addresses);
  };
  for (const list of [info.dash?.video, info.dash?.audio, info.dash?.dolby?.audio, info.dash?.flac?.audio]) {
    for (const item of Array.isArray(list) ? list : list ? [list] : []) transform(item, true);
  }
  info.durl?.forEach((item: PlayInfo) => transform(item, false));
  info.durls?.forEach((group: PlayInfo) => group.durl?.forEach((item: PlayInfo) => transform(item, false)));
}
