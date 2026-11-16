import { hackernews } from './hackernews';
import { linkedin } from './linkedin';
import { reddit } from './reddit';
import { twitter } from './twitter';
import type { Site } from './types';

export const SITES: Site[] = [reddit, linkedin, hackernews, twitter];

/** The site a page belongs to, by its host name. */
export function siteOf(hostname: string): Site | undefined {
  return SITES.find((site) => site.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)));
}
