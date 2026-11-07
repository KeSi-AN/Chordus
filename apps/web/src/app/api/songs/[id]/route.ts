import { getRequestContext, handleError, parseJson, updateSongSchema } from "@/server/api";
import { deleteSong, getSongDetail, updateSong } from "@/server/services/songs";
import { getStorage } from "@/server/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/songs/[id]">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    return Response.json(await getSongDetail(db, userId, id));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/songs/[id]">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    const patch = await parseJson(req, updateSongSchema);
    return Response.json({ song: await updateSong(db, userId, id, patch) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/songs/[id]">) {
  try {
    const { db, userId } = await getRequestContext();
    const { id } = await ctx.params;
    const removed = await deleteSong(db, userId, id);
    const storage = getStorage();
    await Promise.all(
      removed.filter((s) => s.filePath).map((s) => storage.delete(s.filePath!).catch(() => {})),
    );
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
