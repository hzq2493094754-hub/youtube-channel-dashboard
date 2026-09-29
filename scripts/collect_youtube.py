#!/usr/bin/env python3
"""Collect public YouTube metrics into public/data/dashboard.json.

The API key stays in the collector environment. It is never copied into the
static dashboard or sent to a visitor's browser.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "channels.json"
DATA_PATH = ROOT / "public" / "data" / "dashboard.json"
API_BASE = "https://www.googleapis.com/youtube/v3"
RECENT_VIDEO_LIMIT = 12


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def api_get(resource: str, **params: str) -> dict[str, Any]:
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not key:
        raise RuntimeError("YOUTUBE_API_KEY is required")
    params["key"] = key
    url = f"{API_BASE}/{resource}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "youtube-channel-observer/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(detail).get("error", {}).get("message", detail)
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"YouTube Data API request failed ({error.code}): {detail}") from error


def numeric(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def chunks(values: list[str], size: int = 50):
    for index in range(0, len(values), size):
        yield values[index:index + size]


def resolve_channel(link: str) -> str:
    """Resolve a raw channel ID, handle URL, old username URL, or channel URL."""
    raw = link.strip()
    if raw.startswith("UC") and len(raw) >= 20:
        return raw
    parsed = urllib.parse.urlparse(raw if "://" in raw else f"https://www.youtube.com/{raw.lstrip('/')}")
    pieces = [piece for piece in parsed.path.split("/") if piece]
    if len(pieces) == 1 and pieces[0].startswith("UC"):
        return pieces[0]
    if len(pieces) >= 2 and pieces[0] == "channel" and pieces[1].startswith("UC"):
        return pieces[1]
    if pieces and pieces[0].startswith("@"):
        payload = api_get("channels", part="id", forHandle=pieces[0])
    elif len(pieces) >= 2 and pieces[0] == "user":
        payload = api_get("channels", part="id", forUsername=pieces[1])
    else:
        raise ValueError(f"Unsupported channel link: {link}")
    items = payload.get("items", [])
    if not items:
        raise ValueError(f"Channel not found: {link}")
    return items[0]["id"]


def compact_history(rows: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    """Keep 3-hour points for 7d, daily points for 30d, then weekly points."""
    kept: dict[tuple[str, ...], dict[str, Any]] = {}
    for row in sorted(rows, key=lambda item: item.get("observedAt", "")):
        observed = datetime.fromisoformat(row["observedAt"].replace("Z", "+00:00"))
        local = observed.astimezone(timezone(timedelta(hours=8)))
        age = now - observed
        if age <= timedelta(days=7):
            bucket = ("3h", local.date().isoformat(), str(local.hour // 3))
        elif age <= timedelta(days=30):
            bucket = ("day", local.date().isoformat())
        else:
            year, week, _ = local.isocalendar()
            bucket = ("week", str(year), str(week))
        kept[(row["id"], *bucket)] = row
    return sorted(kept.values(), key=lambda item: (item["id"], item["observedAt"]))


def thumbnail(item: dict[str, Any]) -> str | None:
    thumbnails = item.get("snippet", {}).get("thumbnails", {})
    return (thumbnails.get("medium") or thumbnails.get("high") or thumbnails.get("default") or {}).get("url")


def main() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    configured = config.get("channels", [])
    if not configured:
        raise RuntimeError("Add at least one channel URL to config/channels.json")
    targets = []
    for entry in configured:
        link = entry.get("url", "") if isinstance(entry, dict) else str(entry)
        if link:
            targets.append({"id": resolve_channel(link), "label": entry.get("label") if isinstance(entry, dict) else None})
    if not targets:
        raise RuntimeError("No valid channel URLs configured")
    now = datetime.now(timezone.utc)
    observed_at = iso_now()
    previous = json.loads(DATA_PATH.read_text(encoding="utf-8")) if DATA_PATH.exists() else {}
    previous_by_id = {channel["id"]: channel for channel in previous.get("channels", []) if channel.get("id")}
    ids = [target["id"] for target in targets]
    items: list[dict[str, Any]] = []
    for group in chunks(ids):
        items.extend(api_get("channels", part="snippet,statistics,contentDetails", id=",".join(group), maxResults="50").get("items", []))
    channels_by_id = {item["id"]: item for item in items}
    output_channels = []
    for target in targets:
        item = channels_by_id.get(target["id"])
        if not item:
            continue
        snippet, stats = item.get("snippet", {}), item.get("statistics", {})
        uploads_playlist = item.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
        playlist_items = api_get("playlistItems", part="snippet,contentDetails", playlistId=uploads_playlist, maxResults=str(RECENT_VIDEO_LIMIT)).get("items", []) if uploads_playlist else []
        video_ids = [row.get("contentDetails", {}).get("videoId") or row.get("snippet", {}).get("resourceId", {}).get("videoId") for row in playlist_items]
        video_map: dict[str, dict[str, Any]] = {}
        for group in chunks([video_id for video_id in video_ids if video_id]):
            video_map.update({video["id"]: video for video in api_get("videos", part="snippet,statistics", id=",".join(group), maxResults="50").get("items", [])})
        videos = []
        for video_id in video_ids:
            video = video_map.get(video_id)
            if not video:
                continue
            video_snippet, video_stats = video.get("snippet", {}), video.get("statistics", {})
            videos.append({"id": video_id, "title": video_snippet.get("title", "未命名视频"), "publishedAt": video_snippet.get("publishedAt"), "viewCount": numeric(video_stats.get("viewCount")), "likeCount": numeric(video_stats.get("likeCount")), "thumbnail": thumbnail(video), "url": f"https://www.youtube.com/watch?v={video_id}"})
        videos.sort(key=lambda row: row.get("publishedAt") or "", reverse=True)
        prior = previous_by_id.get(target["id"], {})
        history = [{**row, "id": target["id"]} for row in prior.get("history", [])] + [{"id": target["id"], "observedAt": observed_at, "subscriberCount": None if stats.get("hiddenSubscriberCount") else numeric(stats.get("subscriberCount")), "channelViews": numeric(stats.get("viewCount"))}]
        history = [row for row in compact_history(history, now) if row["id"] == target["id"]]
        published = [datetime.fromisoformat(video["publishedAt"].replace("Z", "+00:00")) for video in videos if video.get("publishedAt")]
        output_channels.append({"id": target["id"], "name": target.get("label") or snippet.get("title") or target["id"], "url": f"https://www.youtube.com/channel/{target['id']}", "avatar": thumbnail(item), "subscriberCount": None if stats.get("hiddenSubscriberCount") else numeric(stats.get("subscriberCount")), "channelViews": numeric(stats.get("viewCount")), "videoCount": numeric(stats.get("videoCount")), "lastPublishedAt": videos[0].get("publishedAt") if videos else None, "uploads7d": sum(1 for date in published if now - date <= timedelta(days=7)), "history": [{key: value for key, value in row.items() if key != "id"} for row in history], "videos": videos})
    payload = {"generatedAt": observed_at, "collector": {"status": "ok", "message": "已从 YouTube Data API 刷新频道公开数据。", "channelsCollected": len(output_channels)}, "channels": output_channels}
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"channelsCollected": len(output_channels), "generatedAt": observed_at}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"collector failed: {error}", file=sys.stderr)
        raise
