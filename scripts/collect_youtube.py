#!/usr/bin/env python3
"""Collect public YouTube metrics into public/data/dashboard.json.

The API key stays in the collector environment. It is never copied into the
static dashboard or sent to a visitor's browser.
"""

from __future__ import annotations

import json
import os
import sys
import base64
import shutil
import subprocess
import re
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
RECENT_VIDEO_LIMIT = 50
FULL_INVENTORY_INTERVAL = timedelta(days=7)
MAX_AVATAR_BYTES = 450_000
COMMENT_VIDEOS_PER_CHANNEL = 1
COMMENT_MAX_RESULTS = 25
COMMENT_REFRESH_INTERVAL = timedelta(hours=12)


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


def duration_seconds(value: Any) -> int | None:
    """Convert a YouTube ISO 8601 duration (for example PT12M08S) to seconds."""
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value)
    if not match:
        return None
    hours, minutes, seconds = (int(part or 0) for part in match.groups())
    return hours * 3600 + minutes * 60 + seconds


def parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def compact_video_history(rows: list[dict[str, Any]], published_at: Any, now: datetime) -> list[dict[str, Any]]:
    """Preserve early video milestones while keeping the static JSON compact."""
    published = parse_datetime(published_at)
    valid = [row for row in rows if parse_datetime(row.get("observedAt"))]
    if not valid:
        return []
    valid.sort(key=lambda row: row["observedAt"])
    first = valid[0]
    kept: dict[tuple[str, ...], dict[str, Any]] = {("first",): first}
    for row in valid:
        observed = parse_datetime(row["observedAt"])
        if not observed:
            continue
        age = observed - (published or observed)
        if age <= timedelta(days=2):
            local = observed.astimezone(timezone(timedelta(hours=8)))
            bucket = ("3h", local.date().isoformat(), str(local.hour // 3))
        elif age <= timedelta(days=30):
            bucket = ("day", observed.astimezone(timezone(timedelta(hours=8))).date().isoformat())
        elif age <= timedelta(days=180):
            local = observed.astimezone(timezone(timedelta(hours=8)))
            year, week, _ = local.isocalendar()
            bucket = ("week", str(year), str(week))
        else:
            local = observed.astimezone(timezone(timedelta(hours=8)))
            bucket = ("month", str(local.year), str(local.month))
        kept[bucket] = row
    return sorted({row["observedAt"]: row for row in kept.values()}.values(), key=lambda row: row["observedAt"])


def comment_samples(video_id: str) -> tuple[list[dict[str, Any]], str | None]:
    """Fetch a bounded sample of public top-level comments without failing collection."""
    try:
        payload = api_get("commentThreads", part="snippet", videoId=video_id, maxResults=str(COMMENT_MAX_RESULTS), order="relevance", textFormat="plainText")
    except RuntimeError as error:
        return [], str(error)
    samples = []
    for thread in payload.get("items", []):
        snippet = thread.get("snippet", {}).get("topLevelComment", {}).get("snippet", {})
        text = str(snippet.get("textDisplay") or "").strip()
        if text:
            samples.append({"text": text, "likeCount": numeric(snippet.get("likeCount")) or 0, "publishedAt": snippet.get("publishedAt")})
    return samples, None


def comment_targets(videos: list[dict[str, Any]], catalog_by_id: dict[str, dict[str, Any]], now: datetime) -> set[str]:
    """Limit public-comment calls to one due sample per channel per scheduled run."""
    candidates = []
    for video in videos:
        if (numeric(video.get("commentCount")) or 0) <= 0:
            continue
        prior = catalog_by_id.get(video["id"], {})
        sampled = parse_datetime(prior.get("commentSampledAt"))
        if sampled and now - sampled < COMMENT_REFRESH_INTERVAL:
            continue
        candidates.append((sampled, video))
    candidates.sort(key=lambda pair: (pair[0] is not None, pair[0] or datetime.min.replace(tzinfo=timezone.utc), -(parse_datetime(pair[1].get("publishedAt")) or now).timestamp()))
    return {video["id"] for _, video in candidates[:COMMENT_VIDEOS_PER_CHANNEL]}


def cache_avatar(url: str | None, fallback: str | None) -> str | None:
    """Embed a small channel avatar so the static dashboard has no fragile image dependency."""
    if not url:
        return fallback
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"yt3.ggpht.com", "yt3.googleusercontent.com"}:
        return fallback
    try:
        curl = shutil.which("curl.exe") or shutil.which("curl")
        if not curl:
            return fallback
        result = subprocess.run([curl, "--fail", "--silent", "--show-error", "--max-time", "20", "--max-filesize", str(MAX_AVATAR_BYTES), "--proto", "=https", url], capture_output=True, timeout=25)
        payload = result.stdout
        if result.returncode or not payload or len(payload) > MAX_AVATAR_BYTES:
            return fallback
        mime = "image/jpeg" if payload.startswith(b"\xff\xd8\xff") else "image/png" if payload.startswith(b"\x89PNG\r\n\x1a\n") else "image/webp" if payload.startswith(b"RIFF") and payload[8:12] == b"WEBP" else None
        return f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}" if mime else fallback
    except (OSError, subprocess.SubprocessError):
        return fallback


def configured_targets(entries: list[Any]) -> list[dict[str, str | None]]:
    """Resolve a group of configured channel URLs and remove duplicates."""
    targets: list[dict[str, str | None]] = []
    known: set[str] = set()
    for entry in entries:
        link = entry.get("url", "") if isinstance(entry, dict) else str(entry)
        if not link:
            continue
        channel_id = resolve_channel(link)
        if channel_id in known:
            continue
        known.add(channel_id)
        targets.append({"id": channel_id, "label": entry.get("label") if isinstance(entry, dict) else None})
    return targets


def needs_full_inventory(catalog: dict[str, dict[str, Any]], scan_at: Any, now: datetime) -> bool:
    try:
        return not catalog or not scan_at or now - datetime.fromisoformat(str(scan_at).replace("Z", "+00:00")) >= FULL_INVENTORY_INTERVAL
    except ValueError:
        return True


def collect_group(
    targets: list[dict[str, str | None]],
    previous_by_id: dict[str, dict[str, Any]],
    catalog_by_id: dict[str, dict[str, Any]],
    category_names: dict[str, str | None],
    now: datetime,
    observed_at: str,
    full_inventory: bool,
    include_comments: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Collect a self-contained channel group without mixing it with another group."""
    if not targets:
        return [], []
    ids = [str(target["id"]) for target in targets]
    items: list[dict[str, Any]] = []
    for group in chunks(ids):
        items.extend(api_get("channels", part="snippet,statistics,contentDetails", id=",".join(group), maxResults="50").get("items", []))
    channels_by_id = {item["id"]: item for item in items}
    output_channels: list[dict[str, Any]] = []

    for target in targets:
        channel_id = str(target["id"])
        item = channels_by_id.get(channel_id)
        if not item:
            continue
        snippet, stats = item.get("snippet", {}), item.get("statistics", {})
        uploads_playlist = item.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
        playlist_items: list[dict[str, Any]] = []
        page_token: str | None = None
        while uploads_playlist:
            params = {"part": "snippet,contentDetails", "playlistId": uploads_playlist, "maxResults": str(RECENT_VIDEO_LIMIT)}
            if page_token:
                params["pageToken"] = page_token
            page = api_get("playlistItems", **params)
            playlist_items.extend(page.get("items", []))
            page_token = page.get("nextPageToken")
            if not full_inventory or not page_token:
                break

        video_ids = [row.get("contentDetails", {}).get("videoId") or row.get("snippet", {}).get("resourceId", {}).get("videoId") for row in playlist_items]
        video_map: dict[str, dict[str, Any]] = {}
        for group in chunks([video_id for video_id in video_ids if video_id]):
            video_map.update({video["id"]: video for video in api_get("videos", part="snippet,statistics,contentDetails", id=",".join(group), maxResults="50").get("items", [])})

        videos: list[dict[str, Any]] = []
        for video_id in video_ids:
            video = video_map.get(video_id)
            if not video:
                continue
            video_snippet, video_stats, video_content = video.get("snippet", {}), video.get("statistics", {}), video.get("contentDetails", {})
            category_id = video_snippet.get("categoryId")
            videos.append({"id": video_id, "title": video_snippet.get("title", "未命名视频"), "publishedAt": video_snippet.get("publishedAt"), "viewCount": numeric(video_stats.get("viewCount")), "likeCount": numeric(video_stats.get("likeCount")), "commentCount": numeric(video_stats.get("commentCount")), "durationSeconds": duration_seconds(video_content.get("duration")), "liveBroadcastContent": video_snippet.get("liveBroadcastContent"), "tags": [str(tag) for tag in video_snippet.get("tags", []) if str(tag).strip()][:50], "categoryId": category_id, "categoryTitle": category_names.get(category_id), "thumbnail": thumbnail(video), "url": f"https://www.youtube.com/watch?v={video_id}"})
        videos.sort(key=lambda row: row.get("publishedAt") or "", reverse=True)
        comment_video_ids = comment_targets(videos, catalog_by_id, now) if include_comments else set()

        for video in videos:
            prior_video = catalog_by_id.get(video["id"], {})
            metrics = [{"observedAt": row.get("observedAt"), "viewCount": numeric(row.get("viewCount")), "likeCount": numeric(row.get("likeCount")), "commentCount": numeric(row.get("commentCount"))} for row in prior_video.get("metricHistory", [])]
            metrics.append({"observedAt": observed_at, "viewCount": video.get("viewCount"), "likeCount": video.get("likeCount"), "commentCount": video.get("commentCount")})
            video["metricHistory"] = compact_video_history(metrics, video.get("publishedAt"), now)
            if include_comments and video["id"] in comment_video_ids:
                samples, sample_error = comment_samples(video["id"])
                video["commentSamples"] = samples
                video["commentSampledAt"] = observed_at
                if sample_error:
                    video["commentSampleError"] = sample_error
            elif include_comments:
                video["commentSamples"] = prior_video.get("commentSamples", [])
                video["commentSampledAt"] = prior_video.get("commentSampledAt")
                if prior_video.get("commentSampleError"):
                    video["commentSampleError"] = prior_video["commentSampleError"]

        if full_inventory:
            present_ids = {video["id"] for video in videos}
            catalog_by_id = {video_id: row for video_id, row in catalog_by_id.items() if row.get("channelId") != channel_id or video_id in present_ids}
        prior = previous_by_id.get(channel_id, {})
        history = [{**row, "id": channel_id} for row in prior.get("history", [])] + [{"id": channel_id, "observedAt": observed_at, "subscriberCount": None if stats.get("hiddenSubscriberCount") else numeric(stats.get("subscriberCount")), "channelViews": numeric(stats.get("viewCount"))}]
        history = [row for row in compact_history(history, now) if row["id"] == channel_id]
        published = [parsed for video in videos if (parsed := parse_datetime(video.get("publishedAt")))]
        name = target.get("label") or snippet.get("title") or channel_id
        for video in videos:
            catalog_by_id[video["id"]] = {**video, "channelId": channel_id, "channel": name, "observedAt": observed_at}
        avatar_url = thumbnail(item)
        output_channels.append({"id": channel_id, "name": name, "url": f"https://www.youtube.com/channel/{channel_id}", "avatar": avatar_url, "avatarDataUrl": cache_avatar(avatar_url, prior.get("avatarDataUrl")), "subscriberCount": None if stats.get("hiddenSubscriberCount") else numeric(stats.get("subscriberCount")), "channelViews": numeric(stats.get("viewCount")), "videoCount": numeric(stats.get("videoCount")), "lastPublishedAt": videos[0].get("publishedAt") if videos else None, "uploads7d": sum(1 for published_at in published if now - published_at <= timedelta(days=7)), "history": [{key: value for key, value in row.items() if key != "id"} for row in history], "videos": videos[:RECENT_VIDEO_LIMIT]})

    kept_ids = {channel["id"] for channel in output_channels}
    catalog = [row for row in catalog_by_id.values() if row.get("channelId") in kept_ids]
    catalog.sort(key=lambda row: row.get("publishedAt") or "", reverse=True)
    return output_channels, catalog


def main() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    targets = configured_targets(config.get("channels", []))
    benchmark_targets = configured_targets(config.get("benchmarks", []))
    if not targets:
        raise RuntimeError("Add at least one channel URL to config/channels.json")

    now = datetime.now(timezone.utc)
    observed_at = iso_now()
    previous = json.loads(DATA_PATH.read_text(encoding="utf-8")) if DATA_PATH.exists() else {}
    collector = previous.get("collector", {})
    owned_catalog_by_id = {row["id"]: row for row in previous.get("videoCatalog", []) if row.get("id")}
    benchmark_catalog_by_id = {row["id"]: row for row in previous.get("benchmarkVideoCatalog", []) if row.get("id")}
    full_inventory = needs_full_inventory(owned_catalog_by_id, collector.get("fullInventoryScannedAt"), now)
    benchmark_full_inventory = needs_full_inventory(benchmark_catalog_by_id, collector.get("benchmarkFullInventoryScannedAt"), now)
    try:
        category_names = {row.get("id"): row.get("snippet", {}).get("title") for row in api_get("videoCategories", part="snippet", regionCode="TW").get("items", [])}
    except RuntimeError:
        category_names = {}

    channels, catalog = collect_group(targets, {channel["id"]: channel for channel in previous.get("channels", []) if channel.get("id")}, owned_catalog_by_id, category_names, now, observed_at, full_inventory, include_comments=True)
    benchmarks, benchmark_catalog = collect_group(benchmark_targets, {channel["id"]: channel for channel in previous.get("benchmarks", []) if channel.get("id")}, benchmark_catalog_by_id, category_names, now, observed_at, benchmark_full_inventory, include_comments=False)
    payload = {
        "generatedAt": observed_at,
        "collector": {
            "status": "ok",
            "message": "已从 YouTube Data API 刷新自有频道与对标账号的公开数据。",
            "channelsCollected": len(channels),
            "benchmarksCollected": len(benchmarks),
            "fullInventoryScannedAt": observed_at if full_inventory else collector.get("fullInventoryScannedAt"),
            "benchmarkFullInventoryScannedAt": observed_at if benchmark_full_inventory else collector.get("benchmarkFullInventoryScannedAt"),
        },
        "channels": channels,
        "videoCatalog": catalog,
        "benchmarks": benchmarks,
        "benchmarkVideoCatalog": benchmark_catalog,
    }
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"channelsCollected": len(channels), "benchmarksCollected": len(benchmarks), "generatedAt": observed_at}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"collector failed: {error}", file=sys.stderr)
        raise
