import { STORAGE_KEY } from "../utils/constants";
import type { CdnSettings } from "../utils/types";

const BENCHMARK_HEADER_RULE_ID = 1;
const CDN_ALLOW_RULE_ID = 2;
const CDN_REDIRECT_RULE_ID = 3;
const RULE_IDS = [
  BENCHMARK_HEADER_RULE_ID,
  CDN_ALLOW_RULE_ID,
  CDN_REDIRECT_RULE_ID,
];

export default defineBackground(() => {
  async function refreshNetworkRules(): Promise<void> {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as
      | CdnSettings
      | undefined;
    const activeDomains = stored?.activeDomains?.filter(Boolean) ?? [];
    const dynamicInterceptionEnabled = Boolean(
      stored?.enabled &&
        stored.dynamicRequestInterception !== false &&
        activeDomains.length,
    );
    const addRules: NonNullable<
      Parameters<typeof browser.declarativeNetRequest.updateDynamicRules>[0]["addRules"]
    > = [
      {
        id: BENCHMARK_HEADER_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            {
              header: "Referer",
              operation: "set",
              value: "https://www.bilibili.com/",
            },
            {
              header: "Origin",
              operation: "remove",
            },
          ],
        },
        condition: {
          requestDomains: ["bilivideo.com"],
          initiatorDomains: [browser.runtime.id],
          resourceTypes: ["xmlhttprequest"],
        },
      },
    ];

    if (dynamicInterceptionEnabled) {
      const targetDomain = activeDomains[0]!;
      const requestDomains = ["bilivideo.com"];
      if (stored?.interceptMcdn !== false) {
        requestDomains.push("mcdn.bilivideo.cn", "edge.mountaintoys.cn");
      }
      addRules.push(
        {
          id: CDN_ALLOW_RULE_ID,
          priority: 2,
          action: { type: "allow" },
          condition: {
            requestDomains: activeDomains,
            initiatorDomains: ["bilibili.com", "biligame.com"],
          },
        },
        {
          id: CDN_REDIRECT_RULE_ID,
          priority: 1,
          action: {
            type: "redirect",
            redirect: {
              transform: {
                scheme: "https",
                host: targetDomain,
                port: "",
              },
            },
          },
          condition: {
            requestDomains,
            initiatorDomains: ["bilibili.com", "biligame.com"],
          },
        },
      );
    }

    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: RULE_IDS,
      addRules,
    });
  }

  browser.runtime.onInstalled.addListener(() => {
    void refreshNetworkRules();
  });
  browser.runtime.onStartup.addListener(() => {
    void refreshNetworkRules();
  });
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      void refreshNetworkRules();
    }
  });
  void refreshNetworkRules();
});
