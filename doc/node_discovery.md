# CDN 节点发现与验证

[`src/bcdn_out.json`](../src/bcdn_out.json) 汇总证书查询、子域名接口、编号扩展和连通性验证得到的节点。最近一轮记录见 [2026-10-18 探测结果](node-discovery-2026-10-18.md)。

## 子域名来源

使用以下接口获取 `bilivideo.com` 子域名：

- [crt.name](https://crt.name/v1/search?apex=bilivideo.com)
- [SrcLab DNS 检测](https://srclab.cn/api/server/dnsDetect/?domain=bilivideo.com)

统一转换为小写，补全根域名，合并新旧结果并去重。`upcdn` 表示上传相关命名，排除项处理。

视频节点候选使用 `cn-`、`ec-`、`upos-`，以及外建 CDN 的 `c0--`、`c1--`、`d0--`、`d1--` 前缀。

## 根据编号扩展候选

Bilibili 自建节点通常具有递增的数字编号，例如：

```text
cn-{地区}-{运营商}-{集群编号}-{节点编号}.bilivideo.com
```

根据节点命名模板识别数字字段，补齐已有序号缺口，并向最小、最大序号两端继续探测。多数字段逐项扩展，保留其他字段组合。每个生成的域名都进入 DNS 验证。

## DNS 验证

每个候选进行多轮 A、AAAA 查询：

- 任意一轮取得地址，进入视频验证。
- 多轮均无地址的域名从结果中移除。
- DNS 存在但视频验证失败的域名标记为 `unreachable`。

历史办公节点共 26 个，均未通过视频验证，候选阶段预先排除，不纳入节点库；外建特殊节点保留并继续实测。已知 PCDN 域名和名称包含 `302` 的调度域名不进入手选普通 CDN 列表。历史证书异常不足以永久判定某域名为 PCDN；`upos-sz-mirror14b.bilivideo.com` 本轮证书与视频验证通过，按普通 Mirror 节点保留，具体 URL 携带 `os=mcdn` 时仍按请求特征识别。

## 视频验证

使用 [`src/benchmark.ts`](../src/benchmark.ts) 的固定测试视频及另一个独立视频获取 DASH 地址，先确认来源节点能返回视频。只选 HTTPS `/upgcxcode/` 地址，替换主机名时保留路径、查询参数和签名，不将 `/v1/` 等专用资源路径拼接到普通 CDN。

请求携带 `Referer`、`User-Agent` 和 `Range: bytes=0-1023`，禁止跟随重定向。检查 HTTP 状态、206 响应的 `Content-Range`、实际读取长度，以及偏移 4–7 的 MP4 `ftyp` 标记。读取达到样本大小后取消响应流，避免不支持 Range 的节点触发整段下载。失败项使用另一个视频重试，结束时再次验证来源节点，防止过期签名或来源故障导致整库误判。

至少一轮返回有效视频数据的节点标记为 `available`；DNS 存在但两轮视频验证均失败的节点标记为 `unreachable`。界面仅加载 `available` 节点，由 [`src/node-data-codec.ts`](../src/node-data-codec.ts) 在构建时筛选。

基础可用性不代表下载吞吐。历史慢节点单独采用 4 MiB 样本、两个视频、三轮串行请求，与普通 Mirror 节点对照，并分别记录 HTTP/1.1 和 HTTP/2 的首包时间、吞吐及失败原因。本地测速结果受网络出口、缓存和请求时机影响，不作为所有地区的统一性能排名。

## 分类

验证后的域名根据命名结构分入运营商、地区和节点类型：

- `cn-*`、`ec-*` 等自建节点默认归入 BCache。
- 办公用途节点归入 `office`。
- 外建特殊节点归入 `external`。
- `upos-*mirror*` 归入云服务 Mirror。
- 其他 `upos-*` 归入云服务 UPOS。
- 名称含 `ov`、`oversea`、`bstar`、`asia` 或 `akam` 等海外特征的节点使用 `oversea` 范围。
