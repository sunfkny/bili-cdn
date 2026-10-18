# Bili CDN

bili-cdn 是支持 Bilibili CDN 节点选择、Thread Ripper 分片并行下载、PCDN 屏蔽与节点测速的用户脚本。

## 开发使用

```bash
pnpm install
pnpm build
```

构建产物为 `dist/bili-cdn.user.js`，安装到 Tampermonkey、Violentmonkey 等用户脚本管理器后使用。通过播放器右键菜单或用户脚本管理器中的“CDN 节点设置”打开面板。

开发服务运行 `pnpm dev`，类型检查运行 `pnpm compile`。

## 代码结构

| 文件或目录 | 职责 |
| --- | --- |
| `src/main.ts`、`src/context-menu.ts` | 脚本初始化、菜单与播放器右键入口 |
| `src/interceptor.ts`、`src/play-info.ts` | 播放信息处理、媒体请求拦截与地址改写 |
| `src/domains.ts` | 节点选择、默认节点与持久化 |
| `src/playback-policy.ts`、`src/playback-settings.ts` | 下载来源策略、PCDN 规则与播放设置 |
| `src/thread-ripper/` | 分片调度、竞速、救援、预热与失败回退 |
| `src/media/` | 媒体登记、候选生成、节点评估及响应分类 |
| `src/network/` | XHR 拦截与合成响应、Range 解析及传输指标 |
| `src/utils/` | 并发任务池、日志、对象判断及原生函数外观适配 |
| `src/cdn-panel.ts`、`src/cdn-panel.css` | 设置面板、节点树与响应式布局 |
| `src/benchmark.ts` | 测速视频解析与节点测速 |
| `src/bcdn_out.json`、`src/node-data.ts`、`src/node-data-codec.ts` | 节点采集数据、运行时结构与数据编解码 |
| `vite.config.ts` | 节点数据打包与用户脚本构建 |
| `LICENSE` | 项目 MIT 许可及移植代码署名，随用户脚本构建产物附带 |
| `doc/` | 功能原理、CDN 类型与节点采集说明 |

## 功能说明

下载来源分为“接口原有节点”“节点优选”“屏蔽 PCDN”三种互斥策略，Thread Ripper 可与任一策略组合。详细设置、判断依据和设计取舍见[完整功能说明](doc/features/README.md)。

### 节点优选

按运营商、地区或单节点选择播放所用的普通 CDN，并可按地区测速筛选达标节点。空选时使用接口原有候选；选择非空时遵守所选范围，不自动回退到未选节点。普通文件地址可以迁移到所选 CDN，`/v1/` 等专用路径不会直接拼接过去。[地址迁移原理](doc/features/cdn-selection.md#cdn-候选与地址迁移)

### Thread Ripper 分片并行

将符合条件的 DASH 音视频 Range XHR 拆分到可用 CDN 下载，通过竞速、停滞救援和尾部转移减少慢请求的影响，校验数据后合并返回播放器。可设置总并发、单节点并发、最大片数和头部预热；默认关闭。[调度、校验与回退原理](doc/features/thread-ripper.md)

### PCDN 屏蔽

按域名、`os=mcdn`、302 调度域名、resource 路径及 IP 条件过滤接口原有候选。mcdn、szbdyd、nexusedgeio、七牛和 mountaintoys 域名均有独立开关，勾选表示阻止；域名放行优先于屏蔽规则。[规则及判断依据](doc/features/pcdn.md)

### CDN 测速

支持单节点、所选节点和地区优选测速，显示首包延迟与整次请求吞吐。可设置并发数、样本大小、超时及达标阈值，也可取消任务；支持当前视频或自定义 BV／av／视频链接及分 P。测速使用独立原生请求，避免测到分片合计吞吐。[测速指标与视频来源](doc/features/benchmark.md)

### 设置面板

左侧顶部为 Thread Ripper，其后是下载来源策略及相关参数；右侧按策略显示节点树或 PCDN 规则，二者互斥。选择接口原有节点时隐藏右侧，弹窗按内容收缩，内容过长时滚动。设置与测速结果自动保存。[面板使用与入口](doc/features/panel.md#安装与入口)

CDN 类型背景见 [CDN 说明](doc/CDN.md)，节点采集流程见[节点发现说明](doc/node_discovery.md)。
