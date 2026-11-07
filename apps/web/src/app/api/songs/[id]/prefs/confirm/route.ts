import { confirmSchema, getRequestContext, handleError, parseJson } from "@/server/api";
import { confirmPrefs } from "@/server/services/prefs";

export async function POST(req: Request, ctx: RouteContext<"/api/songs/[id]/prefs/confirm">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    const input = await parseJson(req, confirmSchema);
    return Response.json({ prefs: await confirmPrefs(db, userId, id, input) });
  } catch (err) {
    return handleError(err);
  }
}
