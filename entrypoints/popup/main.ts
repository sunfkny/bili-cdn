import {
  BENCHMARK_API_URL,
  BENCHMARK_SETTINGS_KEY,
  STORAGE_KEY,
} from "../../utils/constants";
import {
  getAllDomains,
  getDefaultRegionIds,
  loadNodeData,
  resolveDomains,
} from "../../utils/nodes";
import {
  loadBenchmarkSettings,
  normalizeBenchmarkSettings,
} from "../../utils/settings";
import type {
  BcdnData,
  BenchmarkResult,
  BenchmarkSettings,
  CdnSettings,
  NodeRecord,
  RegionRecord,
} from "../../utils/types";

const tree = getElement<HTMLDivElement>("tree");
const empty = getElement<HTMLDivElement>("empty");
const settingsButton = getElement<HTMLButtonElement>("settings");
const settingsPanel = getElement<HTMLElement>("settings-panel");
const pageTitle = getElement<HTMLElement>("page-title");
const guide = getElement<HTMLElement>("guide");
const guideMessageElement = getElement<HTMLElement>("guide-message");
const guideAction = getElement<HTMLButtonElement>("guide-action");
const maxLatencyInput = getElement<HTMLInputElement>("max-latency");
const minSpeedInput = getElement<HTMLInputElement>("min-speed");
const timeoutInput = getElement<HTMLInputElement>("timeout");
const sampleSizeInput = getElement<HTMLInputElement>("sample-size");
const dynamicInterceptionInput = getElement<HTMLInputElement>(
  "dynamic-interception",
);
const progressTrack = getElement<HTMLDivElement>("progress-track");
const progress = getElement<HTMLDivElement>("progress");

let data: BcdnData;
let benchmarkSettings: BenchmarkSettings;
let selectedDomains = new Set<string>();
let activeDomains: string[] = [];
let dynamicRequestInterception = true;
let benchmarkResults: Record<string, BenchmarkResult> = {};
let optimizedAt: number | undefined;
const expandedProviders = new Set<string>();
const expandedRegions = new Set<string>();
const metricElements = new Map<string, HTMLElement>();
const groupBenchmarkButtons = new Set<HTMLButtonElement>();
const nodeElements = new Map<string, HTMLElement>();
const domainLocations = new Map<
  string,
  { providerId: string; regionKey: string }
>();
const benchmarkingDomains = new Set<string>();
let busy = false;
let settingsVisible = false;
let settingsSaveTimer: ReturnType<typeof setTimeout> | undefined;
let currentTabIsBilibili = true;
let errorMessage = "";

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

function setStatus(message: string, isError = false): void {
  if (!isError) return;
  errorMessage = message;
  console.error(`[Bili CDN] ${message}`);
  updateGuide();
}

function setBusy(value: boolean): void {
  busy = value;
  metricElements.forEach((element) => {
    if (element instanceof HTMLButtonElement) element.disabled = value;
  });
  groupBenchmarkButtons.forEach((button) => {
    button.disabled = value;
  });
}

function createCheckbox(
  checked: boolean,
  onChange: (checked: boolean) => void,
  indeterminate = false,
): HTMLInputElement {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  checkbox.indeterminate = indeterminate;
  checkbox.addEventListener("change", () => onChange(checkbox.checked));
  return checkbox;
}

function createToggle(label: string, onClick: () => void): HTMLButtonElement {
  const toggle = document.createElement("button");
  toggle.className = "toggle";
  toggle.type = "button";
  toggle.ariaLabel = label;
  toggle.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>';
  toggle.addEventListener("click", onClick);
  return toggle;
}

function createGroupLabel(
  checkbox: HTMLInputElement,
  name: string,
  selected: number,
  total: number,
): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "check-label";
  const nameElement = document.createElement("span");
  nameElement.className = "name";
  nameElement.textContent = name;
  const countElement = document.createElement("span");
  countElement.className = "count";
  countElement.textContent = `${selected}/${total}`;
  label.append(checkbox, nameElement, countElement);
  return label;
}

function createGroupBenchmarkButton(
  domains: string[],
  label: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "group-optimize";
  button.type = "button";
  button.textContent = "优选";
  button.title = `优选 ${label}`;
  button.disabled = busy;
  button.addEventListener("click", () => void optimizeDomainGroup(domains, label));
  groupBenchmarkButtons.add(button);
  return button;
}

function getRegionDomains(region: RegionRecord): string[] {
  return region.nodes.map((node) => node.domain);
}

function setDomainGroup(domains: string[], checked: boolean): void {
  domains.forEach((domain) =>
    checked ? selectedDomains.add(domain) : selectedDomains.delete(domain),
  );
  selectionChanged();
}

function renderTree(): void {
  tree.replaceChildren();
  metricElements.clear();
  groupBenchmarkButtons.clear();
  nodeElements.clear();
  let visibleProviders = 0;

  for (const [providerId, provider] of Object.entries(data.results)) {
    const visibleRegions = Object.entries(provider.regions).map(
      ([regionId, region]) => ({ regionId, region, nodes: region.nodes }),
    );
    if (visibleRegions.length === 0) continue;
    visibleProviders++;

    const providerDomains = Object.values(provider.regions).flatMap(getRegionDomains);
    const providerSelected = providerDomains.filter((domain) =>
      selectedDomains.has(domain),
    ).length;
    const providerElement = document.createElement("section");
    providerElement.className = "provider";
    const providerOpen = expandedProviders.has(providerId);
    providerElement.classList.toggle("open", providerOpen);
    providerElement.setAttribute("role", "treeitem");
    providerElement.setAttribute("aria-expanded", String(providerOpen));

    const providerRow = document.createElement("div");
    providerRow.className = "provider-row";
    const providerToggle = createToggle(`展开 ${provider.name}`, () => {
      if (expandedProviders.has(providerId)) {
        expandedProviders.delete(providerId);
      } else {
        expandedProviders.clear();
        expandedRegions.clear();
        expandedProviders.add(providerId);
      }
      renderTree();
    });
    const providerCheckbox = createCheckbox(
      providerSelected === providerDomains.length,
      (checked) => setDomainGroup(providerDomains, checked),
      providerSelected > 0 && providerSelected < providerDomains.length,
    );
    providerRow.append(
      providerToggle,
      createGroupLabel(
        providerCheckbox,
        provider.name,
        providerSelected,
        providerDomains.length,
      ),
    );

    const regionList = document.createElement("div");
    regionList.className = "regions";
    regionList.setAttribute("role", "group");
    for (const { regionId, region, nodes } of visibleRegions) {
      const regionKey = `${providerId}/${regionId}`;
      const regionDomains = getRegionDomains(region);
      const regionSelected = regionDomains.filter((domain) =>
        selectedDomains.has(domain),
      ).length;
      const regionElement = document.createElement("div");
      regionElement.className = "region";
      const regionOpen = expandedRegions.has(regionKey);
      regionElement.classList.toggle("open", regionOpen);

      const regionRow = document.createElement("div");
      regionRow.className = "region-row";
      const regionToggle = createToggle(`展开 ${region.name}`, () => {
        if (expandedRegions.has(regionKey)) {
          expandedRegions.delete(regionKey);
        } else {
          for (const key of expandedRegions) {
            if (key.startsWith(`${providerId}/`)) expandedRegions.delete(key);
          }
          expandedRegions.add(regionKey);
        }
        renderTree();
      });
      const regionCheckbox = createCheckbox(
        regionSelected === regionDomains.length,
        (checked) => setDomainGroup(regionDomains, checked),
        regionSelected > 0 && regionSelected < regionDomains.length,
      );
      regionRow.append(
        regionToggle,
        createGroupLabel(
          regionCheckbox,
          region.name,
          regionSelected,
          regionDomains.length,
        ),
        createGroupBenchmarkButton(
          regionDomains,
          `${provider.name} · ${region.name}`,
        ),
      );

      const nodeList = document.createElement("div");
      nodeList.className = "nodes";
      for (const node of nodes) nodeList.append(createNodeRow(node));
      regionElement.append(regionRow, nodeList);
      regionList.append(regionElement);
    }
    providerElement.append(providerRow, regionList);
    tree.append(providerElement);
  }

  empty.hidden = visibleProviders > 0;
  tree.hidden = visibleProviders === 0;
  updateCounts();
}

function createNodeRow(node: NodeRecord): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "node-row";
  nodeElements.set(node.domain, row);
  const checkbox = createCheckbox(selectedDomains.has(node.domain), (checked) => {
    checked ? selectedDomains.add(node.domain) : selectedDomains.delete(node.domain);
    selectionChanged();
  });
  const label = document.createElement("label");
  label.className = "check-label";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = node.domain;
  const metrics = document.createElement("button");
  metrics.type = "button";
  metrics.className = "metrics";
  metrics.title = `单独测速 ${node.domain}`;
  metrics.ariaLabel = `单独测速 ${node.domain}`;
  metrics.disabled = busy;
  metrics.addEventListener("click", () => void benchmarkSingleDomain(node.domain));
  metricElements.set(node.domain, metrics);
  label.append(checkbox, name);
  row.append(label, metrics);
  updateMetrics(node.domain);
  return row;
}

function updateMetrics(domain: string): void {
  const element = metricElements.get(domain);
  if (!element) return;
  const result = benchmarkResults[domain];
  const row = nodeElements.get(domain);
  row?.classList.remove("passed", "rejected", "failed");
  if (result) row?.classList.add(result.status);
  if (benchmarkingDomains.has(domain)) {
    element.className = "metrics testing";
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    const label = document.createElement("span");
    label.textContent = "测速中";
    element.replaceChildren(spinner, label);
    return;
  }

  element.className = `metrics${result ? ` ${result.status}` : " idle"}`;
  element.replaceChildren();
  if (!result || result.status === "failed") {
    const placeholder = document.createElement("span");
    placeholder.className = "metric-placeholder";
    placeholder.textContent = result ? "测速失败" : "点击测速";
    element.append(placeholder);
    return;
  }
  const latency = document.createElement("span");
  latency.className = "latency";
  const speed = document.createElement("span");
  speed.className = "speed";
  latency.textContent = `${Math.round(result.latencyMs!)} ms`;
  speed.textContent = `${formatSpeed(result.speedMbps!)} Mbps`;
  element.append(latency, speed);
}

function formatSpeed(speed: number): string {
  if (speed >= 100) return speed.toFixed(0);
  if (speed >= 10) return speed.toFixed(1);
  return speed.toFixed(2);
}

function displayBenchmarkSettings(settings: BenchmarkSettings): void {
  maxLatencyInput.value = String(settings.maxLatencyMs);
  minSpeedInput.value = String(settings.minSpeedMbps);
  timeoutInput.value = String(settings.timeoutMs);
  sampleSizeInput.value = String(settings.sampleSizeKb / 1024);
}

function readBenchmarkSettings(): BenchmarkSettings {
  return normalizeBenchmarkSettings({
    maxLatencyMs: maxLatencyInput.valueAsNumber,
    minSpeedMbps: minSpeedInput.valueAsNumber,
    concurrency: 1,
    timeoutMs: timeoutInput.valueAsNumber,
    sampleSizeKb: sampleSizeInput.valueAsNumber * 1024,
  });
}

function scheduleSettingsSave(): void {
  if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(async () => {
    benchmarkSettings = readBenchmarkSettings();
    await browser.storage.local.set({
      [BENCHMARK_SETTINGS_KEY]: benchmarkSettings,
    });
  }, 150);
}

function toggleSettings(): void {
  settingsVisible = !settingsVisible;
  settingsPanel.hidden = !settingsVisible;
  pageTitle.textContent = settingsVisible ? "测速设置" : "节点优选";
  settingsButton.classList.toggle("active", settingsVisible);
  settingsButton.ariaLabel = settingsVisible ? "返回节点列表" : "测速设置";
  if (settingsVisible) {
    tree.hidden = true;
    empty.hidden = true;
    displayBenchmarkSettings(benchmarkSettings);
  } else {
    renderTree();
  }
  updateGuide();
}

function selectionChanged(): void {
  renderTree();
  void applySelectionImmediately();
}

function updateCounts(): void {
  updateGuide();
}

function updateGuide(): void {
  guideAction.hidden = true;
  guide.classList.remove("error");
  if (settingsVisible) {
    guide.hidden = true;
    return;
  }
  if (!currentTabIsBilibili) {
    guideMessageElement.textContent = "当前页面不是哔哩哔哩，打开 B 站后即可使用节点优选";
    guideAction.textContent = "打开哔哩哔哩";
    guideAction.dataset.action = "open";
    guideAction.hidden = false;
    guide.hidden = false;
    return;
  }
  if (errorMessage) {
    guideMessageElement.textContent = errorMessage;
    guide.classList.add("error");
    guide.hidden = false;
    return;
  }
  if (selectedDomains.size === 0) {
    guideMessageElement.textContent = "未选择节点，Bili CDN 不会生效";
    guide.hidden = false;
    return;
  }
  guide.hidden = true;
}

function isBilibiliUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return (
      hostname === "bilibili.com" ||
      hostname.endsWith(".bilibili.com") ||
      hostname === "bili-proxy.biligame.com"
    );
  } catch {
    return false;
  }
}

async function loadCurrentTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  currentTabIsBilibili = isBilibiliUrl(tab?.url);
}

async function saveSettings(
  nextActiveDomains: string[],
  nextOptimizedAt = optimizedAt,
): Promise<void> {
  activeDomains = nextActiveDomains;
  optimizedAt = nextOptimizedAt;
  const settings: CdnSettings = {
    selectedDomains: [...selectedDomains],
    activeDomains,
    dynamicRequestInterception,
    benchmarkResults,
    optimizedAt: nextOptimizedAt,
  };
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
  updateCounts();
}

async function benchmarkSingleDomain(domain: string): Promise<void> {
  if (busy) return;
  errorMessage = "";
  updateGuide();
  setBusy(true);
  benchmarkingDomains.add(domain);
  updateMetrics(domain);
  setStatus(`正在单独测速 ${domain}…`);
  try {
    benchmarkSettings = await loadBenchmarkSettings();
    const sourceUrl = await getBenchmarkUrl();
    const result = await benchmarkDomain(domain, sourceUrl);
    benchmarkResults[domain] = result;
    benchmarkingDomains.delete(domain);
    if (result.status !== "passed") selectedDomains.delete(domain);
    const nextActiveDomains = result.status === "passed"
      ? activeDomains
      : getAllDomains(data).filter((item) => selectedDomains.has(item));
    await saveSettings(nextActiveDomains);
    result.status === "passed" ? updateMetrics(domain) : renderTree();
    if (result.status === "failed") {
      setStatus(`${domain} 测速失败`, true);
    } else {
      const outcome = result.status === "passed" ? "达标" : "未达标";
      setStatus(
        `${domain}：${Math.round(result.latencyMs!)} ms · ${formatSpeed(result.speedMbps!)} Mbps · ${outcome}`,
      );
    }
  } catch (cause) {
    benchmarkingDomains.delete(domain);
    setStatus(`单节点测速失败：${getErrorMessage(cause)}`, true);
    updateMetrics(domain);
  } finally {
    setBusy(false);
  }
}

async function applySelectionImmediately(): Promise<void> {
  try {
    await saveSettings([...selectedDomains]);
    setStatus(`已应用 ${selectedDomains.size} 个节点`);
  } catch (cause) {
    setStatus(getErrorMessage(cause), true);
  }
}

function findUposUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const payload = value as {
    data?: {
      dash?: {
        video?: Array<{
          baseUrl?: unknown;
          base_url?: unknown;
          backupUrl?: unknown;
          backup_url?: unknown;
        }>;
      };
    };
  };
  const firstVideo = payload.data?.dash?.video?.[0];
  if (!firstVideo) return undefined;
  const candidates = [
    ...(Array.isArray(firstVideo.backupUrl) ? firstVideo.backupUrl : []),
    ...(Array.isArray(firstVideo.backup_url) ? firstVideo.backup_url : []),
    firstVideo.baseUrl,
    firstVideo.base_url,
  ];
  return candidates.find(
    (url): url is string =>
      typeof url === "string" && url.startsWith("https://upos-"),
  );
}

async function getBenchmarkUrl(): Promise<string> {
  const response = await fetch(BENCHMARK_API_URL, {
    headers: { Accept: "*/*" },
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`播放地址请求失败（HTTP ${response.status}）`);
  }
  const sourceUrl = findUposUrl(await response.json());
  if (!sourceUrl) throw new Error("播放接口中没有可测速的 UPOS 地址");
  return sourceUrl;
}

async function benchmarkDomain(
  domain: string,
  sourceUrl: string,
): Promise<BenchmarkResult> {
  const url = new URL(sourceUrl);
  url.hostname = domain;
  url.port = "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), benchmarkSettings.timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "*/*",
        Range: `bytes=0-${benchmarkSettings.sampleSizeKb * 1024 - 1}`,
      },
      signal: controller.signal,
    });
    const responseAt = performance.now();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.arrayBuffer();
    const finishedAt = performance.now();
    const latencyMs = responseAt - startedAt;
    const downloadMs = Math.max(finishedAt - responseAt, 1);
    const speedMbps = (payload.byteLength * 8) / downloadMs / 1000;
    const passed =
      latencyMs <= benchmarkSettings.maxLatencyMs &&
      speedMbps >= benchmarkSettings.minSpeedMbps;
    return {
      domain,
      status: passed ? "passed" : "rejected",
      latencyMs,
      speedMbps,
      testedAt: Date.now(),
    };
  } catch {
    return { domain, status: "failed", testedAt: Date.now() };
  } finally {
    clearTimeout(timeout);
  }
}

async function optimizeDomainGroup(domains: string[], label: string): Promise<void> {
  if (domains.length === 0) return;
  errorMessage = "";
  updateGuide();
  setBusy(true);
  progressTrack.hidden = false;
  progress.style.width = "0";
  setStatus(`正在准备优选 ${label}，共 ${domains.length} 个节点…`);

  try {
    benchmarkSettings = await loadBenchmarkSettings();
    const sourceUrl = await getBenchmarkUrl();
    const results: BenchmarkResult[] = [];
    let completed = 0;
    for (const domain of domains) {
      benchmarkingDomains.add(domain);
      revealBenchmarkDomain(domain);
      const result = await benchmarkDomain(domain, sourceUrl);
      results.push(result);
      benchmarkResults[domain] = result;
      benchmarkingDomains.delete(domain);
      result.status === "passed"
        ? selectedDomains.add(domain)
        : selectedDomains.delete(domain);
      completed++;
      progress.style.width = `${(completed / domains.length) * 100}%`;
      updateMetrics(domain);
      const passed = results.filter((item) => item.status === "passed").length;
      setStatus(`正在测速 ${completed}/${domains.length} · ${passed} 个达标`);
    }
    const passedResults = results.filter((result) => result.status === "passed");
    const nextActiveDomains = getAllDomains(data).filter((domain) =>
      selectedDomains.has(domain),
    );
    await saveSettings(
      nextActiveDomains,
      passedResults.length > 0 ? Date.now() : optimizedAt,
    );
    renderTree();
    setStatus(
      passedResults.length
        ? `${label} 优选完成：保留 ${passedResults.length}/${domains.length} 个达标节点`
        : `${label} 没有节点满足要求，已取消该组节点`,
    );
  } catch (cause) {
    setStatus(`${label} 优选失败：${getErrorMessage(cause)}`, true);
  } finally {
    setBusy(false);
    setTimeout(() => {
      progressTrack.hidden = true;
    }, 1200);
  }
}

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function expandInitialRegions(regionIds: string[]): void {
  const regionId = regionIds[0];
  if (!regionId) return;
  const providerId = regionId.split("/", 1)[0];
  if (providerId) expandedProviders.add(providerId);
  expandedRegions.add(regionId);
}

function revealBenchmarkDomain(domain: string): void {
  const location = domainLocations.get(domain);
  if (!location) {
    updateMetrics(domain);
    return;
  }
  expandedProviders.clear();
  expandedProviders.add(location.providerId);
  expandedRegions.clear();
  expandedRegions.add(location.regionKey);
  renderTree();
  requestAnimationFrame(() => {
    const element = nodeElements.get(domain);
    element?.classList.add("benchmark-current");
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

async function initialize(): Promise<void> {
  try {
    [data, benchmarkSettings] = await Promise.all([
      loadNodeData(),
      loadBenchmarkSettings(),
      loadCurrentTab(),
    ]);
    displayBenchmarkSettings(benchmarkSettings);
    const allDomains = new Set(getAllDomains(data));
    for (const [providerId, provider] of Object.entries(data.results)) {
      for (const [regionId, region] of Object.entries(provider.regions)) {
        const regionKey = `${providerId}/${regionId}`;
        region.nodes.forEach((node) =>
          domainLocations.set(node.domain, { providerId, regionKey }),
        );
      }
    }
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as
      | CdnSettings
      | undefined;
    const storedDomains = stored?.selectedDomains?.filter((domain) =>
      allDomains.has(domain),
    );
    let initialRegionIds: string[] = [];
    if (storedDomains?.length) {
      selectedDomains = new Set(storedDomains);
    } else if (stored?.selectedRegionIds?.length) {
      initialRegionIds = stored.selectedRegionIds;
      selectedDomains = new Set(resolveDomains(data, initialRegionIds));
    } else {
      initialRegionIds = getDefaultRegionIds(data);
      selectedDomains = new Set(resolveDomains(data, initialRegionIds));
    }

    activeDomains = stored?.activeDomains?.filter((domain) => allDomains.has(domain)) ?? [];
    dynamicRequestInterception = stored?.dynamicRequestInterception !== false;
    dynamicInterceptionInput.checked = dynamicRequestInterception;
    benchmarkResults = stored?.benchmarkResults ?? {};
    optimizedAt = stored?.optimizedAt;
    expandInitialRegions(initialRegionIds);
    renderTree();
    if (!stored) await saveSettings([...selectedDomains]);
  } catch (cause) {
    setStatus(getErrorMessage(cause), true);
  }
}

settingsButton.addEventListener("click", toggleSettings);
guideAction.addEventListener("click", async () => {
  if (guideAction.dataset.action === "open") {
    await browser.tabs.create({ url: "https://www.bilibili.com/" });
    return;
  }
});
dynamicInterceptionInput.addEventListener("change", () => {
  dynamicRequestInterception = dynamicInterceptionInput.checked;
  void saveSettings(activeDomains);
  updateGuide();
});
[
  maxLatencyInput,
  minSpeedInput,
  timeoutInput,
  sampleSizeInput,
].forEach((input) => {
  input.addEventListener("input", scheduleSettingsSave);
  input.addEventListener("change", () => displayBenchmarkSettings(readBenchmarkSettings()));
});
void initialize();
