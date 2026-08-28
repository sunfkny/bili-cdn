# CDN 节点发现与验证

`public/bcdn_out.json` 汇总证书查询、子域名接口、编号扩展和连通性验证得到的节点。

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

当前办公节点共 26 个，均未通过视频验证。后续采集在候选阶段预先排除办公节点；外建特殊节点仍保留并继续实测，其中已有可用节点。

## 视频验证

使用 `utils/constants.ts` 的 `BENCHMARK_API_URL` 获取 DASH 视频地址，将主机名替换为候选域名并保留路径、查询参数和签名。请求携带 `Referer`、`User-Agent` 和 `Range`，检查 HTTP 状态及 MP4 `ftyp` 标记，并重复测试。至少一轮返回有效视频数据的节点标记为 `available`。界面和 `utils/nodes.ts` 仅使用 `available` 节点。

## 分类

验证后的域名根据命名结构分入运营商、地区和节点类型：

- `cn-*`、`ec-*` 等自建节点默认归入 BCache。
- 办公用途节点归入 `office`。
- 外建特殊节点归入 `external`。
- `upos-*mirror*` 归入云服务 Mirror。
- 其他 `upos-*` 归入云服务 UPOS。
- 名称含 `ov`、`oversea`、`bstar`、`asia` 或 `akam` 等海外特征的节点使用 `oversea` 范围。
