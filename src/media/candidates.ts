import { getDomains } from "../domains";
import { getPlaybackSettings } from "../playback-settings";
/**
 * Listed media addresses and portable UPOS signatures on the selected CDN hosts.
 * Without CDN selection, only the addresses listed by Bilibili participate.
 */

import { pickOne } from 'foxts/pick-random';
import { isAkamaiHost, isMirrorHost, isP2PCDNDomain, isPortableUposPath, isDedicatedMediaPath } from './cdn-classify';
import { isCoolingDown, isExcluded } from './host-model';
import type { MediaAddress, MediaFile } from './registry';

/**
 * How much a host with no measurement is preferred, lower first: what Bilibili listed for the file
 * before what is moved elsewhere (a native request has no fallback). Measurements override it
 */
export enum CandidateTier {
  /** Listed for the file (or asked for by the player) on an upos mirror */
  ListedMirror = 0,
  /** Listed on Bilibili's own PoP */
  ListedBcache = 1,
  /** A listed signature moved onto another upos mirror */
  Mirror = 2,
  /** A listed signature moved onto another PoP */
  Bcache = 3,
  /** A PCDN URL pointed back at its source host */
  Source = 4,
  /** Fetched through Bilibili's proxy */
  Proxy = 5,
  /** A P2P / PCDN host */
  P2P = 6
}

/** One URL a media request could go to: an address, and how it ranks before anything is measured */
export interface MediaCandidate extends MediaAddress {
  readonly tier: CandidateTier,
  /** Served by a P2P / PCDN host */
  readonly p2p: boolean
}

/** Bilibili's proxy hosts, which fetch a PCDN URL for us */
const PROXY_HOST_RE = /^(?:upos|proxy)-tf-/;
/** A signature must stay valid at least this long to be used */
const DEADLINE_MARGIN_MS = 60 * 1000;

/**
 * The URL a request asked for (`null` for none) and every address listed for its file (`null`
 * when the registry does not know it), as they are, plus every upgcxcode signature among them on
 * every upgcxcode host.
 */
export function mediaCandidates(requested: MediaAddress | null, file: MediaFile | null): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  const seen = new Set<string>();

  const add = (candidate: MediaCandidate) => {
    if (!seen.has(candidate.href)) {
      seen.add(candidate.href);
      candidates.push(candidate);
    }
  };

  const listed = file === null ? [] : file.addresses;
  const sources = requested === null ? listed : [requested, ...listed];

  const upgcxcodeHosts = upgcxcodeHostsOf(file);
  /** Signatures already on every upgcxcode host: the requested one is usually listed as well */
  const moved = new Set<string>();
  for (let i = 0, len = sources.length; i < len; i++) {
    const source = sources[i];
    add(asListed(source));

    const { key } = source;
    if (isPortableUposPath(source.pathname) && !isAkamaiHost(source.hostname) && !moved.has(key)) {
      moved.add(key);
      for (let j = 0, count = upgcxcodeHosts.length; j < count; j++) {
        const hostname = upgcxcodeHosts[j];
        // The path is an upgcxcode one wherever it is moved: only the host tells mirror from PoP
        const mirror = isMirrorHost(hostname);
        add({ ...source, href: `https://${hostname}${key}`, hostname, class: mirror ? 'mirror' : 'bcache', tier: mirror ? CandidateTier.Mirror : CandidateTier.Bcache, p2p: false });
      }
    }
  }
  const domains = getDomains();
  return getPlaybackSettings().cdnSelection && domains.length > 0
    ? candidates.filter(candidate => domains.includes(candidate.hostname) && !isDedicatedMediaPath(candidate.pathname))
    : candidates;
}

/** Not about to expire, and this host does not lack the file */
export function isCandidateUsable(candidate: MediaCandidate, file: MediaFile | null, now: number, nowSec: number) {
  return (candidate.deadline === 0 || (candidate.deadline - nowSec) * 1000 > DEADLINE_MARGIN_MS)
    && (file === null || !isExcluded(candidate.hostname, file, now));
}

/** The candidate a request made for this address stands for, `null` if it is not acceptable */
export function findCandidate(candidates: readonly MediaCandidate[], address: MediaAddress): MediaCandidate | null {
  for (let i = 0, len = candidates.length; i < len; i++) {
    const candidate = candidates[i];
    if (candidate.hostname === address.hostname && candidate.key === address.key) {
      return candidate;
    }
  }
  return null;
}

/**
 * A usable candidate of the lowest tier, at random, on a host not cooling down if there is one:
 * what the browser fetches when the requested URL is not acceptable
 */
export function defaultCandidate(candidates: readonly MediaCandidate[], file: MediaFile | null, now: number): MediaCandidate | null {
  const nowSec = Date.now() / 1000;
  const usable = candidates.filter(candidate => isCandidateUsable(candidate, file, now, nowSec));
  const available = usable.filter(candidate => !isCoolingDown(candidate.hostname, now));
  const options = available.length > 0 ? available : usable;
  let best: CandidateTier | null = null;
  for (let i = 0, len = options.length; i < len; i++) {
    if (best === null || options[i].tier < best) {
      best = options[i].tier;
    }
  }
  return best === null ? null : pickOne(options.filter(candidate => candidate.tier === best));
}

/** Selected hosts that can accept portable UPOS signatures */
function upgcxcodeHostsOf(_file: MediaFile | null): string[] {
  return getPlaybackSettings().cdnSelection ? getDomains().filter(host => !isAkamaiHost(host)) : [];
}

/** An address as it was given: non-P2P ones over HTTPS, P2P ones untouched (their own ports) */
function asListed(source: MediaAddress): MediaCandidate {
  const { hostname, class: cls } = source;
  if (cls === 'mcdn-upgcxcode' || cls === 'mcdn-tf' || cls === 'szbdyd' || isP2PCDNDomain(hostname)) {
    return { ...source, tier: CandidateTier.P2P, p2p: true };
  }
  const tier = PROXY_HOST_RE.test(hostname) ? CandidateTier.Proxy : (cls === 'bcache' ? CandidateTier.ListedBcache : CandidateTier.ListedMirror);
  return { ...source, href: isPortableUposPath(source.pathname) ? `https://${hostname}${source.key}` : source.href, tier, p2p: false };
}
