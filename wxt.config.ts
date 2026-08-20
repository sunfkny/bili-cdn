import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Bili CDN",
    description: "按运营商和地区选择并优选 Bili CDN 节点",
    version: "1.0.0",
    permissions: ["storage", "activeTab", "declarativeNetRequestWithHostAccess"],
    host_permissions: [
      "https://api.bilibili.com/*",
      "https://*.bilivideo.com/*",
      "https://*.mcdn.bilivideo.cn/*",
      "https://*.edge.mountaintoys.cn/*",
    ],
    browser_specific_settings: {
      gecko: {
        id: "bili-cdn@sunfkny",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
    web_accessible_resources: [
      {
        resources: ["main-world.js"],
        matches: ["https://*.bilibili.com/*", "https://bili-proxy.biligame.com/*"],
      },
    ],
  },
});
