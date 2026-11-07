/** Small typed fetch helpers for the app's own API. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getJson<T>(url: string): Promise<T> {
  return request<T>(url);
}

export function sendJson<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT",
  body: unknown,
): Promise<T> {
  return request<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteRequest(url: string): Promise<void> {
  return request<void>(url, { method: "DELETE" });
}

export function uploadFile<T>(url: string, file: File, field = "file"): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  return request<T>(url, { method: "POST", body: form });
}

export type ClientEventType =
  | "search"
  | "open_song"
  | "play"
  | "transpose_change"
  | "pitch_change"
  | "capo_change"
  | "strum_change";

/** Fire-and-forget event logging; failures never interrupt the UI. */
export function logClientEvent(
  type: ClientEventType,
  songId: string | null,
  payload: Record<string, unknown> = {},
): void {
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, songId, payload }),
    keepalive: true,
  }).catch(() => {});
}
