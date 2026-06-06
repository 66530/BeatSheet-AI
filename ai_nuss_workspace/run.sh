#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# AI-NUSS 3.0 — Linux/macOS 一键启动脚本
# 用法: chmod +x run.sh && ./run.sh
# ═══════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 Python
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
    echo "[ERROR] 未找到 Python，请先安装 Python 3.11+"
    exit 1
fi

PYTHON=$(command -v python3 || command -v python)

# 运行启动器
exec "$PYTHON" run.py "$@"
