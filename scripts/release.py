#!/usr/bin/env python3
"""
Trading Review Wiki 一键发布脚本

用法:
  python scripts/release.py <version> [--message "变更简述"]

示例:
  python scripts/release.py 0.5.5 --message "修复切换工作区后旧数据残留的问题"

流程:
  1. 读取本地 GitHub PAT (~/.github_pat_trading_review_wiki)
  2. Bump 版本号 (package.json / tauri.conf.json / Cargo.toml)
  3. 可选：在 CHANGELOG.md 顶部插入新版本条目
  4. Git commit + tag + push
  5. 轮询 GitHub Actions 构建完成
  6. 自动更新 Release 为中文交易版本介绍
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error

REPO = "ymj8903668-droid/trading-review-wiki"
PAT_PATH = os.path.expanduser("~/.github_pat_trading_review_wiki")


def get_pat():
    try:
        with open(PAT_PATH, "r", encoding="utf-8") as f:
            return f.read().strip().lstrip("\ufeff")
    except FileNotFoundError:
        print(f"[错误] 找不到 GitHub PAT 文件: {PAT_PATH}")
        print("请把你的 GitHub Personal Access Token 写入该文件，例如:")
        print(f'  powershell -Command \'"your_pat_here" | Out-File -Encoding utf8 "{PAT_PATH}"\'')
        print(f"  或 bash: echo 'your_pat_here' > {PAT_PATH}")
        sys.exit(1)


def api_request(method, url, headers, body=None):
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json; charset=utf-8"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_cmd(cmd, cwd=None):
    print(f"[exec] {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[错误] 命令失败: {cmd}\n{result.stderr}")
        sys.exit(1)
    return result.stdout.strip()


def bump_version(project_root, version):
    files = {
        "package.json": (f'"version": "{version}"', r'"version":\s*"[^"]+"'),
        os.path.join("src-tauri", "tauri.conf.json"): (f'"version": "{version}"', r'"version":\s*"[^"]+"'),
        os.path.join("src-tauri", "Cargo.toml"): (f'version = "{version}"', r'version\s*=\s*"[^"]+"'),
    }
    for rel_path, (replacement, pattern) in files.items():
        path = os.path.join(project_root, rel_path)
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        new_content = re.sub(pattern, replacement, content, count=1)
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"[bump] {rel_path} -> {version}")


def update_changelog(project_root, version, message):
    path = os.path.join(project_root, "CHANGELOG.md")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    today = time.strftime("%Y-%m-%d")
    entry = f"""## v{version} — {today}

### 修复 / 更新

- {message}

---

"""
    # Insert after the first "---" separator
    if "---\n\n" in content:
        content = content.replace("---\n\n", "---\n\n" + entry, 1)
    else:
        content = content + "\n" + entry

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[changelog] 已添加 v{version} 条目")


def get_latest_actions_run(pat, tag):
    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    url = f"https://api.github.com/repos/{REPO}/actions/runs?event=push&branch={tag}"
    data = api_request("GET", url, headers)
    runs = data.get("workflow_runs", [])
    for run in runs:
        if run.get("path") == ".github/workflows/build.yml":
            return run
    return None


def wait_for_actions(pat, tag, timeout_minutes=30):
    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    print(f"[wait] 等待 GitHub Actions (tag={tag}) 构建完成...")
    start = time.time()
    run = None
    while time.time() - start < timeout_minutes * 60:
        run = get_latest_actions_run(pat, tag)
        if run:
            status = run.get("status")
            conclusion = run.get("conclusion") or "null"
            print(f"  [{int(time.time()-start)//60}m] status={status} conclusion={conclusion}")
            if status in ("completed", "failure", "cancelled"):
                return run
        else:
            print(f"  [{int(time.time()-start)//60}m] 尚未检测到 Actions 运行...")
        time.sleep(30)
    print("[错误] 等待超时，Actions 仍未完成")
    sys.exit(1)


def patch_release_body(pat, tag, version, message):
    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    # Find release
    url = f"https://api.github.com/repos/{REPO}/releases/tags/{tag}"
    try:
        release = api_request("GET", url, headers)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print("[warn] Release 尚未创建，可能是 Actions 构建失败或未配置自动发布")
            return
        raise

    release_id = release["id"]
    body = f"""> 专为交易者设计的 LLM 驱动知识库。自动沉淀策略、模式与进化，让你的交易理解复利增长。

## v{version} 交易复盘专用更新

- {message}

### 下载
- Windows 安装包：下方 Assets 中的 `.exe` 文件
- macOS（Apple Silicon）与 Linux 安装包：由 GitHub Actions 自动构建并上传至同一 Release
"""
    patch_url = f"https://api.github.com/repos/{REPO}/releases/{release_id}"
    api_request("PATCH", patch_url, headers, {"body": body})
    print(f"[release] 已更新 Release 文案: {release['html_url']}")


def main():
    parser = argparse.ArgumentParser(description="Trading Review Wiki 一键发布")
    parser.add_argument("version", help="版本号，例如 0.5.5")
    parser.add_argument("--message", "-m", default="日常更新与问题修复", help="CHANGELOG / Release 简述")
    args = parser.parse_args()

    version = args.version.lstrip("v")
    tag = f"v{version}"
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Validate project root
    if not os.path.isfile(os.path.join(project_root, "package.json")):
        print("[错误] 请确保在项目根目录内运行此脚本")
        sys.exit(1)

    pat = get_pat()

    # 1. Bump version
    bump_version(project_root, version)

    # 2. Update CHANGELOG
    update_changelog(project_root, version, args.message)

    # 3. Git commit + push
    run_cmd("git add -A", cwd=project_root)
    run_cmd(f'git commit -m "chore(release): bump version to {version}"', cwd=project_root)
    run_cmd("git push origin main", cwd=project_root)
    run_cmd(f"git tag {tag}", cwd=project_root)
    run_cmd(f"git push origin {tag}", cwd=project_root)
    print(f"[git] 已推送 tag {tag}")

    # 4. Wait for GitHub Actions
    run = wait_for_actions(pat, tag)
    conclusion = run.get("conclusion")
    if conclusion != "success":
        print(f"[警告] Actions 构建未成功 (conclusion={conclusion})")
        print(f"        查看日志: {run['html_url']}")
    else:
        print("[ok] Actions 构建成功")

    # 5. Patch release body
    patch_release_body(pat, tag, version, args.message)

    print(f"\n🎉 发布流程结束: https://github.com/{REPO}/releases/tag/{tag}")


if __name__ == "__main__":
    main()
