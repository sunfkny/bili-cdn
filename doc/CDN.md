# Bilibili 音视频 CDN 说明

> 参考: https://github.com/the1812/Bilibili-Evolved/issues/3234#issuecomment-1504764774

## 类型

| 类型 | 常见特征 | `os` 参数 | 扩展处理方式 |
| --- | --- | --- | --- |
| Mirror | `upos-(sz\|hz\|bstar)-mirror*.bilivideo.com` | `ali`、`cos`、`hw` 等 | 默认替换为选择的节点 |
| UPOS 对象存储 | `upos-sz-estg*.bilivideo.com` | `upos` | 默认替换为选择的节点 |
| BCache | `cn-*.bilivideo.com` 或 `cn-*.bilivideo.cn` | `bcache` | 播放信息改写，动态规则兜底 |
| MCDN | MCDN 域名，或其他域名携带 `os=mcdn` | `mcdn` | 由“拦截 MCDN”控制 |
| PCDN 资源 | `http://IP:Port/v1/resource/*` | 不固定 | 播放数据回退逻辑会移除该地址 |
| 免流 | `(upos\|proxy).*-tf-*.bilivideo.com` | 不固定 | 部分签名和免流规则与普通 CDN 不同 |

判断 MCDN 时应同时检查主机名和 `os` 参数。例如，主机名中包含 `mirror` 的地址在携带 `os=mcdn` 时仍属于 MCDN 调度。

## Mirror CDN

国内 Mirror 地址通常位于 `bilivideo.com`，常见厂商标识包括：

- `mirrorali`、`mirroralib`、`mirroralio1`
- `mirrorbd`
- `mirrorcos`、`mirrorcosb`、`mirrorcoso1`
- `mirrorhw`、`mirrorhwb`、`mirrorhwo1`
- `mirror08c`、`mirror08h`、`mirror08ct`

海外地址可能包含 `ov`、`bstar`，或使用 `akamaized.net`。部分海外和东南亚地址存在域名签名或参数校验，不能保证更换主机名后仍然可用。本扩展的动态规则仅替换 `bilivideo.com` 下的 Mirror 地址，不处理 Akamai 地址。

## UPOS 对象存储

常见主机名包括：

- `upos-sz-estghw.bilivideo.com`
- `upos-sz-estgcos.bilivideo.com`
- `upos-sz-estgoss.bilivideo.com`

扩展同时使用 `upos-sz-estg*` 主机名和 `os=upos` 查询参数识别这类地址。

## BCache

BCache 是 Bilibili 自建节点，常见命名形式为：

```text
cn-{地区}-{运营商}-{编号}.bilivideo.com
```

运营商字段通常为 `cu`（联通）、`ct`（电信）或 `cm`（移动）。节点质量和 IPv6 可用性会随地区与运营商变化。

## MCDN 与 PCDN

扩展的“拦截 MCDN”设置覆盖：

- `*.mcdn.bilivideo.cn`
- `*.edge.mountaintoys.cn`
- 携带 `os=mcdn` 的 `bilivideo.com` 请求

`/v1/resource/` 类型地址可能缺少普通 CDN 所需的参数，因此不能假定只替换 Host 就能正常播放。

## 替换限制

更换 CDN 主机名时需要保留原始路径和查询参数。是否能够替换还取决于签名方式：

- 国内 BCache、UPOS 和部分 MCDN 地址通常可以切换到国内节点。
- 部分海外 Mirror 地址的签名可能绑定域名。
- Akamai 地址通常有额外参数校验。
- `bstar` 地址可能因域名签名在替换后返回错误。
- 免流地址具有独立的鉴权和流量规则。

## 扩展中的节点

节点列表中的“云服务节点”分组提供国内 Mirror 型 CDN 和 UPOS 型对象存储域名，可以按普通地区分组进行测速和选择。
