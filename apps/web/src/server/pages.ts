import { notFound } from "next/navigation";
import { DEFAULT_USER_ID } from "./constants";
import { getDb } from "./db/client";
import { getSongDetail, NotFoundError, type SongDetail } from "./services/songs";

/** Load a song for a page, rendering the 404 page when it doesn't exist. */
export async function loadSongOr404(id: string): Promise<SongDetail> {
  const db = await getDb();
  try {
    return await getSongDetail(db, DEFAULT_USER_ID, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
