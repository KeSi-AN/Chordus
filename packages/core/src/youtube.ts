/** YouTube helpers shared by the web app and (later) the browser extension. */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract the 11-character video id from a watch / youtu.be / shorts / embed / music URL,
 * or accept a bare id. Returns null for anything else.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const s = input.trim();
  if (ID_RE.test(s)) return s;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (["youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
    if (url.pathname === "/watch") candidate = url.searchParams.get("v");
    else candidate = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null;
  }
  return candidate && ID_RE.test(candidate) ? candidate : null;
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
