import { clientEventSchema, getRequestContext, handleError, parseJson } from "@/server/api";
import { logEvent } from "@/server/services/events";
import { getSongDetail } from "@/server/services/songs";

/** Client-side events (opens, plays, transpose/pitch changes, searches). */
export async function POST(req: Request) {
  try {
    const { db, userId } = await getRequestContext();
    const ev = await parseJson(req, clientEventSchema);
    if (ev.songId) await getSongDetail(db, userId, ev.songId);
    await logEvent(db, { userId, songId: ev.songId ?? null, type: ev.type, payload: ev.payload });
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
