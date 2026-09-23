import css from "./cdn-panel.css?inline";
import { GM_getValue, GM_setValue } from "$";
import { benchmarkDomain, getBenchmarkUrl } from "./benchmark";
import { getDomains, setDomains } from "./domains";
import type { BenchmarkResult, BenchmarkSettings, NodeData, ProviderRecord, RegionRecord, NodeRecord, VideoIds } from "./types";

const settingsKey = "biliCdnPanelSettings";
const resultKey = "biliCdnBenchmarkResults";
const defaults: BenchmarkSettings = { maxLatencyMs: 100, minSpeedMbps: 10, timeoutMs: 3000, sampleSizeKb: 4096, useCurrentVideo: true };

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
  let results = GM_getValue<Record<string, BenchmarkResult>>(resultKey, {});
  let root!: ShadowRoot;
  let dialog!: HTMLDivElement;
  let tree!: HTMLDivElement;
  let status!: HTMLParagraphElement;
  let progress!: HTMLDivElement;
  let progressTrack!: HTMLDivElement;
  let busy = false;
  let benchmarkingDomain: string | undefined;
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
            row.classList.toggle("benchmark-current", benchmarkingDomain === node.domain);
            row.dataset.domain = node.domain;
            row.setAttribute("role", "treeitem");
            const checkbox = createCheckbox([node.domain], node.domain);
            const test = document.createElement("button");
            test.type = "button";
            test.className = `metrics ${results[node.domain]?.status || "idle"}`;
            if (benchmarkingDomain === node.domain) {
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

  async function testOne(domain: string): Promise<void> {
    if (busy) return;
    busy = true;
    benchmarkingDomain = domain;
    status.textContent = "";
    status.classList.remove("error");
    renderTree();
    try {
      results[domain] = await benchmarkDomain(domain, await getBenchmarkUrl(nativeFetch, settings.useCurrentVideo, getCurrentVideoIds), settings, nativeFetch);
      GM_setValue(resultKey, results);
      if (results[domain].status !== "passed") {
        selected.delete(domain);
        persistSelection();
      }
      if (results[domain].status === "failed") {
        showError(results[domain].error || "测速失败", `${domain}：`);
      }
    } catch (cause) {
      showError(cause, `${domain}：`);
    } finally {
      busy = false;
      benchmarkingDomain = undefined;
      renderTree();
    }
  }

  async function optimizeRegion(region: PanelRegion, provider: PanelProvider): Promise<void> {
    if (busy) return;
    busy = true;
    status.textContent = "";
    status.classList.remove("error");
    expandedProviders.add(provider.id);
    expandedRegions.add(`${provider.id}/${region.id}`);
    renderTree();
    progressTrack.hidden = false;
    progress.style.width = "0";
    try {
      const source = await getBenchmarkUrl(nativeFetch, settings.useCurrentVideo, getCurrentVideoIds);
      for (let index = 0; index < region.nodes.length; index++) {
        const domain = region.nodes[index].domain;
        benchmarkingDomain = domain;
        renderTree();
        requestAnimationFrame(() => {
          const row = [...root.querySelectorAll<HTMLElement>(".node-row")].find((item) => item.dataset.domain === domain);
          row?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
        results[domain] = await benchmarkDomain(domain, source, settings, nativeFetch);
        if (results[domain].status === "failed") {
          showError(results[domain].error || "测速失败", `${domain}：`);
        }
        results[domain].status === "passed" ? selected.add(domain) : selected.delete(domain);
        persistSelection();
        GM_setValue(resultKey, results);
        progress.style.width = `${((index + 1) / region.nodes.length) * 100}%`;
        renderTree();
      }
    } catch (cause) {
      showError(cause, `${region.name}：`);
    } finally {
      busy = false;
      benchmarkingDomain = undefined;
      renderTree();
      setTimeout(() => { progressTrack.hidden = true; }, 1200);
    }
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
    dialog.innerHTML = `<main class="panel" role="dialog" aria-modal="true" aria-label="CDN 节点设置">
      <header>
        <h1 id="page-title">节点优选</h1>
        <div class="header-actions">
          <button id="settings-button" class="icon-button" type="button" aria-label="测速设置">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57 1.7 1.7 0 0 0 10 3V3h4v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 21 10h.08v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>
          </button>
          <button id="close" class="icon-button" type="button" aria-label="关闭">×</button>
        </div>
      </header>
      <p id="status" class="guide" role="status"></p>
      <div id="tree" class="tree" role="tree" aria-label="CDN 节点范围"></div>
      <section id="settings-panel" class="settings-panel" hidden>
        <div class="settings-grid">
          <label class="setting-toggle"><span><strong>使用当前视频测速</strong><small>关闭后使用固定测试视频</small></span><input data-key="useCurrentVideo" type="checkbox"></label>
          <label class="setting-field"><span>最大延迟</span><div><input data-key="maxLatencyMs" type="number" min="10" max="60000" step="10"><b>ms</b></div></label>
          <label class="setting-field"><span>最低速度</span><div><input data-key="minSpeedMbps" type="number" min="0" max="10000" step="0.1"><b>Mbps</b></div></label>
          <label class="setting-field"><span>时间上限</span><div><input data-key="timeoutMs" type="number" min="200" max="60000" step="100"><b>ms</b></div></label>
          <label class="setting-field"><span>测速样本大小</span><div><input data-key="sampleSizeKb" type="number" min="0.25" max="16" step="0.25"><b>MB</b></div></label>
        </div>
      </section>
      <div id="progress-track" class="progress-track" hidden><div id="progress"></div></div>
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
    byId<HTMLButtonElement>("settings-button").addEventListener("click", () => {
      const settingsPanel = byId<HTMLElement>("settings-panel");
      settingsPanel.hidden = !settingsPanel.hidden;
      tree.hidden = !settingsPanel.hidden;
      status.hidden = !settingsPanel.hidden;
      byId<HTMLElement>("page-title").textContent = settingsPanel.hidden ? "节点优选" : "测速设置";
      byId<HTMLButtonElement>("settings-button").classList.toggle("active", !settingsPanel.hidden);
    });
    root.querySelectorAll<HTMLInputElement>("[data-key]").forEach((input) => {
      const key = input.dataset.key as keyof BenchmarkSettings;
      if (key === "useCurrentVideo") {
        input.checked = settings.useCurrentVideo;
        input.addEventListener("change", () => {
          settings.useCurrentVideo = input.checked;
          GM_setValue(settingsKey, settings);
        });
        return;
      }
      const numberKey = key as Exclude<keyof BenchmarkSettings, "useCurrentVideo">;
      input.value = String(numberKey === "sampleSizeKb" ? settings[numberKey] / 1024 : settings[numberKey]);
      input.addEventListener("change", () => {
        const fallback = defaults[numberKey];
        const value = Number(input.value) || (numberKey === "sampleSizeKb" ? fallback / 1024 : fallback);
        const clamped = Math.max(Number(input.min), Math.min(Number(input.max), value));
        settings[numberKey] = numberKey === "sampleSizeKb" ? Math.round(clamped * 1024) : clamped;
        input.value = String(numberKey === "sampleSizeKb" ? settings[numberKey] / 1024 : settings[numberKey]);
        GM_setValue(settingsKey, settings);
      });
    });
    renderTree();
  }

  function close(): void { dialog.hidden = true; }
  function open(): void {
    if (!document.documentElement) return;
    if (!dialog) createPanel();
    selected = new Set(getDomains());
    renderTree();
    dialog.hidden = false;
  }

  return open;
}
