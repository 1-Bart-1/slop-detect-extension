/** An element the page's own HTML declares, by its id. */
export const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
