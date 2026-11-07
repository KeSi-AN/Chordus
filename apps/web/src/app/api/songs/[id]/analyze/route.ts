import { getRequestContext, handleError } from "@/server/api";
import { analyzeSong } from "@/server/services/analysis";

/** Queue (re-)analysis of the song's audio. */
export async function POST(_req: Request, ctx: RouteContext<"/api/songs/[id]/analyze">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    return Response.json({ analysis: await analyzeSong(db, userId, id) }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
