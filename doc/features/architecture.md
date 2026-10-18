# 媒体管线与实现边界

[功能目录](README.md) · [项目首页](../../README.md)

## 媒体处理管线

脚本在 `document-start` 安装统一的 XHR／fetch 拦截入口，并处理已有及后续赋值的 `window.__playinfo__`。播放信息先进入媒体登记表，再进行地址改写：

```text
播放接口响应 / __playinfo__
            ↓
登记原始音视频文件、主备地址、签名与初始化段范围
            ↓
生成候选 → 按来源策略应用手选限制或 PCDN 屏蔽与放行
            ↓
改写播放地址 / 路由播放器的后续媒体请求
            ↓
符合接管条件且开启分片：Thread Ripper
其他情况：非分片下载
            ↓
可检查的最终响应继续校验 CDN / PCDN 策略
```

先登记原始地址，是为了保留播放接口提供的主备来源、不同清晰度、音视频编码与签名信息。若只在改写后登记，原始备选地址可能已经丢失，分片与后续策略切换便失去可靠来源。

媒体文件登记包含普通视频／番剧的 DASH 视频、音频，以及 Dolby、FLAC 音频。非 DASH 的部分 `durl` 地址也进行策略改写，但不因此获得 DASH 分片接管能力。

普通媒体路由与分片下载共享候选规则，避免一个入口屏蔽某个地址，另一个入口又把它作为回退来源。fetch 与可接管的媒体 XHR 会检查最终响应地址；分片请求也检查重定向结果。跟随重定向时，浏览器可能已连接到最终站点后才能检查地址，因此这里是响应接受策略，不是浏览器级的连接前网络防火墙。

## 状态与代码组织

基础设施按职责分层：`network` 提供通用 XHR 生命周期、合成响应与 HTTP 范围处理，`utils` 提供基础工具；两者不依赖媒体策略或分片引擎。`media` 管理文件、候选节点、节点模型及媒体响应分类，供普通媒体路由与分片引擎共用。`thread-ripper` 只负责分片调度，并通过媒体层与网络层接口接入播放器。XHR 类型独立定义，不包含播放器或分片引擎类型。

用户脚本管理器持久化的设置包括：

| 存储键 | 内容 |
| --- | --- |
| `selectedCdnDomains` | 所选节点域名 |
| `biliCdnPlaybackSettings` | 互斥来源策略、PCDN 规则、放行及分片参数 |
| `biliCdnPanelSettings` | 测速阈值、并发与视频来源 |
| `biliCdnBenchmarkResults` | 节点测速结果与时间戳 |

分片缓冲、头部缓存、Host 测量、冷却及媒体登记是页面内运行状态，不等同于持久化测速结果。播放引擎使用实际媒体请求建立模型，不直接把面板测速结果当作每个视频的调度速度，因为文件缓存与请求时机可能不同。

| 源码 | 职责 |
| --- | --- |
| [`main.ts`](../../src/main.ts) | 保存原生 fetch、面板入口与脚本初始化 |
| [`interceptor.ts`](../../src/interceptor.ts)、[`play-info.ts`](../../src/play-info.ts) | 统一拦截、媒体登记、播放信息改写与媒体路由 |
| [`playback-policy.ts`](../../src/playback-policy.ts)、[`playback-settings.ts`](../../src/playback-settings.ts) | 规则匹配、默认值与播放设置持久化 |
| [`domains.ts`](../../src/domains.ts) | 节点选择与变更通知 |
| [`engine.ts`](../../src/thread-ripper/engine.ts) | 分片、竞速、救援、预热与失败回退 |
| [`registry.ts`](../../src/media/registry.ts)、[`candidates.ts`](../../src/media/candidates.ts) | 文件登记与候选生成 |
| [`host-model.ts`](../../src/media/host-model.ts)、[`response-classify.ts`](../../src/media/response-classify.ts)、[`range.ts`](../../src/network/range.ts) | 节点评估、响应／错误分类与范围校验 |
| [`xhr-override.ts`](../../src/network/xhr-override.ts) | 合成 XHR 的事件、响应、取消与超时适配 |
| [`cdn-panel.ts`](../../src/cdn-panel.ts)、[`cdn-panel.css`](../../src/cdn-panel.css) | Shadow DOM 面板及响应式布局 |
| [`benchmark.ts`](../../src/benchmark.ts)、[`transfer-metrics.ts`](../../src/network/transfer-metrics.ts)、[`concurrent-tasks.ts`](../../src/utils/concurrent-tasks.ts) | 视频来源、节点测速、速度计算与任务池 |
| [`xhr-types.ts`](../../src/network/xhr-types.ts)、[`player.ts`](../../src/media/player.ts) | 通用 XHR 钩子类型与媒体服务接口 |
| `src/utils/` | 日志、对象判断、只读 URL 类型及原生函数外观适配 |
| [`node-data-codec.ts`](../../src/node-data-codec.ts)、[`vite.config.ts`](../../vite.config.ts) | 节点数据压缩、还原与用户脚本构建 |

节点类型背景见 [CDN 说明](../CDN.md)，采集流程见[节点发现说明](../node_discovery.md)。

## 适用范围与实现边界

功能主要面向匹配页面中的 DASH 点播媒体，不保证覆盖直播、所有 fetch 播放路径或浏览器自身直接加载媒体的全部入口。非 `arraybuffer`、同步、携带凭据或额外请求头等 XHR 不属于分片接管范围，其重定向也不能一概承诺经过相同的响应校验。

PCDN 判断是媒体地址策略，不是流量抓包、SDK 禁用或操作系统网络过滤。地址被允许只说明符合当前策略，仍可能因为跨域限制、证书、节点缺文件、签名、Range 支持或站点限制而失败。

本地模拟请求中验证过 Range 合并、并发测速与面板交互，但实际 B 站账号、清晰度切换、分 P、网络异常及长时间播放表现尚未完成实站验证。构建成功不代表所有播放路径都已验证。

## 相关说明

- [来源策略与切换](source-policy.md)
- [Thread Ripper 上游与许可](thread-ripper.md#上游与许可)
