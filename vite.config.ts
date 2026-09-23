import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import recordedNodes from "./src/bcdn_out.json" with { type: "json" };
import { packNodeData } from "./src/node-data-codec.ts";

const virtualNodeData = "virtual:bcdn-nodes";
const resolvedNodeData = `\0${virtualNodeData}`;
const nodeData = packNodeData(recordedNodes);

export default defineConfig({
  plugins: [
    {
      name: "bili-cdn:node-data",
      resolveId(id) {
        if (id === virtualNodeData) return resolvedNodeData;
      },
      load(id) {
        if (id === resolvedNodeData) return `export default ${JSON.stringify(nodeData)};`;
      },
    },
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "Bilibili CDN切换",
        namespace: "sunfkny",
        version: "0.2.10",
        description: "修改哔哩哔哩播放所用 CDN，支持节点选择和测速",
        icon: "https://www.bilibili.com/favicon.ico",
        "run-at": "document-start",
        match: [
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
          "https://www.bilibili.com/blackboard/newplayer.html*",
          "https://www.bilibili.com/blackboard/video-diagnostics.html*",
        ],
      },
      build: { fileName: "bili-cdn.user.js" },
    }),
  ],
});
