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
    r"\s*[\[(](?:official\s*(?:music\s*|lyric\s*)?video|official\s*audio|music\s*video|"
    r"lyrics?(?:\s*video)?|lyrical(?:\s*video)?|audio|full\s*(?:video|audio)(?:\s*song)?|"
    r"full\s*song|video\s*song|karaoke(?:\s*version)?|instrumental|hd|hq|4k|visualizer|"
    r"with lyrics|lyric video|sing along|remastered(?:\s*\d{4})?)[\])]",
    re.IGNORECASE,
)
#: A "|" section containing one of these is channel promotion, not the performer.
_PROMO = re.compile(r"karaoke|lyrics?|official|video|audio|channel|\bhd\b|\b4k\b", re.IGNORECASE)


def _same_brand(part: str, uploader: str) -> bool:
    """'Coke Studio Season 10' is the show of the channel 'Coke Studio Pakistan', not a song."""
    a, b = part.lower().split(), uploader.lower().split()
    if min(len(a), len(b)) >= 2:
        return a[:2] == b[:2]
    return a == b


def clean_title(title: str, uploader: str | None = None) -> tuple[str, str | None]:
    """'Artist - Song (Official Video) [Karaoke]' -> ('Song', 'Artist').

    Titles divided by "|" are read as sections: a section naming the channel is dropped, the
    first one left is the song, and a single remaining section is the performer
    ('Show | Song | Performer' on a channel called 'Show ...').
    """
    cleaned = _NOISE.sub("", title).strip()
    parts = [p.strip() for p in cleaned.split("|") if p.strip()]
    if uploader and len(parts) > 1:
        parts = [p for p in parts if not _same_brand(p, uploader)] or parts
    t = parts[0] if parts else ""
    # More than two sections is a credits list (cast, director, label), not "song | performer".
    performer = parts[1] if len(parts) == 2 and not _PROMO.search(parts[1]) else None
    t = re.sub(r"\s+karaoke(?:\s+version)?$", "", t, flags=re.IGNORECASE).strip()
    artist: str | None = None
    m = re.match(r"^(.+?)\s+[-–—]\s+(.+)$", t)
    if m:
        artist, t = m.group(1).strip(), m.group(2).strip()
    elif performer:
        artist = performer
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


class ExtractError(RuntimeError):
    """The video cannot be used; the message is shown to the user as-is."""


def check_video(info: dict, max_seconds: float | None) -> None:
    """Refuse live streams and videos too long to be one song, before downloading anything."""
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
        raise ExtractError("Live streams can't be analyzed. Use the video once it has ended.")
    duration = info.get("duration")
    if max_seconds and duration and duration > max_seconds:
        raise ExtractError(
            f"This video is {duration / 60:.0f} minutes long; the limit is "
            f"{max_seconds / 60:.0f} minutes (ANALYZER_MAX_MINUTES)."
        )


class Extractor(Protocol):
    def extract(self, video_id: str, out_dir: Path) -> ExtractResult: ...


class YtDlpExtractor:
    """Downloads the best audio-only stream (m4a preferred: plays everywhere, no re-encode)."""

    def __init__(self, max_seconds: float | None = None) -> None:
        self.max_seconds = max_seconds

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
            # A stalled connection must fail the job, not hang the only worker forever.
            "socket_timeout": 30,
            "retries": 3,
            "fragment_retries": 3,
        }
        url = f"https://www.youtube.com/watch?v={video_id}"
        with yt_dlp.YoutubeDL(opts) as ydl:
            check_video(ydl.extract_info(url, download=False) or {}, self.max_seconds)
            info = ydl.extract_info(url, download=True)
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
