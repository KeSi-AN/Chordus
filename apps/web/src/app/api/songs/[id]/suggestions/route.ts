import { getRequestContext, handleError } from "@/server/api";
import { computeSuggestions } from "@/server/services/prefs";

/**
 * What the engine would pick now, ignoring confirmed values ("Re-suggest").
 * `?transpose=n` ranks the capo for a given transpose instead of the suggested one.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/songs/[id]/suggestions">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    const t = new URL(req.url).searchParams.get("transpose");
    const transposeOverride = t !== null && /^-?\d+$/.test(t) ? Number(t) : undefined;
    return Response.json({
      suggestions: await computeSuggestions(db, userId, id, { transposeOverride }),
    });
  } catch (err) {
    return handleError(err);
  }
}
