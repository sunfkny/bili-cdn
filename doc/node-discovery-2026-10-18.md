# 2026-10-18 CDN 探测与发现

[探测方法](node_discovery.md) · [项目首页](../README.md)

本轮参考对话 `01a04646-b20c-7103-a9f8-d7296dfda36e` 中的采集要求，更新 [`src/bcdn_out.json`](../src/bcdn_out.json)。所有请求从本机网络出口发起，结果反映本轮可达性，不表示其他地区的速度或长期可用性。

## 发现结果

| 项目 | 数量 |
| --- | ---: |
| 原节点库 | 1776 |
| 来源接口合并后的候选 | 606 |
| 来源候选中不在原库的域名 | 182 |
| 合并旧库并扩展编号后的 DNS 候选 | 11658 |
| A／AAAA 至少一项成功 | 1834 |
| 视频验证至少一轮成功，含后续按策略排除项 | 653 |
| 写回节点库 | 1829 |
| 写回的 available 节点 | 650 |
| 写回的 unreachable 节点 | 1179 |
| 新增节点 | 84 |
| 其中新增 available 节点 | 18 |
| 原 unreachable 恢复为 available | 107 |
| 原 available 转为 unreachable | 4 |

来源为 [crt.name 证书查询](https://crt.name/v1/search?apex=bilivideo.com) 和 [SrcLab DNS 检测](https://srclab.cn/api/server/dnsDetect/?domain=bilivideo.com)。SrcLab 本次返回数据的 `updated_time` 为 `2025-07-25 20:11:51`，来源记录仅作为候选，均以本轮 DNS 和视频实测为准。

编号扩展逐项处理域名数字字段，补齐现有最小值至最大值之间的缺口，并各向外延伸 4 个编号；不进行多字段全组合。对大于 512 的数字和非 Mirror UPOS 名称中的数字不盲目扩展，避免将哈希、存储标识当作节点编号。

DNS 并发 64，查询 A 和 AAAA；失败项共查询三轮。三个不存在的控制域名均未解析，未观察到这些控制域名的泛解析。视频阶段首轮并发 40、总超时 6 秒，失败项更换独立视频后以并发 24、总超时 9 秒重试。

使用 `BV1qM4y1w716` 与 `BV1rp4y1e745` 的 DASH 视频 `/upgcxcode/` 地址，保留原始路径和查询参数，发送 1 KiB Range 请求，禁止重定向并校验状态、范围、实际长度和 MP4 `ftyp`。来源节点在开始和结束时验证通过；不使用 `/v1/` 专用资源地址。整库基础验证使用 Node.js fetch（HTTP/1.1），慢节点另做 HTTP/2 对照，基础视频验证失败不等同于所有协议下永久不可用。

## 清理与分类

- 移除历史办公节点 26 个、上传用途域名 2 个，不进入普通视频节点库。
- 移除三轮均无 DNS 的旧节点 1 个。
- 移除名称含 `302` 的调度域名 2 个。`upos-sz-mirror14b.bilivideo.com` 经专项复核后保留，依据见下文。
- 原节点保留已有运营商和地区归属。新增 `cmcc` 归入中国移动，`dx` 归入中国电信；地区编号后缀不改变地理分组。
- 外建节点保留原有顺序，新增项追加；其他节点组按完整域名排序。只有 `available` 节点进入构建后的可选列表。

新增且通过视频验证的节点：

- `c1--cn-gotcha01.bilivideo.com`
- `cn-gddg-cu-01-41.bilivideo.com`
- `cn-gddg-cu-01-42.bilivideo.com`
- `cn-lnsy-cm-01-12.bilivideo.com`
- `cn-lnsy-cm-01-13.bilivideo.com`
- `cn-lnsy-cm-01-14.bilivideo.com`
- `cn-lnsy-cm-01-15.bilivideo.com`
- `cn-zjhz3-wasu-bcache-04.bilivideo.com`
- `cn-zjhz3-wasu-bcache-06.bilivideo.com`
- `cn-zjhz3-wasu-bcache-07.bilivideo.com`
- `cn-zjhz3-wasu-bcache-09.bilivideo.com`
- `cn-zjhz3-wasu-bcache-10.bilivideo.com`
- `cn-zjhz3-wasu-bcache-12.bilivideo.com`
- `ec-jssz-ct-01-01.bilivideo.com`
- `ec-jssz-ct-01-03.bilivideo.com`
- `ec-jssz-ct-01-04.bilivideo.com`
- `ec-jssz-ct-01-05.bilivideo.com`
- `ec-jssz-ct-01-06.bilivideo.com`

从旧库移除的非办公域名：

- `upos-cs-upcdnbldsa.bilivideo.com`：上传用途。
- `upos-sz-302kodo.bilivideo.com`：现有 PCDN 分类。
- `upos-sz-302ppio.bilivideo.com`：现有 PCDN 分类。
- `upos-sz-upcdnbda2.bilivideo.com`：上传用途。
- `cn-hblf-ct-01-01.bilivideo.com`：三轮无 DNS。

## 历史慢节点复测

每个节点采用 4 MiB 样本、两个视频和三轮串行下载；HTTP/1.1 与 HTTP/2 分别测量，均校验证书、206 范围及视频头。以下为成功样本的中位数，首包为读取到首个数据块的时间；HTTP/2 测量按 8 KiB 块读取。不同客户端的首包数值不宜直接作为严格的协议性能差异。

| 域名 | HTTP/1.1 吞吐中位数 | HTTP/2 成功 | HTTP/2 首包中位数 | HTTP/2 吞吐中位数 |
| --- | ---: | ---: | ---: | ---: |
| `upos-sz-mirror08disp.bilivideo.com` | 8.24 Mbps | 3/3 | 93.8 ms | 8.50 Mbps |
| `upos-sz-mirrorhwdisp.bilivideo.com` | 8.18 Mbps | 3/3 | 145.5 ms | 8.32 Mbps |
| `upos-sze6fcab1avod-hkep.bilivideo.com` | 无成功样本 | 0/3 | — | — |
| `upos-sz-mirrorali.bilivideo.com` | 51.86 Mbps | 3/3 | 85.3 ms | 88.06 Mbps |
| `upos-sz-mirrorcos.bilivideo.com` | 122.84 Mbps | 3/3 | 173.6 ms | 110.99 Mbps |
| `upos-sz-mirrorhw.bilivideo.com` | 85.66 Mbps | 3/3 | 69.6 ms | 219.40 Mbps |


两个 `disp` 节点可以返回有效视频，但两种协议下均约 8 Mbps，低于面板默认最低速度 10 Mbps；它们的首包时间并不能代表持续吞吐。`hkep` 节点本轮多次连接或读取超时，三轮 HTTP/2 均未完成样本。因此这三个节点维持排除，未重新加入节点库。该结论只反映本轮本机出口，不推断节点实施了固定限速。

原始 DNS、视频请求、慢节点样本和变更明细保存在本地忽略目录 `tmp_scripts/discovery-*.json`；签名播放 URL 不写入本报告。


## mirror14b 专项复核

`upos-sz-mirror14b.bilivideo.com` 的历史固定 PCDN 判定来自[上游提交 e1e7ccd](https://github.com/SukkaW/Make-Bilibili-Great-Than-Ever-Before/commit/e1e7ccd)，其注释依据为当时证书仅匹配 `*.bilivideo.cn`。[bili-sync 的问题记录](https://github.com/amtoaer/bili-sync/issues/620)也记录过这一证书错误。历史证书错配本身不足以证明当前服务仍为 PCDN。

2026-10-18 本机复核结果：

- 系统 DNS、Google DoH、Cloudflare DoH 均返回 CNAME `upos-sz-mirror14b.bilivideo.com.ctlcdn.cn`；有 A 与 AAAA 记录。CNAME 只记录本轮调度结果，不单独作为服务性质证明。
- 本机选中的 IPv6 地址及抽查的两个 IPv4 地址均通过 TLS 证书校验。证书 SAN 为 `*.bilivideo.com` 和 `bilivideo.com`，主体为上海幻电信息科技有限公司，GlobalSign 签发，有效期 2026-06-16 至 2027-01-01；历史域名错配未复现。
- 普通 `/upgcxcode/` 视频地址直接返回 206，未重定向，`Content-Range` 与 MP4 视频头符合预期。
- 两个视频、三轮 HTTP/2、每次 4 MiB，三轮均成功；吞吐分别为 38.53、26.82、57.03 Mbps，中位数 38.53 Mbps。

因此移除仅凭域名命中的固定 PCDN 条目，并将该节点恢复为 `available`。这次恢复属于旧节点判定纠正，不计入新增的 18 个可用节点；最终可用节点数为 650，节点总数为 1829。具体播放 URL 若携带 `os=mcdn`，仍由请求特征规则识别，不保证同一域名在所有地区和未来时刻都使用同一种后端。
