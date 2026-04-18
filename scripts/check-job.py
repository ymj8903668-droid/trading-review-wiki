#!/usr/bin/env python3
import json
import urllib.request

REPO = "ymj8903668-droid/trading-review-wiki"
JOB_ID = "71942035194"

url = f"https://api.github.com/repos/{REPO}/actions/jobs/{JOB_ID}"
req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
with urllib.request.urlopen(req) as resp:
    d = json.loads(resp.read().decode("utf-8"))

for s in d.get("steps", []):
    print(f"  [{s['number']}] {s['name']}: {s['status']} -> {s.get('conclusion', '—')}")
