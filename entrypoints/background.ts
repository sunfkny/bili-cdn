import { STORAGE_KEY } from "../utils/constants";
import type { CdnSettings } from "../utils/types";

const BENCHMARK_HEADER_RULE_ID = 1;
const CDN_TARGET_ALLOW_RULE_ID = 2;
const CDN_REDIRECT_RULE_ID = 3;
const CDN_RESOURCE_BLOCK_RULE_ID = 7;
const MCDN_DOMAIN_BLOCK_RULE_ID = 8;
const MCDN_QUERY_BLOCK_RULE_ID = 9;
const RULE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default defineBackground(() => {
  async function refreshNetworkRules(): Promise<void> {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as
      | CdnSettings
      | undefined;
    const activeDomains = stored?.activeDomains?.filter(Boolean) ?? [];
    const extensionEnabled = Boolean(stored?.enabled && activeDomains.length);
    const dynamicInterceptionEnabled = Boolean(
      extensionEnabled &&
        stored?.dynamicRequestInterception !== false &&
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

    if (extensionEnabled) {
      addRules.push(
        {
          id: CDN_RESOURCE_BLOCK_RULE_ID,
          priority: 4,
          action: { type: "block" },
          condition: {
            requestDomains: [
              "bilivideo.com",
              "mcdn.bilivideo.cn",
              "edge.mountaintoys.cn",
            ],
            regexFilter: "^https?://[^/]+(:[0-9]+)?/v1/resource/",
            initiatorDomains: ["bilibili.com", "biligame.com"],
          },
        },
        {
          id: MCDN_DOMAIN_BLOCK_RULE_ID,
          priority: 4,
          action: { type: "block" },
          condition: {
            requestDomains: ["mcdn.bilivideo.cn", "edge.mountaintoys.cn"],
            initiatorDomains: ["bilibili.com", "biligame.com"],
          },
        },
        {
          id: MCDN_QUERY_BLOCK_RULE_ID,
          priority: 4,
          action: { type: "block" },
          condition: {
            requestDomains: ["bilivideo.com"],
            regexFilter: "[?&]os=mcdn([&#]|$)",
            initiatorDomains: ["bilibili.com", "biligame.com"],
          },
        },
      );
    }

    if (dynamicInterceptionEnabled) {
      const targetDomain = activeDomains[0]!;
      addRules.push(
        {
          id: CDN_TARGET_ALLOW_RULE_ID,
          priority: 3,
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
            requestDomains: ["bilivideo.com"],
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
