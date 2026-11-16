import { hackernews } from './hackernews';
import { linkedin } from './linkedin';
import { reddit } from './reddit';
import type { Site } from './types';

export const SITES: Site[] = [reddit, linkedin, hackernews];

/** The site a page belongs to, by its host name. */
export function siteOf(hostname: string): Site | undefined {
  return SITES.find((site) => site.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)));
}
