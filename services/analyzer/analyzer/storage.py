"""File storage with the same key layout as the web app's LocalStorage (`audio/<songId>/...`)."""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Protocol

_KEY_RE = re.compile(r"^[\w./-]+$")


class Storage(Protocol):
    def path_for(self, key: str) -> Path: ...
    def put_file(self, key: str, src: Path) -> int: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...
    def delete_prefix(self, prefix: str) -> None: ...


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def path_for(self, key: str) -> Path:
        if not _KEY_RE.match(key) or ".." in key.split("/"):
            raise ValueError(f"Invalid storage key: {key}")
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise ValueError(f"Storage key escapes root: {key}")
        return p

    def put_file(self, key: str, src: Path) -> int:
        dst = self.path_for(key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        return dst.stat().st_size

    def exists(self, key: str) -> bool:
        return self.path_for(key).is_file()

    def delete(self, key: str) -> None:
        self.path_for(key).unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> None:
        """Remove everything under a key prefix such as `audio/<songId>`."""
        shutil.rmtree(self.path_for(prefix.rstrip("/")), ignore_errors=True)
