import { getRequestContext, handleError, jsonError } from "@/server/api";
import { getAnalysis } from "@/server/services/analysis";

/** Progress polling for one analysis (the song page polls every 2 s while it runs). */
export async function GET(_req: Request, ctx: RouteContext<"/api/analyses/[id]">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    const analysis = await getAnalysis(db, userId, id);
    if (!analysis) return jsonError(404, "Analysis not found");
    return Response.json({ analysis }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleError(err);
  }
}
