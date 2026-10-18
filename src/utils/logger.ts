export const logger = {
  info: (...args: unknown[]) => console.info("[BiliCDN]", ...args),
  warn: (...args: unknown[]) => console.warn("[BiliCDN]", ...args),
  error: (...args: unknown[]) => console.error("[BiliCDN]", ...args),
  debug: (..._args: unknown[]) => {},
};
