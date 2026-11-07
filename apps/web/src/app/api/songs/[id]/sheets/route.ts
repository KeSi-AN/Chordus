import { getRequestContext, handleError, parseJson, sheetSchema } from "@/server/api";
import { saveSheetVersion } from "@/server/services/songs";

/** Save an edited sheet as a new primary version. */
export async function POST(req: Request, ctx: RouteContext<"/api/songs/[id]/sheets">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    const { text } = await parseJson(req, sheetSchema);
    const sheet = await saveSheetVersion(db, userId, id, text);
    return Response.json({ sheet }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
