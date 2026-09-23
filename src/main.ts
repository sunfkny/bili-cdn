import { nodeData } from "./node-data";
import { GM_registerMenuCommand, unsafeWindow } from "$";
import { createCdnPanel } from "./cdn-panel";
import { installContextMenuEntry } from "./context-menu";
import { installInterceptor } from "./interceptor";
import type { VideoIds } from "./types";

type PagePlayer = {
  __getUserParams?: () => { input?: { aid?: number | string; cid?: number | string; bvid?: string } };
};

const nativeFetch = unsafeWindow.fetch.bind(unsafeWindow);
const getCurrentVideoIds = (): VideoIds => {
  const player = (unsafeWindow as typeof unsafeWindow & { player?: PagePlayer }).player;
  const input = player?.__getUserParams?.()?.input;
  if (!input) throw new Error("无法获取当前视频信息");
  const ids = {
    aid: String(input.aid ?? ""),
    cid: String(input.cid ?? ""),
    bvid: String(input.bvid ?? ""),
  };
  if (!ids.bvid || !Number.isInteger(Number(ids.aid)) || Number(ids.aid) <= 0 || !Number.isInteger(Number(ids.cid)) || Number(ids.cid) <= 0) {
    throw new Error("当前视频 ID 无效");
  }
  return ids;
};

const openPanel = createCdnPanel(nodeData, nativeFetch, getCurrentVideoIds);
GM_registerMenuCommand("CDN 节点设置", openPanel);
installContextMenuEntry(openPanel);
installInterceptor(unsafeWindow);
