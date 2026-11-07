/** YouTube helpers shared by the web app and (later) the browser extension. */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
/** scheme? host path?query — parsed by hand so core stays free of DOM/Node globals. */
const URL_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#:]+)(?::\d+)?([^?#]*)(?:\?([^#]*))?/i;

function queryParam(query: string | undefined, name: string): string | null {
  for (const pair of (query ?? "").split("&")) {
    const [k, v] = pair.split("=");
    if (k === name && v) return decodeURIComponent(v);
  }
  return null;
}

/**
 * Extract the 11-character video id from a watch / youtu.be / shorts / embed / music URL,
 * or accept a bare id. Returns null for anything else.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const s = input.trim();
  if (ID_RE.test(s)) return s;
  const m = URL_RE.exec(s);
  if (!m) return null;
  const host = m[1]!.toLowerCase().replace(/^(www\.|m\.)/, "");
  const path = m[2] ?? "";
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = path.split("/")[1] ?? null;
  } else if (["youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
    if (path === "/watch") candidate = queryParam(m[3], "v");
    else candidate = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(path)?.[1] ?? null;
  }
  return candidate && ID_RE.test(candidate) ? candidate : null;
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
