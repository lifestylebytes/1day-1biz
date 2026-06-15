#!/usr/bin/env bash
# mentor-feedback Edge Function 로컬 미리보기 테스트
#
# 사용법:
#   (A) 로컬 serve 대상:
#       탭1:  supabase functions serve mentor-feedback --env-file supabase/.env --no-verify-jwt
#       탭2:  bash scripts/test-mentor-feedback.sh
#   (B) 배포된 staging 함수 대상 (도커 불필요):
#       FN_URL=https://ssjzwnmqywopocpnvjvw.supabase.co/functions/v1/mentor-feedback-staging \
#       ANON_KEY=sb_publishable_Ss_I1IWW-FZbqzOjxfHxCA_5a-94ngG \
#       bash scripts/test-mentor-feedback.sh
#
# 핵심 확인 포인트: "맞는 문장(case 1)"에도 fix에 업그레이드가 나오는가.

URL="${FN_URL:-http://localhost:54321/functions/v1/mentor-feedback}"
ANON_KEY="${ANON_KEY:-}"

call() {
  local label="$1"; local sentence="$2"
  echo ""
  echo "==================================================="
  echo "[$label]  문장: $sentence"
  echo "---------------------------------------------------"
  curl -s -X POST "$URL" \
    ${ANON_KEY:+-H "Authorization: Bearer $ANON_KEY"} \
    -H "Content-Type: application/json" \
    -d "{
      \"sentence\": \"$sentence\",
      \"word\": \"circle back\",
      \"meaning\": \"나중에 다시 논의하다\",
      \"scene\": \"회의 중 시간이 부족해 한 안건을 뒤로 미루는 상황.\",
      \"sampleAnswer\": \"Let's circle back on this after the standup.\",
      \"mentorName\": \"김주연\"
    }" | python3 -m json.tool 2>/dev/null || echo "(응답 파싱 실패. serve가 떠 있는지, 키가 맞는지 확인)"
}

# 1) 문법은 맞지만 평범한 문장 → 업그레이드가 나와야 통과 (혜인님 케이스)
call "맞지만 평범" "Let's circle back on this later."

# 2) 단어를 안 쓴 문장 → 단어 살리라는 코칭
call "단어 누락" "We can talk about this again tomorrow."

# 3) 살짝 어색한 문장 → 구체적 대조 교정
call "어색함" "Let's circle back this on after meeting."

echo ""
echo "==================================================="
echo "확인: case 1(맞지만 평범)에도 fix에 더 자연스러운 버전이 보이면 의도대로 작동."
