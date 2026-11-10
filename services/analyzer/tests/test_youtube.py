import pytest

from analyzer.youtube import clean_title, parse_video_id

VID = "dQw4w9WgXcQ"


@pytest.mark.parametrize(
    "s",
    [
        VID,
        f"https://www.youtube.com/watch?v={VID}",
        f"https://youtube.com/watch?feature=share&v={VID}&t=42",
        f"https://m.youtube.com/watch?v={VID}",
        f"https://youtu.be/{VID}?si=abc",
        f"https://www.youtube.com/shorts/{VID}",
        f"https://www.youtube.com/embed/{VID}",
        f"https://music.youtube.com/watch?v={VID}&list=x",
        f"youtube.com/watch?v={VID}",
        f"  {VID}  ",
    ],
)
def test_parse_video_id(s):
    assert parse_video_id(s) == VID


@pytest.mark.parametrize(
    "s",
    [
        "",
        "hello",
        "https://vimeo.com/123",
        "https://youtube.com/watch?v=short",
        "https://youtube.com/",
    ],
)
def test_parse_video_id_rejects(s):
    assert parse_video_id(s) is None


@pytest.mark.parametrize(
    "title, uploader, expected",
    [
        ("Artist - Song (Official Video)", None, ("Song", "Artist")),
        ("Artist – Song [Karaoke Version]", None, ("Song", "Artist")),
        ("Song (Lyrics)", "Some Channel", ("Song", "Some Channel")),
        ("Song Karaoke", "Band - Topic", ("Song", "Band")),
        ("Band - Song | Sing King Karaoke", None, ("Song", "Band")),
        ("(Official Video)", None, ("(Official Video)", None)),
    ],
)
def test_clean_title(title, uploader, expected):
    assert clean_title(title, uploader) == expected


def test_check_video_refuses_live_and_overlong():
    from analyzer.youtube import ExtractError, check_video

    check_video({"duration": 240}, 1200)
    check_video({"duration": 99999}, None)  # no limit configured
    check_video({}, 1200)  # unknown duration: let the download decide
    with pytest.raises(ExtractError, match="60 minutes long"):
        check_video({"duration": 3600}, 1200)
    with pytest.raises(ExtractError, match="Live"):
        check_video({"is_live": True}, 1200)
    with pytest.raises(ExtractError, match="Live"):
        check_video({"live_status": "is_upcoming", "duration": None}, 1200)
