import {
  BENCHMARK_SETTINGS_KEY,
  DEFAULT_BENCHMARK_SETTINGS,
} from "./constants";
import type { BenchmarkSettings } from "./types";

export async function loadBenchmarkSettings(): Promise<BenchmarkSettings> {
  const stored = (await browser.storage.local.get(BENCHMARK_SETTINGS_KEY))[
    BENCHMARK_SETTINGS_KEY
  ] as Partial<BenchmarkSettings> | undefined;
  if (
    stored?.maxLatencyMs === 1000 &&
    stored.minSpeedMbps === 0 &&
    stored.timeoutMs === 3000 &&
    stored.sampleSizeKb === 1024
  ) {
    return { ...DEFAULT_BENCHMARK_SETTINGS };
  }
  return normalizeBenchmarkSettings(stored);
}

export function normalizeBenchmarkSettings(
  value?: Partial<BenchmarkSettings>,
): BenchmarkSettings {
  return {
    maxLatencyMs: clampNumber(
      value?.maxLatencyMs,
      10,
      60_000,
      DEFAULT_BENCHMARK_SETTINGS.maxLatencyMs,
    ),
    minSpeedMbps: clampNumber(
      value?.minSpeedMbps,
      0,
      10_000,
      DEFAULT_BENCHMARK_SETTINGS.minSpeedMbps,
    ),
    concurrency: 1,
    timeoutMs: clampNumber(
      value?.timeoutMs,
      200,
      60_000,
      DEFAULT_BENCHMARK_SETTINGS.timeoutMs,
    ),
    sampleSizeKb: Math.round(
      clampNumber(
        value?.sampleSizeKb,
        16,
        16_384,
        DEFAULT_BENCHMARK_SETTINGS.sampleSizeKb,
      ),
    ),
  };
}

function clampNumber(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value!));
}
