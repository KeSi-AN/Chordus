import { getRequestContext, handleError } from "@/server/api";
import { listMobileSongs } from "@/server/services/mobile";

/** The whole library with a version per song, so the Android app can sync only what changed. */
export async function GET() {
  try {
    const { db, userId } = await getRequestContext();
    return Response.json(
      { songs: await listMobileSongs(db, userId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return handleError(err);
  }
}
