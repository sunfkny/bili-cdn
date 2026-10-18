import type { SyntheticXhrSink } from "./xhr-override";
export type XHROpenArgs =
  | [
    method: string,
    url: string | URL,
    async: boolean,
    username?: string | null | undefined,
    password?: string | null | undefined
  ]
  | [
    method: string,
    url: string | URL
  ];

/**
 * If `null` is returned, the XMLHttpRequest will be nullified.
 */
export type OnXhrOpenHook = (xhrOpenArgs: XHROpenArgs, xhr: XMLHttpRequest) => XHROpenArgs | null;

export interface XhrSendContext {
  /** Upper-cased request method */
  readonly method: string,
  /** Absolute request URL after all `onXhrOpen` hooks */
  readonly url: string,
  readonly async: boolean,
  /** `open()` received a username or password */
  readonly hasUrlCredentials: boolean,
  /** Request headers set by the page, names lower-cased, in call order */
  readonly headers: ReadonlyArray<readonly [name: string, value: string]>,
  readonly body: Document | XMLHttpRequestBodyInit | null | undefined,
  readonly responseType: XMLHttpRequestResponseType,
  readonly withCredentials: boolean
}

export type XhrResponder = (response: SyntheticXhrSink) => void;
/**
 * Return a responder to answer the request with a synthetic response, or `null` to let the
 * browser send it. Only `responseType === 'arraybuffer'` requests can be answered.
 */
export type OnXhrSendHook = (ctx: XhrSendContext) => XhrResponder | null;

