import { transformPlayInfo } from "./play-info";
import type { unsafeWindow } from "$";

type Interceptor = (response: any, url: string) => string | boolean | undefined;
type PageWindow = typeof unsafeWindow & { __playinfo__?: Record<string, any> };

export function installInterceptor(pageWindow: PageWindow): void {
  const interceptors: Interceptor[] = [];
  const interceptNetResponse = (handler: Interceptor): void => { interceptors.push(handler); };
  const handleInterceptedResponse = (response: any, url: string): any =>
    interceptors.reduce<any>((modified, handler) => {
      const result = handler(modified, url);
      return result ? result : modified;
    }, response);

  const OriginalXMLHttpRequest = pageWindow.XMLHttpRequest;
  pageWindow.XMLHttpRequest = class extends OriginalXMLHttpRequest {
    override get responseText(): string {
      if (this.readyState !== this.DONE) return super.responseText;
      return handleInterceptedResponse(super.responseText, this.responseURL) as string;
    }
    override get response(): any {
      if (this.readyState !== this.DONE) return super.response;
      return handleInterceptedResponse(super.response, this.responseURL);
    }
  };

  const OriginalFetch = pageWindow.fetch;
  pageWindow.fetch = (input, init) =>
    !handleInterceptedResponse(null, input as string)
      ? OriginalFetch(input, init)
      : OriginalFetch(input, init).then((response) => {
          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("application/json")) return response;
          return new Promise<Response>((resolve) =>
            response.text().then((body) =>
              resolve(new Response(handleInterceptedResponse(body, input as string) as string, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              })),
            ),
          );
        });

  interceptNetResponse((response, url) => {
    if (response === null) return true;
    if (
      url.startsWith("https://api.bilibili.com/x/player/wbi/playurl") ||
      url.startsWith("https://api.bilibili.com/pgc/player/web/v2/playurl") ||
      url.startsWith("https://api.bilibili.com/x/player/playurl") ||
      url.startsWith("https://api.bilibili.com/pgc/player/web/playurl") ||
      url.startsWith("https://api.bilibili.com/pugv/player/web/playurl")
    ) {
      console.log("[BiliCDNSwitcher]: (Intercepted) playurl api response.");
      const playInfo = JSON.parse(response);
      console.debug("[BiliCDNSwitcher]:", playInfo);
      transformPlayInfo(playInfo);
      return JSON.stringify(playInfo);
    }
    return undefined;
  });

  if (pageWindow.__playinfo__) {
    console.log("[BiliCDNSwitcher]: Directly modify the window.__playinfo__");
    transformPlayInfo(pageWindow.__playinfo__);
  }
  let internalPlayInfo = pageWindow.__playinfo__;
  Object.defineProperty(pageWindow, "__playinfo__", {
    get: () => internalPlayInfo,
    set: (value: Record<string, any>) => {
      console.log("[BiliCDNSwitcher]: Property set window.__playinfo__");
      transformPlayInfo(value);
      internalPlayInfo = value;
    },
  });
}
