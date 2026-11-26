import { getRequestContext, handleError } from "@/server/api";
import { getMobileSong } from "@/server/services/mobile";

/** One song, with every transpose and capo choice precomputed for offline use. */
export async function GET(_req: Request, ctx: RouteContext<"/api/mobile/songs/[id]">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    return Response.json(
      { song: await getMobileSong(db, userId, id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return handleError(err);
  }
}
