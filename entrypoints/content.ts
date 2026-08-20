import { CONFIG_EVENT, STORAGE_KEY } from "../utils/constants";
import { getRecommendedRegionIds, loadNodeData, resolveDomains } from "../utils/nodes";
import type { CdnRuntimeConfig, CdnSettings } from "../utils/types";

const matches = [
  "https://www.bilibili.com/video/*",
  "https://www.bilibili.com/bangumi/play/*",
  "https://www.bilibili.com/blackboard/*",
  "https://www.bilibili.com/mooc/*",
  "https://www.bilibili.com/v/*",
  "https://www.bilibili.com/documentary/*",
  "https://www.bilibili.com/variety/*",
  "https://www.bilibili.com/tv/*",
  "https://www.bilibili.com/guochuang/*",
  "https://www.bilibili.com/movie/*",
  "https://www.bilibili.com/anime/*",
  "https://www.bilibili.com/match/*",
  "https://www.bilibili.com/cheese/*",
  "https://www.bilibili.com/list/*",
  "https://www.bilibili.com/watchlater/*",
  "https://m.bilibili.com/video/*",
  "https://bili-proxy.biligame.com/www/blackboard/newplayer.html*",
];

export default defineContentScript({
  matches,
  runAt: "document_start",
  async main() {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as
      | CdnSettings
      | undefined;
    const enabled = Boolean(stored?.enabled && stored.activeDomains?.length);
    let domains = enabled ? stored?.activeDomains : [];
    const interceptMcdn = stored?.interceptMcdn !== false;
    const dynamicRequestInterception =
      stored?.dynamicRequestInterception !== false;

    if (enabled && !domains) {
      const data = await loadNodeData();
      const selectedRegionIds = stored?.selectedRegionIds?.length
        ? stored.selectedRegionIds
        : await getRecommendedRegionIds(data);
      domains = stored?.selectedDomains?.length
        ? stored.selectedDomains
        : resolveDomains(data, selectedRegionIds);
    }

    await injectScript("/main-world.js", {
      keepInDom: true,
      modifyScript(script) {
        script.dataset.domains = JSON.stringify(domains);
        script.dataset.interceptMcdn = String(interceptMcdn);
        script.dataset.dynamicRequestInterception = String(
          dynamicRequestInterception,
        );
      },
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const settings = changes[STORAGE_KEY]?.newValue as CdnSettings | undefined;
      if (Array.isArray(settings?.activeDomains)) {
        const config: CdnRuntimeConfig = {
          activeDomains:
            settings.enabled === false ? [] : settings.activeDomains,
          interceptMcdn: settings.interceptMcdn !== false,
          dynamicRequestInterception:
            settings.dynamicRequestInterception !== false,
        };
        window.dispatchEvent(
          new CustomEvent(CONFIG_EVENT, {
            detail: config,
          }),
        );
      }
    });
  },
});
