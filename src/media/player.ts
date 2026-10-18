import * as hosts from "./host-model";
import { mediaCandidates, isCandidateUsable, type MediaCandidate } from "./candidates";
import { filesOf, type MediaAddress, type MediaFile } from "./registry";
import { getPlaybackSettings } from "../playback-settings";
import { isBlockedUrl } from "../playback-policy";
import type { XhrResponder, XhrSendContext } from "../network/xhr-types";
import type { ByteRange } from "../network/range";

export interface MediaXhrRequest {
  ctx: XhrSendContext;
  range: ByteRange | null;
  file: MediaFile | null;
  candidates: readonly MediaCandidate[];
  requested: MediaCandidate | null;
}

export interface MediaServePhase {
  type: "serve";
  name: string;
  serve(request: MediaXhrRequest): XhrResponder | null;
  dispose(): void;
}

export function acceptableCandidates(file: MediaFile | null, requested: MediaAddress | null = null): MediaCandidate[] {
  return mediaCandidates(requested, file).filter(candidate => !isBlockedUrl(candidate.href, getPlaybackSettings()));
}

export const player = { hosts, candidates: acceptableCandidates, isCandidateUsable, filesOf };

export type MediaPlayer = typeof player;
