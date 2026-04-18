#!/usr/bin/env python3
"""Patch GitHub Release body from CHANGELOG.md"""
import json
import os
import sys
import urllib.request
import urllib.error

REPO = "ymj8903668-droid/trading-review-wiki"
PAT_PATH = os.path.expanduser("~/.github_pat_trading_review_wiki")
CHANGELOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "CHANGELOG.md")


def get_pat():
    with open(PAT_PATH, "r", encoding="utf-8") as f:
        return f.read().strip().lstrip("\ufeff")


def api_request(method, url, headers, body=None):
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json; charset=utf-8"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def extract_changelog_section(path, version):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    marker = f"## v{version}"
    start = content.find(marker)
    if start == -1:
        raise ValueError(f"Version {version} not found in CHANGELOG")
    end = content.find("\n---", start + len(marker))
    if end == -1:
        section = content[start:]
    else:
        section = content[start:end]
    return section.strip()


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else "0.5.6"
    tag = f"v{version.lstrip('v')}"

    pat = get_pat()
    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    # Get release
    url = f"https://api.github.com/repos/{REPO}/releases/tags/{tag}"
    release = api_request("GET", url, headers)
    release_id = release["id"]

    # Extract body from CHANGELOG
    body = extract_changelog_section(CHANGELOG, version.lstrip("v"))
    body += "\n\n### 下载\n- **Windows**: 下方 Assets 中的 `.exe` 文件\n- **macOS (Apple Silicon)**: 下方 Assets 中的 `.dmg` 文件\n- **Linux**: 下方 Assets 中的 `.deb` / `.AppImage` / `.rpm` 文件\n"

    # Patch
    patch_url = f"https://api.github.com/repos/{REPO}/releases/{release_id}"
    api_request("PATCH", patch_url, headers, {"body": body})
    print(f"[ok] Release {tag} body updated: {release['html_url']}")


if __name__ == "__main__":
    main()
