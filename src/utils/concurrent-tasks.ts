export async function runConcurrent<T>(
  items: readonly T[], concurrency: number, run: (item: T) => Promise<void>, signal?: AbortSignal,
): Promise<void> {
  let index = 0;
  const count = Math.max(1, Math.min(items.length, Math.floor(concurrency) || 1));
  await Promise.all(Array.from({ length: count }, async () => {
    while (!signal?.aborted) {
      const itemIndex = index++;
      if (itemIndex >= items.length) return;
      await run(items[itemIndex]);
    }
  }));
}
