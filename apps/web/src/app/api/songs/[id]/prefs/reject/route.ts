import { getRequestContext, handleError, parseJson, rejectSchema } from "@/server/api";
import { rejectSuggestion } from "@/server/services/prefs";

export async function POST(req: Request, ctx: RouteContext<"/api/songs/[id]/prefs/reject">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    const input = await parseJson(req, rejectSchema);
    await rejectSuggestion(db, userId, id, input);
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
