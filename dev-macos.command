#!/bin/zsh
set -u

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"

if [ ! -x "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ]; then
  echo "首次运行：安装依赖和 Electron 运行时..."
  if ! npx --yes pnpm@8.15.9 install; then
    echo
    echo "依赖安装失败。"
    read -k 1 "?按任意键关闭..."
    exit 1
  fi
fi

echo "启动 GeekGeekRun Dev"
echo "隔离配置目录：$HOME/.geekgeekrun-dev"
echo "关闭窗口或在终端按 Ctrl+C 可停止。"
echo

npx --yes pnpm@8.15.9 --dir packages/ui run dev:isolated
STATUS=$?

if [ "$STATUS" -ne 0 ] && [ "$STATUS" -ne 130 ]; then
  echo
  echo "启动失败，退出码：$STATUS"
  read -k 1 "?按任意键关闭..."
fi

exit "$STATUS"
