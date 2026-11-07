-- Full-text search over song title + artist (external-content FTS5 table kept in sync by triggers).
CREATE VIRTUAL TABLE `songs_fts` USING fts5(
  title,
  artist,
  content='songs',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `songs_fts_ai` AFTER INSERT ON `songs` BEGIN
  INSERT INTO songs_fts(rowid, title, artist) VALUES (new.rowid, new.title, new.artist);
END;
--> statement-breakpoint
CREATE TRIGGER `songs_fts_ad` AFTER DELETE ON `songs` BEGIN
  INSERT INTO songs_fts(songs_fts, rowid, title, artist) VALUES ('delete', old.rowid, old.title, old.artist);
END;
--> statement-breakpoint
CREATE TRIGGER `songs_fts_au` AFTER UPDATE OF title, artist ON `songs` BEGIN
  INSERT INTO songs_fts(songs_fts, rowid, title, artist) VALUES ('delete', old.rowid, old.title, old.artist);
  INSERT INTO songs_fts(rowid, title, artist) VALUES (new.rowid, new.title, new.artist);
END;
--> statement-breakpoint
INSERT INTO songs_fts(songs_fts) VALUES ('rebuild');
