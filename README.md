# Bili CDN

基于 [WXT](https://wxt.dev/) 开发的 Bilibili CDN 节点优选扩展。支持按运营商和地区批量测速，根据延迟与下载速度筛选可用节点，并将视频请求切换到已选 CDN。

## 功能

- 按“运营商 → 地区 → 节点”树形选择一组或多组节点。
- 首次使用时默认选择云服务节点中的 Mirror 型 CDN。
- 支持地区批量优选和单节点测速，显示延迟、速度及测速状态。
- 按页面顺序单线程测速，自动展开并定位到当前测速节点。
- 自动取消不满足延迟或速度要求的节点。
- 测速参数在弹窗内实时保存。
- 支持动态拦截媒体请求，节点或开关变化后对后续请求实时生效。
- 支持拦截 MCDN。
- 提供 Mirror 型 CDN 和 UPOS 型对象存储云服务节点组，可直接测速和选择。
- 动态拦截关闭时，使用播放接口数据改写方式切换 CDN。

## 使用方法

1. 打开 Bilibili 页面并点击扩展图标。
2. 扩展会默认勾选云服务节点中的 Mirror 型 CDN，UPOS 型对象存储默认不选。
3. 点击地区右侧的“优选”，等待该组节点依次完成测速。
4. 优选完成后打开顶部开关。

点击节点右侧的测速结果区域，可以只测试该节点。未达标节点会标黄并自动取消勾选，测速失败节点会显示错误状态。

## 设置

| 设置 | 说明 |
| --- | --- |
| 拦截 MCDN | 控制动态规则是否处理 MCDN 域名，默认开启 |
| 动态拦截请求 | 将后续媒体请求实时切换到生效节点，默认开启 |
| 最大延迟 | 节点允许的最高响应延迟 |
| 最低速度 | 节点需要达到的最低下载速度 |
| 时间上限 | 单个节点测速的超时时间 |
| 测速样本大小 | 每次测速最多下载的数据量，单位为 MB |

## 本地安装

安装依赖并构建 Chromium 扩展：

```bash
pnpm install
pnpm build
```

在 Chromium 浏览器的扩展管理页面开启开发者模式，然后加载 `.output/chrome-mv3` 目录。

构建 Firefox 扩展：

```bash
pnpm build:firefox
```

## 开发

```bash
pnpm install
pnpm dev
```

Firefox 开发模式：

```bash
pnpm dev:firefox
```

检查 TypeScript 类型：

```bash
pnpm compile
```

## 节点数据

节点列表保存在 [`public/bcdn_out.json`](./public/bcdn_out.json)，构建时由 WXT 原样打包到扩展中。

数据来源：[Bilibili 自建视频云生态观察](https://blog.hanlin.press/2026/02/Bilibili-Self-hosted-CDN-Overview)。

CDN 类型和替换限制参见 [`doc/CDN.md`](./doc/CDN.md)。
