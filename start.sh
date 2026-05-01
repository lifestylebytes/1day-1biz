#!/bin/bash
# 1일1비 로컬 개발 서버
# 사용법: ./start.sh  (또는 더블클릭)

cd "$(dirname "$0")"

PORT=8080

# 이미 떠있는 서버 정리
if lsof -ti:$PORT > /dev/null 2>&1; then
  echo "⚠️  포트 $PORT 사용 중. 기존 프로세스 종료..."
  lsof -ti:$PORT | xargs kill -9 2>/dev/null
  sleep 1
fi

echo ""
echo "🏢  1일1비 로컬 서버 시작"
echo "─────────────────────────────"
echo "📂  $(pwd)"
echo "🌐  http://localhost:$PORT"
echo "🛑  중지: Ctrl+C"
echo ""

# 자동으로 브라우저 열기 (macOS)
(sleep 1 && open "http://localhost:$PORT") &

# Python 3 우선, 없으면 안내
if command -v python3 &> /dev/null; then
  python3 -m http.server $PORT
elif command -v python &> /dev/null; then
  python -m SimpleHTTPServer $PORT
else
  echo "❌ python이 설치돼있지 않아. 다음 중 하나로 설치:"
  echo "   - brew install python3"
  echo "   - 또는 https://python.org 에서 다운로드"
  exit 1
fi
