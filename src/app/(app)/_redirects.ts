export type SearchParamsInput = Record<
  string,
  string | string[] | undefined
>;

export function appendSearchParams(href: string, params: SearchParamsInput) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `${href}?${query}` : href;
}
