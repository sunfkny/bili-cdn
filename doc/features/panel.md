# 设置面板与使用

[功能目录](README.md) · [项目首页](../../README.md)

## 安装与入口

项目使用 Vite 和 vite-plugin-monkey 构建用户脚本：

```bash
pnpm install
pnpm build
```

将生成的 `dist/bili-cdn.user.js` 安装到 Tampermonkey、Violentmonkey 等用户脚本管理器。开发服务使用 `pnpm dev`，类型检查使用 `pnpm compile`。

通过播放器右键菜单或用户脚本管理器中的“CDN 节点设置”打开面板。面板沿用粉色、圆角和节点分组风格，左侧顶部为 Thread Ripper 分片并行，其后是通用设置中的下载来源策略。右侧由当前来源策略决定：节点优选显示节点树与测速结果，屏蔽 PCDN 显示规则与域名放行；二者不会同时占用右侧空间。节点优选的测速参数放在左侧，仅在该策略启用时显示。

弹窗高度随当前内容收缩，最多占用屏幕可用高度，超过时各区域滚动，不保留固定高度造成的底部空白。选择接口原有节点时，不显示右侧面板，弹窗通过宽度动画收窄。选择节点优选或屏蔽 PCDN 时恢复双栏布局；切换不会清空节点勾选和规则参数。Thread Ripper 关闭时隐藏详情并保留开关，三个分片数值参数在宽屏同一行排列。窄屏下左右内容纵向排列；减少动态效果的系统偏好下不播放宽度动画。

## 相关功能

- [下载来源策略与分片开关](source-policy.md)
- [节点优选](cdn-selection.md)
- [Thread Ripper 分片并行](thread-ripper.md)
- [PCDN 屏蔽](pcdn.md)
- [CDN 测速](benchmark.md)
