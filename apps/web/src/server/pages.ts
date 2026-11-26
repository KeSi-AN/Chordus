import { notFound, redirect } from "next/navigation";
import { requestIsAuthorized } from "./api";
import { DEFAULT_USER_ID } from "./constants";
import { getDb } from "./db/client";
import { getSongDetail, NotFoundError, type SongDetail } from "./services/songs";

/** Load a song for a page, rendering the 404 page when it doesn't exist. */
export async function loadSongOr404(id: string, path = `/songs/${id}`): Promise<SongDetail> {
  await requirePageAuth(path);
  const db = await getDb();
  try {
    return await getSongDetail(db, DEFAULT_USER_ID, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

/** Pages read the database directly, so they check the access token themselves. */
export async function requirePageAuth(path: string): Promise<void> {
  if (!(await requestIsAuthorized())) redirect(`/unlock?next=${encodeURIComponent(path)}`);
}
