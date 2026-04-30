const YOUTUBE_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
] as const;

export const DEFAULT_ALLOWED_HOSTS: readonly string[] = YOUTUBE_HOSTS;

export function isAllowedHost(
  url: string,
  allowedHosts: readonly string[] = DEFAULT_ALLOWED_HOSTS,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  return allowedHosts.includes(parsed.hostname.toLowerCase());
}

export function isYouTubeUrl(url: string): boolean {
  return isAllowedHost(url, DEFAULT_ALLOWED_HOSTS);
}
