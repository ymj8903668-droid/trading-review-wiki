#!/usr/bin/env python3
import os
import urllib.request
import urllib.error

REPO = "ymj8903668-droid/trading-review-wiki"
JOB_ID = "71942035194"
PAT_PATH = os.path.expanduser("~/.github_pat_trading_review_wiki")

with open(PAT_PATH, "r", encoding="utf-8") as f:
    pat = f.read().strip().lstrip("\ufeff")

# Get log URL
url = f"https://api.github.com/repos/{REPO}/actions/jobs/{JOB_ID}/logs"
req = urllib.request.Request(url, headers={
    "Authorization": f"Bearer {pat}",
    "Accept": "application/vnd.github+json",
})
try:
    with urllib.request.urlopen(req) as resp:
        data = resp.read().decode("utf-8")
        # Find the Build Tauri app section and show last 80 lines
        lines = data.splitlines()
        in_section = False
        section_lines = []
        for line in lines:
            if "Build Tauri app" in line or "error" in line.lower() or "failed" in line.lower():
                in_section = True
            if in_section:
                section_lines.append(line)
        print("\n".join(section_lines[-80:]))
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()[:500]}")
