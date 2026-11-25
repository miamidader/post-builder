#!/usr/bin/env python3
"""Pull every enabled feed in feeds.json into data/items.json.

Standard library only, so it runs anywhere (including GitHub Actions) with no installs.
A feed that fails is recorded and skipped; it never stops the run.
"""
import email.utils
import hashlib
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEEDS_PATH = ROOT / "feeds.json"
OUT_PATH = ROOT / "data" / "items.json"
KEEP_DAYS = 7
MAX_ITEMS = 800
UA = "Mozilla/5.0 (compatible; valleyofaz-reader/1.0)"

ATOM = "{http://www.w3.org/2005/Atom}"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}"
DC = "{http://purl.org/dc/elements/1.1/}"


def now():
    return datetime.now(timezone.utc)


def clean(text, limit=300):
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[: limit - 1].rsplit(" ", 1)[0] + "…"
    return text


def parse_date(raw):
    if not raw:
        return None
    raw = raw.strip()
    try:
        dt = email.utils.parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        dt = None
    if dt is None:
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def text_of(el, *names):
    for name in names:
        found = el.find(name)
        if found is not None and (found.text or "").strip():
            return found.text.strip()
    return ""


def parse_feed(xml_bytes):
    """Return a list of dicts: title, link, summary, published (datetime or None)."""
    root = ET.fromstring(xml_bytes)
    items = []
    if root.tag == ATOM + "feed":
        for e in root.findall(ATOM + "entry"):
            link = ""
            for l in e.findall(ATOM + "link"):
                if l.get("rel") in (None, "alternate"):
                    link = l.get("href", "")
                    break
            items.append({
                "title": text_of(e, ATOM + "title"),
                "link": link,
                "summary": text_of(e, ATOM + "summary", ATOM + "content"),
                "published": parse_date(text_of(e, ATOM + "published", ATOM + "updated")),
            })
    else:
        for e in root.iter("item"):
            items.append({
                "title": text_of(e, "title"),
                "link": text_of(e, "link"),
                "summary": text_of(e, "description", CONTENT + "encoded"),
                "published": parse_date(text_of(e, "pubDate", DC + "date")),
            })
    return items


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read()


def build_city_matcher(cities):
    # Longer names first so "Sun City West" wins over "Sun City".
    ordered = sorted(cities, key=len, reverse=True)
    return [(c, re.compile(r"\b" + re.escape(c) + r"\b", re.I)) for c in ordered]


def tag_cities(text, matchers, feed_city):
    """Cities named in the text win; the feed's own city is only a fallback."""
    found = []
    for name, rx in matchers:
        if name == "Sun City" and "Sun City West" in found:
            continue
        if rx.search(text):
            found.append(name)
    if not found and feed_city:
        found.append(feed_city)
    return found


def is_breaking(text, words):
    low = text.lower()
    return any(w in low for w in words)


CATEGORIES = [
    ("Crime & Safety", ["shot", "shooting", "killed", "homicide", "murder", "police", "arrest", "suspect", "stabbing", "chase", "fire", "explosion", "standoff", "barricade", "missing", "amber alert", "indicted", "sentenced", "drowning", "rescue", "deputies", "sheriff"]),
    ("Roads & Weather", ["crash", "collision", "freeway", "highway", "i-10", "i-17", "loop 101", "loop 202", "sr 51", "closure", "closed", "traffic", "adot", "light rail", "forecast", "weather", "storm", "rain", "heat", "flood", "wind", "monsoon", "airport", "sky harbor"]),
    ("Government", ["council", "mayor", "election", "runoff", "budget", "vote", "voters", "ordinance", "county board", "supervisors", "legislature", "governor", "lawsuit", "settle", "tax", "water services", "drought", "city manager", "esa", "schools board", "zoning", "permit"]),
]


def categorize(text):
    low = text.lower()
    for name, words in CATEGORIES:
        if any(w in low for w in words):
            return name
    return "Community"


def split_google_source(title):
    """Google News titles look like 'Headline - Outlet'."""
    if " - " in title:
        head, _, outlet = title.rpartition(" - ")
        if head and 0 < len(outlet) <= 60:
            return head.strip(), outlet.strip()
    return title, ""


def norm_title(title):
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def main():
    config = json.loads(FEEDS_PATH.read_text())
    matchers = build_city_matcher(config["cities"])
    breaking_words = [w.lower() for w in config.get("breaking_words", [])]
    run_time = now()
    cutoff = run_time - timedelta(days=KEEP_DAYS)

    previous = {}
    if OUT_PATH.exists():
        try:
            for it in json.loads(OUT_PATH.read_text()).get("items", []):
                previous[it["id"]] = it
        except (ValueError, KeyError):
            pass

    collected = {}
    feed_status = []
    for feed in config["feeds"]:
        if not feed.get("enabled", True):
            continue
        status = {"id": feed["id"], "name": feed["name"], "group": feed.get("group", ""), "ok": False, "count": 0, "error": ""}
        try:
            raw_items = parse_feed(fetch(feed["url"]))
            status["ok"] = True
        except Exception as exc:  # noqa: BLE001 - record and move on
            status["error"] = (type(exc).__name__ + ": " + str(exc))[:160]
            feed_status.append(status)
            continue

        for raw in raw_items:
            title = clean(raw["title"], 220)
            link = raw["link"].strip()
            if not title or not link:
                continue
            source = feed["name"]
            if feed["id"].startswith("gn-"):
                title, outlet = split_google_source(title)
                source = outlet or "Google News"
            summary = clean(raw["summary"])
            if summary.lower().startswith(title.lower()[:40]):
                summary = ""  # Google News repeats the headline as the summary
            published = raw["published"] or run_time
            if published < cutoff:
                continue
            item_id = hashlib.sha1(link.encode()).hexdigest()[:16]
            blob = title + " " + summary
            collected[item_id] = {
                "id": item_id,
                "title": title,
                "link": link,
                "summary": summary,
                "source": source,
                "feed": feed["id"],
                "group": feed.get("group", ""),
                "cities": tag_cities(blob, matchers, feed.get("city")),
                "breaking": is_breaking(title, breaking_words),
                "cat": categorize(title + " " + summary),
                "published": published.isoformat(),
                "first_seen": previous.get(item_id, {}).get("first_seen", run_time.isoformat()),
            }
            status["count"] += 1
        feed_status.append(status)

    # Keep recent items from earlier runs even if a feed no longer lists them.
    for item_id, item in previous.items():
        if item_id not in collected:
            try:
                if datetime.fromisoformat(item["published"]) >= cutoff:
                    collected[item_id] = item
            except (ValueError, KeyError):
                pass

    for item in collected.values():
        item.setdefault("cat", categorize(item["title"] + " " + item.get("summary", "")))

    # Drop near-duplicates (same headline from different feeds); keep the earliest published.
    by_title = {}
    for item in sorted(collected.values(), key=lambda i: i["published"]):
        key = norm_title(item["title"])
        if key not in by_title:
            by_title[key] = item
        else:
            kept = by_title[key]
            for c in item["cities"]:
                if c not in kept["cities"]:
                    kept["cities"].append(c)
    items = sorted(by_title.values(), key=lambda i: i["published"], reverse=True)[:MAX_ITEMS]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps({
        "generated": run_time.isoformat(),
        "cities": config["cities"],
        "feeds": feed_status,
        "items": items,
    }, indent=1, ensure_ascii=False))
    ok = sum(1 for f in feed_status if f["ok"])
    print(f"{len(items)} items from {ok}/{len(feed_status)} feeds")
    for f in feed_status:
        if not f["ok"]:
            print(f"  FAILED {f['id']}: {f['error']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
