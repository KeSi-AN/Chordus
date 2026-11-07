import { createSongSchema, getRequestContext, handleError, parseJson } from "@/server/api";
import { createSongFromSheet, listSongs, type SongFilter } from "@/server/services/songs";

const FILTERS: SongFilter[] = ["all", "confirmed", "unconfirmed", "has_audio"];

export async function GET(req: Request) {
  try {
    const { db, userId } = await getRequestContext();
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") as SongFilter | null;
    const songs = await listSongs(db, {
      userId,
      query: url.searchParams.get("q") ?? undefined,
      filter: filter && FILTERS.includes(filter) ? filter : "all",
      key: url.searchParams.get("key") ?? undefined,
    });
    return Response.json({ songs });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await getRequestContext();
    const input = await parseJson(req, createSongSchema);
    const song = await createSongFromSheet(db, { ...input, userId });
    return Response.json({ song }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
