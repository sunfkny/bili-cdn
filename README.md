# Bili CDN 用户脚本

使用 [vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey) 构建的 Bilibili CDN 用户脚本。保留原脚本对播放接口响应的改写和请求拦截方式，并提供运营商、地区、节点选择及测速面板。

## 使用

```bash
pnpm install
pnpm build
```

把 `dist/bili-cdn.user.js` 安装到 Tampermonkey、Violentmonkey 等用户脚本管理器。开发时运行 `pnpm dev`，类型检查运行 `pnpm compile`。

通过播放器右键菜单或用户脚本管理器的“CDN 节点设置”菜单命令打开面板。

面板内可按运营商、地区或单个节点勾选，也可按地区优选或单独测速。修改选择后，后续播放地址响应立即使用当前节点；已生成的播放地址需要重新加载视频。取消全部节点时，脚本停止改写播放地址。

测速使用页面原生 `fetch` 获取节点数据。默认使用当前视频的地址测速，也可在测速设置中切换到固定测试视频。首次读到数据的时间作为首包延迟；下载速度按收到的字节数和整次请求耗时计算。默认测速样本为 4 MB，超时 3 秒。

首次安装默认选择云服务节点中的 Mirror 型 CDN。[`src/bcdn_out.json`](./src/bcdn_out.json) 保留完整采集记录；构建时只提取可用节点，并将层级改为数组、去掉域名公共后缀、合并连续数字域名。运行时还原为面板使用的数据结构。节点选择保存在用户脚本管理器的 `selectedCdnDomains` 设置中。节点采集流程见 [`doc/node_discovery.md`](./doc/node_discovery.md)。

## 代码结构

- `src/main.ts`：用户脚本入口与菜单命令。
- `src/interceptor.ts`、`src/play-info.ts`：播放请求拦截及地址转换。
- `src/domains.ts`：当前域名和首次安装的默认域名。
- `src/cdn-panel.ts`、`src/cdn-panel.css`：层级节点面板。
- `src/benchmark.ts`、`src/transfer-metrics.ts`：节点测速及速度计算。
- `src/node-data-codec.ts`、`vite.config.ts`：压缩完整节点记录并在用户脚本中还原。
