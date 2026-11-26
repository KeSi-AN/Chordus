import { getRequestContext, handleError } from "@/server/api";

/** Connection check for the Android app's settings: reachable, and the token is accepted. */
export async function GET() {
  try {
    await getRequestContext();
    return Response.json(
      { ok: true, app: "chordus", api: 1 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return handleError(err);
  }
}
