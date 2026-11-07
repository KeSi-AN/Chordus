import { getServerConfig } from "@/server/env";

/** Is the Python analyzer running? Used to explain why a queued job isn't moving. */
export async function GET() {
  const url = `${getServerConfig().analyzerUrl}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (!res.ok) return Response.json({ online: false, reason: `HTTP ${res.status}` });
    const body = (await res.json()) as { worker?: boolean; device?: string; melody?: boolean };
    return Response.json({
      online: Boolean(body.worker),
      device: body.device ?? null,
      melody: body.melody ?? null,
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    return Response.json({ online: false, reason: cause ?? (err as Error).message, url });
  }
}
