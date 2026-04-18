#!/usr/bin/env python3
import json
import urllib.request

REPO = "ymj8903668-droid/trading-review-wiki"
RUN_ID = "24601958443"

url = f"https://api.github.com/repos/{REPO}/actions/runs/{RUN_ID}/jobs"
req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
with urllib.request.urlopen(req) as resp:
    d = json.loads(resp.read().decode("utf-8"))

for j in d.get("jobs", []):
    print(f"{j['name']}: {j['status']} -> {j.get('conclusion', '—')}")
    if j.get("conclusion") == "failure":
        print(f"  FAILED STEP: {j.get('steps', [{}])[-1].get('name', 'unknown')}")
        print(f"  LOGS: {j.get('html_url', '')}")
