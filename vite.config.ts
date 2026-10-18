import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import recordedNodes from "./src/bcdn_out.json" with { type: "json" };
import { packNodeData } from "./src/node-data-codec.ts";
import { readFileSync } from "node:fs";

const virtualNodeData = "virtual:bcdn-nodes";
const resolvedNodeData = `\0${virtualNodeData}`;
const nodeData = packNodeData(recordedNodes);

export default defineConfig({
  plugins: [
    {
      name: "bili-cdn:licenses",
      generateBundle: {
        order: "post",
        handler(_options, bundle) {
          const license = `\n/*! bili-cdn — MIT License.\n${readFileSync(new URL("./LICENSE", import.meta.url), "utf8")}\n*/\n`;
          for (const output of Object.values(bundle)) {
            if (!output.fileName.endsWith(".user.js")) continue;
            if (output.type === "chunk") output.code = output.code.replace("// ==/UserScript==", `// ==/UserScript==${license}`);
            else if (typeof output.source === "string") output.source = output.source.replace("// ==/UserScript==", `// ==/UserScript==${license}`);
          }
        },
      },
    },
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
        version: "0.3.0",
        description: "哔哩哔哩 CDN 选择、分片并行下载、PCDN 规则与并发测速",
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
