import { GM_getValue, GM_setValue } from "$";
import { normalizePlaybackSettings, type PlaybackSettings } from "./playback-policy";

const key = "biliCdnPlaybackSettings";
let settings = normalizePlaybackSettings(GM_getValue(key, {}));
const listeners = new Set<() => void>();

export function getPlaybackSettings(): Readonly<PlaybackSettings> { return settings; }

export function setPlaybackSettings(value: Partial<PlaybackSettings>): void {
  const next = { ...settings, ...value };
  if (value.cdnSelection === true) next.blockPcdn = false;
  else if (value.blockPcdn === true) next.cdnSelection = false;
  settings = normalizePlaybackSettings(next);
  GM_setValue(key, settings);
  for (const listener of listeners) listener();
}

export function onPlaybackSettingsChange(listener: () => void): void { listeners.add(listener); }
