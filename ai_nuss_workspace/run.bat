@echo off
chcp 65001 >nul 2>&1
title AI-NUSS 3.0 Director Console

:: ═══════════════════════════════════════════════════════════
:: AI-NUSS 3.0 — Windows 一键启动脚本
:: 双击此文件即可启动完整系统
:: ═══════════════════════════════════════════════════════════

cd /d "%~dp0"

:: 检查 Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 未找到 Python，请先安装 Python 3.11+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: 运行启动器
python run.py %*

:: 如果异常退出则暂停
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] 启动失败，请检查上面的错误信息
    pause
)
