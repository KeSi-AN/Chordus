import { getRequestContext, handleError } from "@/server/api";
import { getPrefsView } from "@/server/services/prefs";

/** Confirmed values, or suggestions for anything not yet confirmed. */
export async function GET(_req: Request, ctx: RouteContext<"/api/songs/[id]/prefs">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    return Response.json({ prefs: await getPrefsView(db, userId, id) });
  } catch (err) {
    return handleError(err);
  }
}
