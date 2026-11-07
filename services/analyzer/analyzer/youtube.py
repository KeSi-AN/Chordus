"""YouTube audio extraction behind an interface (hosted servers are often blocked by YouTube,
so the strategy may change later: plan section 9)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import parse_qs, urlparse

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def parse_video_id(url_or_id: str) -> str | None:
    """Accept watch/short/embed/shorts/music URLs or a bare 11-character id."""
    s = url_or_id.strip()
    if _ID_RE.match(s):
        return s
    try:
        u = urlparse(s if "://" in s else f"https://{s}")
    except ValueError:
        return None
    host = (u.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    candidate: str | None = None
    if host == "youtu.be":
        candidate = u.path.lstrip("/").split("/")[0]
    elif host in ("youtube.com", "music.youtube.com", "youtube-nocookie.com"):
        if u.path == "/watch":
            candidate = parse_qs(u.query).get("v", [None])[0]
        else:
            m = re.match(r"^/(?:embed|shorts|live|v)/([^/?#]+)", u.path)
            candidate = m.group(1) if m else None
    return candidate if candidate and _ID_RE.match(candidate) else None


_NOISE = re.compile(
    r"\s*[\[(](?:official\s*(?:music\s*)?video|official\s*audio|lyrics?(?:\s*video)?|audio|"
    r"karaoke(?:\s*version)?|instrumental|hd|hq|4k|visualizer|with lyrics|lyric video|"
    r"sing along|remastered(?:\s*\d{4})?)[\])]",
    re.IGNORECASE,
)


def clean_title(title: str, uploader: str | None = None) -> tuple[str, str | None]:
    """'Artist - Song (Official Video) [Karaoke]' -> ('Song', 'Artist')."""
    t = _NOISE.sub("", title).strip()
    t = re.sub(r"\s*\|\s*.*$", "", t)  # "Song | Channel promo"
    t = re.sub(r"\s+karaoke(?:\s+version)?$", "", t, flags=re.IGNORECASE).strip()
    artist: str | None = None
    m = re.match(r"^(.+?)\s+[-–—]\s+(.+)$", t)
    if m:
        artist, t = m.group(1).strip(), m.group(2).strip()
    elif uploader:
        artist = re.sub(r"\s*-\s*Topic$|VEVO$", "", uploader).strip() or None
    return t.strip(" -–—") or title.strip(), artist


@dataclass
class ExtractResult:
    path: Path
    title: str
    artist: str | None
    duration: float | None
    ext: str


class Extractor(Protocol):
    def extract(self, video_id: str, out_dir: Path) -> ExtractResult: ...


class YtDlpExtractor:
    """Downloads the best audio-only stream (m4a preferred: plays everywhere, no re-encode)."""

    def extract(self, video_id: str, out_dir: Path) -> ExtractResult:
        import yt_dlp

        out_dir.mkdir(parents=True, exist_ok=True)
        opts = {
            "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
            "outtmpl": str(out_dir / f"{video_id}.%(ext)s"),
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
        path = Path(ydl.prepare_filename(info))
        if not path.exists():
            matches = list(out_dir.glob(f"{video_id}.*"))
            if not matches:
                raise RuntimeError("yt-dlp finished but no audio file was written")
            path = matches[0]
        title, artist = clean_title(
            info.get("track") or info.get("title") or video_id, info.get("uploader")
        )
        if info.get("artist"):
            artist = str(info["artist"]).split(",")[0].strip()
        return ExtractResult(
            path=path,
            title=title,
            artist=artist,
            duration=info.get("duration"),
            ext=path.suffix.lstrip(".").lower(),
        )
