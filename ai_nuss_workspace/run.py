#!/usr/bin/env python3
"""
AI-NUSS 3.0 — 一键启动脚本 (One-Click Launcher)
================================================
自动完成环境检测 → 依赖安装 → 后端启动 → 前端启动 → 浏览器打开

用法:
    python run.py              # 完整启动 (后端 + 前端)
    python run.py --backend    # 仅启动后端
    python run.py --frontend   # 仅启动前端
    python run.py --install    # 仅安装依赖
    python run.py --stop       # 停止所有服务
"""

import os
import sys
import time
import signal
import socket
import subprocess
import argparse
import webbrowser
from pathlib import Path

# === Windows 终端 UTF-8 编码修复 ===
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ═══════════════════════════════════════════════════════════
# 配置
# ═══════════════════════════════════════════════════════════

ROOT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = ROOT_DIR / "ai_nuss_backend"
FRONTEND_DIR = ROOT_DIR / "ai_nuss_frontend"

BACKEND_PORT = 8000
FRONTEND_PORT = 3000
FRONTEND_URL = f"http://localhost:{FRONTEND_PORT}"
BACKEND_URL = f"http://localhost:{BACKEND_PORT}"

# 存储子进程以便优雅关闭
_processes: list[subprocess.Popen] = []


# ═══════════════════════════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════════════════════════

def print_banner():
    """打印启动横幅"""
    banner = r"""
    ╔══════════════════════════════════════════════════════╗
    ║                                                      ║
    ║     🎬  AI-NUSS 3.0  Director Console               ║
    ║     Novel → Screenplay Adaptation Engine             ║
    ║                                                      ║
    ║     Backend:  http://localhost:8000                  ║
    ║     Frontend: http://localhost:3000                  ║
    ║     API Docs: http://localhost:8000/docs             ║
    ║                                                      ║
    ╚══════════════════════════════════════════════════════╝
    """
    print(banner)


def print_step(step: str, emoji: str = "📌"):
    """打印步骤标题"""
    print(f"\n{emoji} {'='*50}")
    print(f"{emoji}  {step}")
    print(f"{emoji} {'='*50}")


def print_ok(msg: str):
    print(f"  ✅ {msg}")


def print_err(msg: str):
    print(f"  ❌ {msg}")


def print_warn(msg: str):
    print(f"  ⚠️  {msg}")


def is_port_in_use(port: int) -> bool:
    """检查端口是否被占用"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex(("127.0.0.1", port)) == 0
    except Exception:
        return False


def find_executable(name: str) -> str | None:
    """在 PATH 中查找可执行文件"""
    import shutil
    path = shutil.which(name)
    if path:
        return path
    # Windows 常见路径
    if sys.platform == "win32":
        for base in [os.environ.get("LOCALAPPDATA", ""), os.environ.get("APPDATA", ""),
                     r"C:\Program Files", r"C:\Program Files (x86)"]:
            for root, dirs, _ in os.walk(base):
                for d in dirs:
                    if d.lower() == name.lower() or d.lower().startswith(name.lower()):
                        return str(Path(root) / d)
    return None


def run_subprocess(cmd: list[str], cwd: Path, name: str) -> subprocess.Popen | None:
    """启动子进程并注册到全局列表"""
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        _processes.append(proc)
        print_ok(f"{name} 启动成功 (PID: {proc.pid})")
        return proc
    except Exception as e:
        print_err(f"{name} 启动失败: {e}")
        return None


def wait_for_port(port: int, timeout: int = 30) -> bool:
    """等待端口就绪"""
    for i in range(timeout):
        if is_port_in_use(port):
            return True
        time.sleep(0.5)
        if i % 4 == 0:
            print(f"    等待端口 {port} 就绪...")
    return False


# ═══════════════════════════════════════════════════════════
# 环境检测
# ═══════════════════════════════════════════════════════════

def check_prerequisites() -> bool:
    """检测必要运行环境"""
    print_step("环境检测", "🔍")
    all_ok = True

    # Python
    python_ver = sys.version_info
    print_ok(f"Python {python_ver.major}.{python_ver.minor}.{python_ver.micro}")

    node_cmd = "node.exe" if sys.platform == "win32" else "node"
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

    # Node.js
    try:
        result = subprocess.run(
            [node_cmd, "--version"], capture_output=True, text=True, timeout=5,
            shell=(sys.platform == "win32"),
        )
        node_ver = result.stdout.strip()
        print_ok(f"Node.js {node_ver}")
    except Exception:
        print_err("Node.js 未安装 — 前端无法启动")
        all_ok = False

    # npm
    try:
        result = subprocess.run(
            [npm_cmd, "--version"], capture_output=True, text=True, timeout=5,
            shell=(sys.platform == "win32"),
        )
        npm_ver = result.stdout.strip()
        print_ok(f"npm v{npm_ver}")
    except Exception:
        print_err("npm 未安装")
        all_ok = False

    # pip
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "--version"],
            capture_output=True, text=True, timeout=5,
        )
        print_ok(f"pip 可用")
    except Exception:
        print_err("pip 不可用")
        all_ok = False

    return all_ok


# ═══════════════════════════════════════════════════════════
# 依赖安装
# ═══════════════════════════════════════════════════════════

def install_backend_deps():
    """安装后端 Python 依赖"""
    print_step("安装后端依赖", "📦")
    req_path = BACKEND_DIR / "requirements.txt"

    if not req_path.exists():
        print_err(f"未找到 {req_path}")
        return False

    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(req_path), "-q"],
            cwd=str(BACKEND_DIR),
            check=True,
            timeout=120,
        )
        print_ok("后端依赖安装完成")
        return True
    except subprocess.CalledProcessError as e:
        print_err(f"后端依赖安装失败: {e}")
        return False
    except subprocess.TimeoutExpired:
        print_err("依赖安装超时")
        return False


def install_frontend_deps():
    """安装前端 npm 依赖"""
    print_step("安装前端依赖", "📦")
    package_path = FRONTEND_DIR / "package.json"

    if not package_path.exists():
        print_err(f"未找到 {package_path}")
        return False

    # Windows 下 npm 可能是 npm.cmd
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    try:
        subprocess.run(
            [npm_cmd, "install", "--legacy-peer-deps"],
            cwd=str(FRONTEND_DIR),
            check=True,
            timeout=180,
            shell=(sys.platform == "win32"),
        )
        print_ok("前端依赖安装完成")
        return True
    except subprocess.CalledProcessError as e:
        print_err(f"前端依赖安装失败: {e}")
        return False
    except subprocess.TimeoutExpired:
        print_err("依赖安装超时")
        return False


# ═══════════════════════════════════════════════════════════
# 服务启动
# ═══════════════════════════════════════════════════════════

def start_backend() -> bool:
    """启动 FastAPI 后端"""
    print_step("启动后端服务 (FastAPI + LangGraph)", "🚀")

    if is_port_in_use(BACKEND_PORT):
        print_warn(f"端口 {BACKEND_PORT} 已被占用，尝试复用已有服务...")
        # 测试已有服务是否响应
        import urllib.request
        try:
            resp = urllib.request.urlopen(f"http://127.0.0.1:{BACKEND_PORT}/health", timeout=3)
            if resp.status == 200:
                print_ok(f"后端已在运行 → {BACKEND_URL}/health")
                return True
        except Exception:
            print_err(f"端口 {BACKEND_PORT} 被占用但服务无响应，请手动释放端口")
            return False

    proc = run_subprocess(
        [
            sys.executable, "-m", "uvicorn",
            "app.main:app",
            "--host", "0.0.0.0",
            "--port", str(BACKEND_PORT),
            "--log-level", "info",
        ],
        cwd=BACKEND_DIR,
        name="AI-NUSS Backend",
    )

    if proc is None:
        return False

    # 等待后端就绪
    if wait_for_port(BACKEND_PORT, timeout=20):
        print_ok(f"后端就绪 → {BACKEND_URL}")
        print_ok(f"健康检查 → {BACKEND_URL}/health")
        print_ok(f"API 文档 → {BACKEND_URL}/docs")
        return True
    else:
        print_err(f"后端启动超时 (端口 {BACKEND_PORT} 未就绪)")
        return False


def start_frontend() -> bool:
    """启动 Next.js 前端"""
    print_step("启动前端服务 (Next.js Director Console)", "🎨")

    if is_port_in_use(FRONTEND_PORT):
        print_warn(f"端口 {FRONTEND_PORT} 已被占用，尝试复用已有服务...")
        import urllib.request
        try:
            resp = urllib.request.urlopen(f"http://127.0.0.1:{FRONTEND_PORT}", timeout=3)
            if resp.status == 200:
                print_ok(f"前端已在运行 → {FRONTEND_URL}")
                return True
        except Exception:
            print_err(f"端口 {FRONTEND_PORT} 被占用但服务无响应，请手动释放端口")
            return False

    npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"
    proc = run_subprocess(
        [npx_cmd, "next", "dev", "-p", str(FRONTEND_PORT)],
        cwd=FRONTEND_DIR,
        name="AI-NUSS Frontend",
    )

    if proc is None:
        return False

    # Next.js 首次启动较慢
    if wait_for_port(FRONTEND_PORT, timeout=60):
        print_ok(f"前端就绪 → {FRONTEND_URL}")
        return True
    else:
        print_err(f"前端启动超时 (端口 {FRONTEND_PORT} 未就绪)")
        return False


# ═══════════════════════════════════════════════════════════
# 完整启动流程
# ═══════════════════════════════════════════════════════════

def run_full(args):
    """完整一键启动"""
    print_banner()

    # 1. 环境检测
    env_ok = check_prerequisites()
    if not env_ok:
        print_warn("部分环境缺失，将尝试继续...")

    # 2. 依赖安装
    if not args.skip_install:
        if not install_backend_deps():
            print_err("后端依赖安装失败，终止启动")
            return 1
        if not install_frontend_deps():
            print_warn("前端依赖安装失败，仅启动后端")

    # 3. 启动后端
    if args.backend or args.all:
        if not start_backend():
            print_err("后端启动失败")
            return 1

    # 4. 启动前端
    if args.frontend or args.all:
        if not start_frontend():
            print_warn("前端启动失败，仅后端可用")

    # 5. 打开浏览器
    if args.open and (args.frontend or args.all):
        print_step("打开导演工作台", "🌐")
        webbrowser.open(FRONTEND_URL)
        print_ok(f"浏览器已打开 → {FRONTEND_URL}")

    # 6. 显示状态
    print_step("系统运行中", "✨")
    print(f"""
  ┌─────────────────────────────────────────────────────┐
  │  后端 API     http://localhost:{BACKEND_PORT}                  │
  │  健康检查     http://localhost:{BACKEND_PORT}/health            │
  │  API 文档     http://localhost:{BACKEND_PORT}/docs              │
  │  前端界面     http://localhost:{FRONTEND_PORT}                  │
  │                                                     │
  │  按 Ctrl+C 停止所有服务                              │
  └─────────────────────────────────────────────────────┘
""")

    # 7. 等待子进程
    try:
        while _processes:
            for proc in _processes[:]:
                ret = proc.poll()
                if ret is not None:
                    print_warn(f"进程 PID={proc.pid} 已退出 (code={ret})")
                    _processes.remove(proc)
            if not _processes:
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n")
        print_step("正在停止所有服务...", "🛑")
        cleanup()
        print_ok("所有服务已停止。再见！👋")

    return 0


def run_backend_only(args):
    """仅启动后端"""
    if not args.skip_install:
        install_backend_deps()
    start_backend()

    print_step("后端运行中 (按 Ctrl+C 停止)", "✨")
    try:
        while _processes:
            for proc in _processes[:]:
                if proc.poll() is not None:
                    _processes.remove(proc)
            time.sleep(1)
    except KeyboardInterrupt:
        cleanup()

    return 0


def run_frontend_only(args):
    """仅启动前端"""
    if not args.skip_install:
        install_frontend_deps()
    start_frontend()

    print_step("前端运行中 (按 Ctrl+C 停止)", "✨")
    try:
        while _processes:
            for proc in _processes[:]:
                if proc.poll() is not None:
                    _processes.remove(proc)
            time.sleep(1)
    except KeyboardInterrupt:
        cleanup()

    return 0


def run_install_only(args):
    """仅安装依赖"""
    print_banner()
    print_step("安装所有依赖", "📦")
    install_backend_deps()
    install_frontend_deps()
    print_step("依赖安装完成", "✅")
    return 0


def cleanup():
    """优雅关闭所有子进程"""
    for proc in _processes:
        try:
            if sys.platform == "win32":
                proc.terminate()
            else:
                proc.send_signal(signal.SIGTERM)
        except Exception:
            pass

    # 等待子进程退出
    for proc in _processes:
        try:
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    _processes.clear()


# ═══════════════════════════════════════════════════════════
# 入口
# ═══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="AI-NUSS 3.0 一键启动脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python run.py                 # 启动全部 (后端 + 前端)
  python run.py --backend       # 仅启动后端
  python run.py --frontend      # 仅启动前端
  python run.py --install       # 仅安装依赖
  python run.py --no-open       # 启动但不自动打开浏览器
        """,
    )

    parser.add_argument(
        "--backend", action="store_true",
        help="仅启动后端 FastAPI 服务"
    )
    parser.add_argument(
        "--frontend", action="store_true",
        help="仅启动前端 Next.js 服务"
    )
    parser.add_argument(
        "--install", action="store_true",
        help="仅安装依赖，不启动服务"
    )
    parser.add_argument(
        "--skip-install", action="store_true",
        help="跳过依赖安装步骤"
    )
    parser.add_argument(
        "--no-open", action="store_true",
        help="不自动打开浏览器"
    )

    args = parser.parse_args()

    # 推断模式
    if args.install:
        args.all = False
        args.backend = False
        args.frontend = False
    elif args.backend and not args.frontend:
        args.all = False
    elif args.frontend and not args.backend:
        args.all = False
    else:
        args.all = True
        args.backend = True
        args.frontend = True

    args.open = not args.no_open

    # 路由到对应处理函数
    if args.install:
        return run_install_only(args)
    elif args.backend and not args.frontend:
        return run_backend_only(args)
    elif args.frontend and not args.backend:
        return run_frontend_only(args)
    else:
        return run_full(args)


if __name__ == "__main__":
    sys.exit(main())
