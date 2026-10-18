import { runConcurrent } from "./utils/concurrent-tasks";
import { getPlaybackSettings, setPlaybackSettings } from "./playback-settings";
import type { PlaybackSettings } from "./playback-policy";
import css from "./cdn-panel.css?inline";
import { GM_getValue, GM_setValue } from "$";
import { benchmarkDomain, getBenchmarkUrl } from "./benchmark";
import { getDomains, setDomains } from "./domains";
import type { BenchmarkResult, BenchmarkSettings, NodeData, ProviderRecord, RegionRecord, NodeRecord, VideoIds } from "./types";

const settingsKey = "biliCdnPanelSettings";
const resultKey = "biliCdnBenchmarkResults";
const defaults: BenchmarkSettings = { maxLatencyMs: 100, minSpeedMbps: 10, timeoutMs: 3000, sampleSizeKb: 4096, useCurrentVideo: true, concurrency: 3, testVideo: "", testVideoPart: 1 };

type PanelRegion = RegionRecord & { nodes: NodeRecord[] };
type PanelProvider = Omit<ProviderRecord, "regions"> & { regions: PanelRegion[] };

export function createCdnPanel(nodeData: NodeData, nativeFetch: typeof fetch, getCurrentVideoIds: () => VideoIds): () => void {
  const providers: PanelProvider[] = nodeData.providers.map((provider) => ({
    ...provider,
    regions: provider.regions.map((region) => ({
      ...region,
      nodes: region.nodes,
    })).filter((region) => region.nodes.length),
  })).filter((provider) => provider.regions.length);
  let selected = new Set(getDomains());
  let settings: BenchmarkSettings = { ...defaults, ...GM_getValue<Partial<BenchmarkSettings>>(settingsKey, {}) };
  for (const [key, min, max] of [
    ["concurrency", 1, 16], ["maxLatencyMs", 10, 60000], ["minSpeedMbps", 0, 10000],
    ["timeoutMs", 200, 60000], ["sampleSizeKb", 256, 16384], ["testVideoPart", 1, 10000],
  ] as const) {
    settings[key] = Number.isFinite(settings[key]) ? Math.max(min, Math.min(max, settings[key])) : defaults[key];
  }
  settings.concurrency = Math.round(settings.concurrency);
  if (typeof settings.testVideo !== "string") settings.testVideo = "";
  settings.testVideoPart = Math.round(settings.testVideoPart);
  let results = GM_getValue<Record<string, BenchmarkResult>>(resultKey, {});
  let root!: ShadowRoot;
  let dialog!: HTMLDivElement;
  let tree!: HTMLDivElement;
  let status!: HTMLParagraphElement;
  let progress!: HTMLDivElement;
  let progressTrack!: HTMLDivElement;
  let busy = false;
  const benchmarkingDomains = new Set<string>();
  let benchmarkController: AbortController | undefined;
  let previousFocus: HTMLElement | null = null;
  const expandedProviders = new Set(["cloud"]);
  const expandedRegions = new Set(["cloud/mirror"]);

  function persistSelection(): void {
    const domains = [...selected];
    setDomains(domains);
  }

  function showError(cause: unknown, prefix = ""): void {
    const message = cause instanceof Error ? cause.message : String(cause);
    status.textContent = `${prefix}${message}`;
    status.classList.add("error");
  }

  function createCheckbox(domains: string[], name: string, count?: string): HTMLLabelElement {
    const label = document.createElement("label");
    label.className = "check-label";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = domains.every((domain) => selected.has(domain));
    input.indeterminate = !input.checked && domains.some((domain) => selected.has(domain));
    const text = document.createElement("span");
    text.className = "name";
    text.textContent = name;
    text.title = name;
    label.append(input, text);
    if (count) {
      const countElement = document.createElement("span");
      countElement.className = "count";
      countElement.textContent = count;
      label.append(countElement);
    }
    input.addEventListener("change", () => {
      for (const domain of domains) input.checked ? selected.add(domain) : selected.delete(domain);
      persistSelection();
      renderTree();
    });
    return label;
  }

  function createToggle(label: string, expanded: boolean, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toggle";
    button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>';
    button.setAttribute("aria-label", `${expanded ? "收起" : "展开"}${label}`);
    button.setAttribute("aria-expanded", String(expanded));
    button.addEventListener("click", onClick);
    return button;
  }

  function renderTree(): void {
    tree.replaceChildren();
    if (root.getElementById("selection-count")) byId<HTMLElement>("selection-count").textContent = `已选择 ${selected.size} 个节点`;
    for (const provider of providers) {
      const providerElement = document.createElement("section");
      const providerOpen = expandedProviders.has(provider.id);
      providerElement.className = `provider${providerOpen ? " open" : ""}`;
      providerElement.setAttribute("role", "treeitem");
      providerElement.setAttribute("aria-expanded", String(providerOpen));
      const providerDomains = provider.regions.flatMap((region) => region.nodes.map((node) => node.domain));
      const providerRow = document.createElement("div");
      providerRow.className = "provider-row";
      providerRow.append(
        createToggle(provider.name, providerOpen, () => {
          providerOpen ? expandedProviders.delete(provider.id) : expandedProviders.add(provider.id);
          renderTree();
        }),
        createCheckbox(providerDomains, provider.name, `${providerDomains.filter((domain) => selected.has(domain)).length}/${providerDomains.length}`),
      );
      providerElement.append(providerRow);
      if (!providerOpen) {
        tree.append(providerElement);
        continue;
      }
      const regionList = document.createElement("div");
      regionList.className = "regions";
      regionList.setAttribute("role", "group");
      for (const region of provider.regions) {
        const regionDomains = region.nodes.map((node) => node.domain);
        const regionKey = `${provider.id}/${region.id}`;
        const regionOpen = expandedRegions.has(regionKey);
        const regionElement = document.createElement("div");
        regionElement.className = `region${regionOpen ? " open" : ""}`;
        regionElement.setAttribute("role", "treeitem");
        regionElement.setAttribute("aria-expanded", String(regionOpen));
        const regionRow = document.createElement("div");
        regionRow.className = "region-row";
        regionRow.append(
          createToggle(region.name, regionOpen, () => {
            regionOpen ? expandedRegions.delete(regionKey) : expandedRegions.add(regionKey);
            renderTree();
          }),
          createCheckbox(regionDomains, region.name, `${regionDomains.filter((domain) => selected.has(domain)).length}/${regionDomains.length}`),
        );
        const optimize = document.createElement("button");
        optimize.type = "button";
        optimize.className = "group-optimize";
        optimize.textContent = "优选";
        optimize.disabled = busy;
        optimize.addEventListener("click", () => void optimizeRegion(region, provider));
        regionRow.append(optimize);
        regionElement.append(regionRow);
        if (regionOpen) {
          const nodeList = document.createElement("div");
          nodeList.className = "nodes";
          nodeList.setAttribute("role", "group");
          for (const node of region.nodes) {
            const row = document.createElement("div");
            row.className = `node-row ${results[node.domain]?.status || ""}`;
            row.classList.toggle("benchmark-current", benchmarkingDomains.has(node.domain));
            row.dataset.domain = node.domain;
            row.setAttribute("role", "treeitem");
            const checkbox = createCheckbox([node.domain], node.domain);
            const test = document.createElement("button");
            test.type = "button";
            test.className = `metrics ${results[node.domain]?.status || "idle"}`;
            if (benchmarkingDomains.has(node.domain)) {
              test.className = "metrics testing";
              const spinner = document.createElement("span");
              spinner.className = "spinner";
              const testing = document.createElement("span");
              testing.textContent = "测速中";
              test.append(spinner, testing);
            } else if (results[node.domain]?.status === "passed" || results[node.domain]?.status === "rejected") {
              const latency = document.createElement("span");
              latency.className = "latency";
              latency.textContent = `${Math.round(results[node.domain].latencyMs ?? 0)} ms`;
              const speed = document.createElement("span");
              speed.className = "speed";
              speed.textContent = `${(results[node.domain].speedMbps ?? 0).toFixed(1)} Mbps`;
              const separator = document.createElement("span");
              separator.className = "metric-separator";
              separator.textContent = "|";
              separator.setAttribute("aria-hidden", "true");
              test.append(latency, separator, speed);
            } else {
              const placeholder = document.createElement("span");
              placeholder.className = "metric-placeholder";
              placeholder.textContent = results[node.domain]?.error || "点击测速";
              test.append(placeholder);
            }
            test.disabled = busy;
            test.addEventListener("click", () => void testOne(node.domain));
            row.append(checkbox, test);
            nodeList.append(row);
          }
          regionElement.append(nodeList);
        }
        regionList.append(regionElement);
      }
      providerElement.append(regionList);
      tree.append(providerElement);
    }
  }

  async function runBenchmarks(domains: string[], optimize = false): Promise<void> {
    if (busy) return;
    if (!domains.length) { status.textContent = "请先选择要测速的节点"; return; }
    busy = true;
    benchmarkController = new AbortController();
    const signal = benchmarkController.signal;
    const snapshot = { ...settings };
    const unique = [...new Set(domains)];
    let completed = 0;
    status.textContent = `测速 0 / ${unique.length}，并发 ${snapshot.concurrency}`;
    status.classList.remove("error");
    progressTrack.hidden = false;
    progress.style.width = "0%";
    byId<HTMLButtonElement>("cancel-benchmark").disabled = false;
    byId<HTMLButtonElement>("test-selected").disabled = true;
    root.querySelectorAll<HTMLInputElement>("[data-key]").forEach(input => { input.disabled = true; });
    renderTree();
    try {
      const source = await getBenchmarkUrl(nativeFetch, snapshot.useCurrentVideo, getCurrentVideoIds, signal, snapshot.testVideo, snapshot.testVideoPart);
      await runConcurrent(unique, snapshot.concurrency, async domain => {
        benchmarkingDomains.add(domain);
        renderTree();
        try {
          const result = await benchmarkDomain(domain, source, snapshot, nativeFetch, signal);
          if (signal.aborted) return;
          results[domain] = result;
          if (optimize && result.status === "passed") selected.add(domain);
          else if (result.status !== "passed") selected.delete(domain);
          persistSelection();
          GM_setValue(resultKey, results);
          completed++;
          progress.style.width = `${completed / unique.length * 100}%`;
          status.textContent = `测速 ${completed} / ${unique.length}，并发 ${snapshot.concurrency}`;
        } finally {
          benchmarkingDomains.delete(domain);
          renderTree();
        }
      }, signal);
      status.textContent = signal.aborted
        ? `已取消，完成 ${completed} / ${unique.length}`
        : `测速完成：${unique.filter(domain => results[domain]?.status === "passed").length} / ${unique.length} 个节点达标`;
    } catch (cause) {
      if (signal.aborted) status.textContent = "已取消测速";
      else showError(cause);
    } finally {
      busy = false;
      benchmarkController = undefined;
      benchmarkingDomains.clear();
      byId<HTMLButtonElement>("cancel-benchmark").disabled = true;
      byId<HTMLButtonElement>("test-selected").disabled = false;
      root.querySelectorAll<HTMLInputElement>("[data-key]").forEach(input => { input.disabled = false; });
      renderTree();
    }
  }

  async function testOne(domain: string): Promise<void> { await runBenchmarks([domain]); }

  async function optimizeRegion(region: PanelRegion, provider: PanelProvider): Promise<void> {
    if (busy) return;
    expandedProviders.add(provider.id);
    expandedRegions.add(`${provider.id}/${region.id}`);
    await runBenchmarks(region.nodes.map(node => node.domain), true);
  }

  function byId<T extends HTMLElement>(id: string): T {
    const element = root.getElementById(id);
    if (!element) throw new Error(`Missing panel element: ${id}`);
    return element as T;
  }

  function createPanel(): void {
    const host = document.createElement("div");
    host.id = "bili-cdn-panel-host";
    document.documentElement.append(host);
    root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    dialog = document.createElement("div");
    dialog.className = "backdrop";
    dialog.hidden = true;
    dialog.innerHTML = `<main id="panel" class="panel" role="dialog" aria-modal="true" aria-label="CDN 节点设置">
      <header>
        <h1 id="page-title">CDN 节点与并行下载</h1>
        <div class="header-actions">
          <button id="close" class="icon-button" type="button" aria-label="关闭">×</button>
        </div>
      </header>
      <div class="workspace">
      <aside id="settings-panel" class="settings-panel" aria-label="设置">
        <h2 class="settings-title">设置</h2>
        <section class="settings-section" aria-labelledby="thread-settings-title">
          <div id="thread-settings-header" class="section-heading"><h3 id="thread-settings-title">Thread Ripper 分片并行</h3></div>
          <div id="thread-settings-body" class="section-details">
            <p class="settings-hint">在可用 CDN 间分片下载、竞速与停滞救援，可能增加流量。</p>
            <div id="thread-settings" class="settings-grid"></div>
          </div>
        </section>
        <section class="settings-section common-settings" aria-labelledby="common-title">
          <h3 id="common-title">通用设置</h3>
          <fieldset id="source-policy" class="source-policy"><legend>下载来源策略</legend>
            <label><input type="radio" name="source-policy" value="original"><span><strong>接口原有节点</strong><small>使用播放接口提供的主备地址</small></span></label>
            <label><input type="radio" name="source-policy" value="selected"><span><strong>节点优选</strong><small>使用右侧所选的普通 CDN，不叠加 PCDN 筛选</small></span></label>
            <label><input type="radio" name="source-policy" value="filter"><span><strong>屏蔽 PCDN</strong><small>按规则过滤接口原有节点，不使用节点优选</small></span></label>
          </fieldset>
          <p class="settings-hint">三种来源策略互斥，普通下载与分片下载共用。设置自动保存，影响后续请求；已生成的地址可重新加载视频刷新。</p>
        </section>
        <section id="node-settings-section" class="settings-section" aria-labelledby="node-settings-title">
          <div id="node-settings-header" class="section-heading"><h3 id="node-settings-title">节点优选</h3></div>
          <div id="node-settings-body" class="section-details">
            <p class="settings-hint">使用右侧所选的普通 CDN；空选时使用接口原有节点。地区“优选”会勾选达标节点，测速并发共享带宽。</p>
            <div class="settings-grid">
              <label class="setting-toggle"><span><strong>使用当前视频测速</strong><small>关闭后可指定 BV / av / 视频链接与分 P</small></span><input data-key="useCurrentVideo" type="checkbox"></label>
              <label class="setting-field full-width" data-custom-video><span>测试视频</span><div><input data-key="testVideo" type="text" placeholder="BV 号、av 号或完整视频链接"></div><small>留空使用内置视频 BV1qM4y1w716，所选视频须可正常播放。</small></label>
              <label class="setting-field" data-custom-video><span>测试视频分 P</span><div><input data-key="testVideoPart" type="number" min="1" max="10000" step="1"><b>P</b></div></label>
              <label class="setting-field"><span>测速并发数</span><div><input data-key="concurrency" type="number" min="1" max="16" step="1"><b>节点</b></div></label>
              <label class="setting-field"><span>最大延迟</span><div><input data-key="maxLatencyMs" type="number" min="10" max="60000" step="10"><b>ms</b></div></label>
              <label class="setting-field"><span>最低速度</span><div><input data-key="minSpeedMbps" type="number" min="0" max="10000" step="0.1"><b>Mbps</b></div></label>
              <label class="setting-field"><span>时间上限</span><div><input data-key="timeoutMs" type="number" min="200" max="60000" step="100"><b>ms</b></div></label>
              <label class="setting-field"><span>测速样本大小</span><div><input data-key="sampleSizeKb" type="number" min="0.25" max="16" step="0.25"><b>MB</b></div></label>
            </div>
          </div>
        </section>
      </aside>
        <section id="pcdn-settings-section" class="settings-section pcdn-panel" aria-labelledby="pcdn-settings-title">
          <div id="pcdn-settings-header" class="section-heading"><h3 id="pcdn-settings-title">PCDN 屏蔽</h3></div>
          <div id="pcdn-settings-body" class="section-details">
            <p class="settings-hint">勾选规则＝阻止命中的地址；取消＝不按此项阻止。任一启用项命中即可阻止，域名放行优先。</p>
            <div id="pcdn-settings" class="settings-grid"></div>
          </div>
        </section>
      <section id="node-panel" class="node-panel" aria-label="节点与测速">
      <div class="toolbar"><h2>节点优选</h2><span id="selection-count" class="count"></span><button id="test-selected" class="group-optimize" type="button">测速所选节点</button><button id="cancel-benchmark" class="group-optimize" type="button" disabled>取消测速</button></div>
      <p id="status" class="guide" role="status"></p>
      <div id="tree" class="tree" role="tree" aria-label="CDN 节点范围"></div>
      <div id="progress-track" class="progress-track" hidden><div id="progress"></div></div>
      </section>
      </div>
    </main>`;
    root.append(style, dialog);
    tree = byId<HTMLDivElement>("tree");
    status = byId<HTMLParagraphElement>("status");
    progress = byId<HTMLDivElement>("progress");
    progressTrack = byId<HTMLDivElement>("progress-track");
    let pressedOnBackdrop = false;
    dialog.addEventListener("pointerdown", (event) => {
      pressedOnBackdrop = event.button === 0 && event.target === dialog;
    });
    dialog.addEventListener("pointerup", (event) => {
      if (pressedOnBackdrop && event.target === dialog) close();
      pressedOnBackdrop = false;
    });
    dialog.addEventListener("pointercancel", () => { pressedOnBackdrop = false; });
    byId<HTMLButtonElement>("close").addEventListener("click", close);
    byId<HTMLButtonElement>("test-selected").addEventListener("click", () => void runBenchmarks([...selected]));
    byId<HTMLButtonElement>("cancel-benchmark").addEventListener("click", () => benchmarkController?.abort());
    renderPlaybackSettings();
    updateFeatureSections();
    updateCustomVideoFields();
    dialog.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea')]
        .filter(element => element.getClientRects().length > 0);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    root.querySelectorAll<HTMLInputElement>("[data-key]").forEach((input) => {
      const key = input.dataset.key as keyof BenchmarkSettings;
      if (key === "testVideo") {
        input.value = settings.testVideo;
        input.addEventListener("change", () => {
          settings.testVideo = input.value.trim();
          input.value = settings.testVideo;
          GM_setValue(settingsKey, settings);
        });
        return;
      }
      if (key === "useCurrentVideo") {
        input.checked = settings.useCurrentVideo;
        input.addEventListener("change", () => {
          settings.useCurrentVideo = input.checked;
          updateCustomVideoFields();
          GM_setValue(settingsKey, settings);
        });
        return;
      }
      const numberKey = key as Exclude<keyof BenchmarkSettings, "useCurrentVideo" | "testVideo">;
      input.value = String(numberKey === "sampleSizeKb" ? settings[numberKey] / 1024 : settings[numberKey]);
      input.addEventListener("change", () => {
        const fallback = defaults[numberKey];
        const parsed = input.value.trim() === "" ? NaN : Number(input.value);
        const value = Number.isFinite(parsed) ? parsed : (numberKey === "sampleSizeKb" ? fallback / 1024 : fallback);
        const clamped = Math.max(Number(input.min), Math.min(Number(input.max), value));
        settings[numberKey] = numberKey === "sampleSizeKb" ? Math.round(clamped * 1024) : numberKey === "concurrency" || numberKey === "testVideoPart" ? Math.round(clamped) : clamped;
        input.value = String(numberKey === "sampleSizeKb" ? settings[numberKey] / 1024 : settings[numberKey]);
        GM_setValue(settingsKey, settings);
      });
    });
    renderTree();
  }

  function updateCustomVideoFields(): void {
    root.querySelectorAll<HTMLElement>("[data-custom-video]").forEach(field => { field.hidden = settings.useCurrentVideo; });
  }

  function updateFeatureSections(): void {
    const playback = getPlaybackSettings();
    byId<HTMLElement>("panel").classList.toggle("settings-only", !playback.cdnSelection && !playback.blockPcdn);
    byId<HTMLElement>("node-panel").hidden = !playback.cdnSelection;
    byId<HTMLElement>("node-settings-section").hidden = !playback.cdnSelection;
    byId<HTMLElement>("node-settings-body").hidden = !playback.cdnSelection;
    byId<HTMLElement>("thread-settings-body").hidden = !playback.threadRipper;
    byId<HTMLElement>("pcdn-settings-section").hidden = !playback.blockPcdn;
    byId<HTMLElement>("pcdn-settings-body").hidden = !playback.blockPcdn;
    byId<HTMLElement>("domain-rules").hidden = !playback.blockDomains;
    root.querySelectorAll<HTMLInputElement>('input[name="source-policy"]').forEach(input => {
      input.checked = input.value === (playback.cdnSelection ? "selected" : playback.blockPcdn ? "filter" : "original");
    });
    byId<HTMLElement>("node-policy-state").textContent = playback.cdnSelection ? "当前策略" : "未启用";
    byId<HTMLElement>("pcdn-policy-state").textContent = playback.blockPcdn ? "当前策略" : "未启用";
    root.querySelectorAll<HTMLInputElement>("[data-feature]").forEach(input => {
      input.checked = Boolean(playback[input.dataset.feature as keyof PlaybackSettings]);
      const state = input.closest(".feature-control")?.querySelector(".feature-state");
      if (state) state.textContent = input.checked ? "已开启" : "已关闭";
    });
  }

  function renderPlaybackSettings(): void {
    const thread = byId<HTMLElement>("thread-settings");
    const pcdn = byId<HTMLElement>("pcdn-settings");
    root.querySelectorAll<HTMLInputElement>('input[name="source-policy"]').forEach(input => {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        if (input.value !== "selected") benchmarkController?.abort();
        setPlaybackSettings({ cdnSelection: input.value === "selected", blockPcdn: input.value === "filter" });
        updateFeatureSections();
      });
    });
    for (const [header, id] of [["node-settings-header", "node-policy-state"], ["pcdn-settings-header", "pcdn-policy-state"]]) {
      const state = document.createElement("span"); state.id = id; state.className = "policy-state";
      byId<HTMLElement>(header).append(state);
    }
    for (const [key, title, header, body] of [
      ["threadRipper", "Thread Ripper 分片并行", "thread-settings-header", "thread-settings-body"],
    ] as const) {
      const control = document.createElement("div"); control.className = "feature-control";
      const state = document.createElement("span"); state.className = "feature-state";
      const label = document.createElement("label"); label.className = "master-switch";
      const input = document.createElement("input"); input.type = "checkbox";
      input.dataset.feature = key;
      input.setAttribute("aria-label", `启用${title}`);
      input.setAttribute("aria-controls", body);
      input.addEventListener("change", () => {
        setPlaybackSettings({ [key]: input.checked });
        updateFeatureSections();
      });
      const track = document.createElement("span"); track.setAttribute("aria-hidden", "true");
      label.append(input, track); control.append(state, label);
      byId<HTMLElement>(header).append(control);
    }

    function addToggle(container: HTMLElement, key: keyof PlaybackSettings, name: string, hint: string): void {
      const label = document.createElement("label"); label.className = "setting-toggle";
      const text = document.createElement("span");
      const strong = document.createElement("strong"); strong.textContent = name;
      const small = document.createElement("small"); small.textContent = hint;
      text.append(strong, small);
      const input = document.createElement("input"); input.type = "checkbox";
      input.checked = Boolean(getPlaybackSettings()[key]);
      input.addEventListener("change", () => {
        setPlaybackSettings({ [key]: input.checked });
        updateFeatureSections();
      });
      label.append(text, input); container.append(label);
    }

    for (const [key, name, min, max] of [
      ["concurrency", "下载总并发", 3, 32],
      ["hostConcurrency", "单节点下载并发", 1, 6],
      ["maxPieces", "每次请求最大片数", 1, 16],
    ] as const) {
      const label = document.createElement("label"); label.className = "setting-field";
      const span = document.createElement("span"); span.textContent = name;
      const div = document.createElement("div");
      const input = document.createElement("input"); input.type = "number";
      input.min = String(min); input.max = String(max); input.step = "1"; input.value = String(getPlaybackSettings()[key]);
      input.dataset.playbackKey = key;
      input.addEventListener("change", () => {
        setPlaybackSettings({ [key]: input.value.trim() ? Number(input.value) : getPlaybackSettings()[key] });
        thread.querySelectorAll<HTMLInputElement>("[data-playback-key]").forEach(field => {
          field.value = String(getPlaybackSettings()[field.dataset.playbackKey as keyof PlaybackSettings]);
        });
      });
      div.append(input); label.append(span, div); thread.append(label);
    }
    addToggle(thread, "warmup", "预热初始化段与索引", "提前获取可切换音视频的头部数据");
    addToggle(pcdn, "blockDomains", "启用域名屏蔽规则", "开启后显示各域名规则；参数与路径规则独立生效");
    const domains = document.createElement("div"); domains.id = "domain-rules";
    domains.className = "settings-grid domain-rules full-width";
    pcdn.append(domains);
    for (const [key, name, hint] of [
      ["blockMcdnDomain", "阻止 mcdn 域名", "mcdn.bilivideo.com / cn / net 及其子域名"],
      ["blockSzbdydDomain", "阻止 szbdyd 域名", "szbdyd.com 及其子域名"],
      ["blockNexusDomain", "阻止 nexusedgeio 域名", "nexusedgeio.com 及其子域名"],
      ["blockQiniuDomain", "阻止七牛 PCDN 域名", "ahdohpiechei.com 及其子域名"],
      ["blockMountaintoysDomain", "阻止 mountaintoys 域名", "mountaintoys.cn 及其子域名（含 edge.mountaintoys.cn）"],
    ] as const) addToggle(domains, key, name, hint);
    for (const [key, name, hint] of [
      ["blockMcdn", "阻止 os=mcdn 地址", "按播放地址中的 os 参数判断"],
      ["blockRedirect", "阻止 302 调度域名", "域名首段含 302"],
      ["blockResource", "阻止 resource 路径", "/v1/resource/ 等专用路径"],
      ["blockIp", "阻止符合条件的 IP 地址", "IP 同时具有专用路径或非标准端口"],
    ] as const) addToggle(pcdn, key, name, hint);
    const label = document.createElement("label"); label.className = "setting-field full-width";
    const title = document.createElement("span"); title.textContent = "允许的 PCDN 域名（优先放行）";
    const textarea = document.createElement("textarea"); textarea.rows = 3;
    textarea.placeholder = "example.com 或 *.example.com，空格或换行分隔";
    textarea.value = getPlaybackSettings().allowedDomains;
    textarea.addEventListener("change", () => { setPlaybackSettings({ allowedDomains: textarea.value.trim() }); });
    const hint = document.createElement("small"); hint.textContent = "精确域名只放行自身；*.example.com 放行子域名。放行优先于上述屏蔽规则，仍需满足传输校验，不会改变专用资源路径的可用节点。";
    label.append(title, textarea, hint); pcdn.append(label);
  }

  function close(): void { dialog.hidden = true; previousFocus?.focus(); }
  function open(): void {
    if (!document.documentElement) return;
    if (!dialog) createPanel();
    selected = new Set(getDomains());
    updateFeatureSections();
    renderTree();
    previousFocus = document.activeElement as HTMLElement | null;
    dialog.hidden = false;
    byId<HTMLButtonElement>("close").focus();
  }

  return open;
}
