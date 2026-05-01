// ============================================================
// 1일 1비즈니스 — 비즈니스 단어 데이터
// ============================================================

window.WORDS = [
  { day: 1, word: "leverage", pos: "v.", meaning: "(자원·기회·관계 등을) 최대한 활용하다", phonetic: "/ˈlevərɪdʒ/", example: "We need to leverage our existing customer base to drive growth.", exampleKr: "우리 기존 고객 기반을 활용해서 성장을 만들어야 해요.", synonyms: ["utilize", "capitalize on", "exploit"], antonyms: ["waste", "neglect"], tags: ["미팅", "전략"] },
  { day: 2, word: "align", pos: "v.", meaning: "정렬시키다, 합의를 맞추다", phonetic: "/əˈlaɪn/", example: "Let's align on the priorities before the next sprint.", exampleKr: "다음 스프린트 전에 우선순위에 대해 합의를 맞춰봅시다.", synonyms: ["sync up", "coordinate", "agree"], antonyms: ["diverge", "conflict"], tags: ["미팅", "협업"] },
  { day: 3, word: "circle back", pos: "phr.", meaning: "다시 그 얘기로 돌아오다, 후속 논의하다", phonetic: "/ˈsɜːrkəl bæk/", example: "Let me circle back to you on that by Friday.", exampleKr: "그건 금요일까지 다시 회신드릴게요.", synonyms: ["follow up", "revisit", "get back to"], antonyms: ["drop", "ignore"], tags: ["메일", "미팅"] },
  { day: 4, word: "bandwidth", pos: "n.", meaning: "(업무) 처리 여력, 시간/에너지", phonetic: "/ˈbændwɪdθ/", example: "I don't have the bandwidth to take this on this week.", exampleKr: "이번 주에 이걸 맡을 여력이 없어요.", synonyms: ["capacity", "availability"], antonyms: ["overload"], tags: ["메신저", "협업"] },
  { day: 5, word: "scope", pos: "n./v.", meaning: "범위, 범위를 정하다", phonetic: "/skoʊp/", example: "Can we scope this down to just the MVP features?", exampleKr: "MVP 기능들로만 범위를 줄일 수 있을까요?", synonyms: ["range", "extent", "define"], antonyms: ["expand", "broaden"], tags: ["기획", "협상"] },
  { day: 6, word: "stakeholder", pos: "n.", meaning: "이해관계자", phonetic: "/ˈsteɪkˌhoʊldər/", example: "We should loop in the key stakeholders before deciding.", exampleKr: "결정 전에 핵심 이해관계자들을 끌어들여야 해요.", synonyms: ["interested party", "investor"], antonyms: ["bystander"], tags: ["미팅", "전략"] },
  { day: 7, word: "deliverable", pos: "n.", meaning: "산출물, 납품물", phonetic: "/dɪˈlɪvərəbl/", example: "What are the key deliverables for Q2?", exampleKr: "2분기 핵심 산출물이 뭔가요?", synonyms: ["output", "result"], antonyms: ["input"], tags: ["기획", "협상"] },
  { day: 8, word: "ramp up", pos: "phr.", meaning: "(생산·활동을) 늘리다, 본격화하다", phonetic: "/ræmp ʌp/", example: "We're ramping up hiring in the engineering team.", exampleKr: "엔지니어링 팀 채용을 본격화하고 있어요.", synonyms: ["scale up", "accelerate"], antonyms: ["wind down", "ramp down"], tags: ["전략", "협상"] },
  { day: 9, word: "low-hanging fruit", pos: "phr.", meaning: "쉽게 얻을 수 있는 성과", phonetic: "/loʊ ˈhæŋɪŋ fruːt/", example: "Let's start with the low-hanging fruit before tackling harder problems.", exampleKr: "어려운 문제 가기 전에 쉬운 것부터 잡아봅시다.", synonyms: ["quick win", "easy target"], antonyms: ["uphill battle"], tags: ["미팅", "전략"] },
  { day: 10, word: "touch base", pos: "phr.", meaning: "간단히 얘기하다, 잠깐 보다", phonetic: "/tʌtʃ beɪs/", example: "Let's touch base on Monday to review progress.", exampleKr: "월요일에 잠깐 진행상황 확인 한번 해요.", synonyms: ["check in", "catch up"], antonyms: ["lose touch"], tags: ["메일", "미팅"] },
  { day: 11, word: "due diligence", pos: "n.", meaning: "실사, 충분한 검토", phonetic: "/duː ˈdɪlɪdʒəns/", example: "We need to do our due diligence before signing the contract.", exampleKr: "계약 전에 충분한 검토가 필요해요.", synonyms: ["careful review", "vetting"], antonyms: ["negligence"], tags: ["협상", "법무"] },
  { day: 12, word: "pivot", pos: "v./n.", meaning: "(전략을) 전환하다", phonetic: "/ˈpɪvət/", example: "We decided to pivot from B2C to B2B last quarter.", exampleKr: "지난 분기에 B2C에서 B2B로 전환하기로 결정했어요.", synonyms: ["shift", "change direction"], antonyms: ["stick with", "maintain"], tags: ["전략"] },
  { day: 13, word: "actionable", pos: "adj.", meaning: "실행 가능한, 바로 행동에 옮길 수 있는", phonetic: "/ˈækʃənəbl/", example: "Can you give me actionable feedback on this draft?", exampleKr: "이 초안에 대해 바로 적용 가능한 피드백 주실 수 있을까요?", synonyms: ["practical", "doable"], antonyms: ["vague", "abstract"], tags: ["피드백", "메일"] },
  { day: 14, word: "ballpark", pos: "n./adj.", meaning: "대략적인 추정치", phonetic: "/ˈbɔːlpɑːrk/", example: "Can you give me a ballpark figure for the budget?", exampleKr: "예산 대략적인 숫자 좀 주실 수 있을까요?", synonyms: ["rough estimate", "approximation"], antonyms: ["exact figure"], tags: ["협상", "기획"] },
  { day: 15, word: "table", pos: "v.", meaning: "(논의를) 보류하다", phonetic: "/ˈteɪbl/", example: "Let's table this discussion until we have more data.", exampleKr: "데이터가 더 모일 때까지 이 논의는 일단 보류해요.", synonyms: ["postpone", "shelve"], antonyms: ["address", "tackle"], tags: ["미팅"] },
  { day: 16, word: "synergy", pos: "n.", meaning: "시너지, 상승효과", phonetic: "/ˈsɪnərdʒi/", example: "There's strong synergy between our two teams.", exampleKr: "우리 두 팀 사이에 시너지가 강해요.", synonyms: ["collaboration", "combined effect"], antonyms: ["conflict"], tags: ["협업", "전략"] },
  { day: 17, word: "headwind", pos: "n.", meaning: "역풍, 사업상 어려움", phonetic: "/ˈhedˌwɪnd/", example: "We're facing strong headwinds in the European market.", exampleKr: "유럽 시장에서 큰 어려움을 겪고 있어요.", synonyms: ["obstacle", "challenge"], antonyms: ["tailwind", "boost"], tags: ["전략"] },
  { day: 18, word: "iterate", pos: "v.", meaning: "반복 개선하다", phonetic: "/ˈɪtəreɪt/", example: "We'll iterate on the design based on user feedback.", exampleKr: "유저 피드백 기반으로 디자인을 계속 개선할 거예요.", synonyms: ["refine", "repeat"], antonyms: ["finalize"], tags: ["기획", "협업"] },
  { day: 19, word: "north star", pos: "n.", meaning: "핵심 지표, 방향성", phonetic: "/nɔːrθ stɑːr/", example: "User retention is our north star metric.", exampleKr: "유저 리텐션이 우리의 가장 중요한 지표예요.", synonyms: ["guiding principle", "key metric"], antonyms: ["distraction"], tags: ["전략"] },
  { day: 20, word: "off the top of my head", pos: "phr.", meaning: "지금 바로 떠오르는 대로", phonetic: "/ɔːf ðə tɑːp əv maɪ hed/", example: "Off the top of my head, I'd say around 30%.", exampleKr: "바로 떠오르는 대로 말하면, 한 30% 정도일 거예요.", synonyms: ["at first thought", "right now"], antonyms: ["after careful thought"], tags: ["미팅", "협상"] },
  { day: 21, word: "loop in", pos: "phr.", meaning: "(누구를) 논의에 포함시키다", phonetic: "/luːp ɪn/", example: "I'll loop in legal on this thread.", exampleKr: "이 메일에 법무팀 추가할게요.", synonyms: ["include", "cc"], antonyms: ["exclude"], tags: ["메일", "협업"] },
  { day: 22, word: "headcount", pos: "n.", meaning: "인원수, 정원", phonetic: "/ˈhedˌkaʊnt/", example: "We've approved additional headcount for Q3.", exampleKr: "3분기에 추가 인원을 승인받았어요.", synonyms: ["staff count", "personnel"], antonyms: [], tags: ["인사", "전략"] },
  { day: 23, word: "moving forward", pos: "phr.", meaning: "앞으로는, 향후", phonetic: "/ˈmuːvɪŋ ˈfɔːrwərd/", example: "Moving forward, all changes need approval.", exampleKr: "앞으로는 모든 변경사항이 승인을 받아야 해요.", synonyms: ["going forward", "from now on"], antonyms: ["previously"], tags: ["메일", "공지"] },
  { day: 24, word: "as per", pos: "phr.", meaning: "~에 따라", phonetic: "/æz pɜːr/", example: "As per our last conversation, I've attached the proposal.", exampleKr: "지난 대화에 따라 제안서 첨부드립니다.", synonyms: ["according to", "in line with"], antonyms: ["contrary to"], tags: ["메일"] },
  { day: 25, word: "drill down", pos: "phr.", meaning: "세부적으로 파고들다", phonetic: "/drɪl daʊn/", example: "Let's drill down into the Q1 numbers.", exampleKr: "1분기 숫자들을 좀 더 깊이 들여다봅시다.", synonyms: ["dig into", "examine closely"], antonyms: ["skim over"], tags: ["미팅", "분석"] },
  { day: 26, word: "EOD", pos: "abbr.", meaning: "End of Day, 업무 종료 시점", phonetic: "/iː oʊ diː/", example: "Please send the report by EOD.", exampleKr: "퇴근 전까지 보고서 보내주세요.", synonyms: ["end of business", "close of business"], antonyms: ["BOD"], tags: ["메일", "약어"] },
  { day: 27, word: "ASAP", pos: "abbr.", meaning: "최대한 빨리", phonetic: "/eɪ æs eɪ piː/", example: "Need your sign-off ASAP.", exampleKr: "최대한 빨리 승인 부탁드려요.", synonyms: ["right away", "urgently"], antonyms: ["whenever"], tags: ["메일", "약어"] },
  { day: 28, word: "FYI", pos: "abbr.", meaning: "참고로", phonetic: "/ef waɪ aɪ/", example: "FYI, the client just confirmed the timeline.", exampleKr: "참고로 클라이언트가 방금 일정 확정했어요.", synonyms: ["just so you know", "heads up"], antonyms: [], tags: ["메일", "약어"] },
  { day: 29, word: "no-brainer", pos: "n.", meaning: "고민할 필요도 없는 일", phonetic: "/noʊ ˈbreɪnər/", example: "Approving this budget is a no-brainer.", exampleKr: "이 예산 승인은 고민할 것도 없어요.", synonyms: ["obvious choice", "easy decision"], antonyms: ["dilemma"], tags: ["미팅", "협상"] },
  { day: 30, word: "ping", pos: "v.", meaning: "(메신저로) 짧게 연락하다", phonetic: "/pɪŋ/", example: "Ping me when you're free for a quick chat.", exampleKr: "잠깐 얘기 가능할 때 핑 주세요.", synonyms: ["message", "reach out"], antonyms: [], tags: ["메신저"] },
  { day: 31, word: "pushback", pos: "n.", meaning: "반발, 거부 의사", phonetic: "/ˈpʊʃbæk/", example: "We got some pushback from the engineering team.", exampleKr: "엔지니어링 팀에서 반발이 좀 있었어요.", synonyms: ["resistance", "objection"], antonyms: ["agreement"], tags: ["협상", "협업"] },
  { day: 32, word: "buy-in", pos: "n.", meaning: "동의, 지지", phonetic: "/ˈbaɪ ɪn/", example: "We need exec buy-in before we can ship.", exampleKr: "출시 전에 임원진 동의가 필요해요.", synonyms: ["approval", "support"], antonyms: ["opposition"], tags: ["협상", "전략"] }
];

// ============================================================
// 공지사항 (유버디로부터 온 메일)
// ============================================================
window.NOTICES = [
  {
    id: 1,
    from: "유버디",
    fromHandle: "@youbuddy",
    subject: "🎉 1일1비 6기 오픈 — 단어 30개 + 시험 페이지가 준비됐어요",
    preview: "안녕하세요, 매일 비즈니스 단어 1개씩 배우는 여정에 오신 걸 환영해요...",
    body: "안녕하세요! 매일 비즈니스 단어 한 개씩 도착하는 1일1비에 오신 걸 환영해요.\n\n오전 8시에 단어 카드가 도착하고, 학습 표시 후 누적 단어장에 자동으로 쌓여요. 월말엔 누적 단어로 랜덤 시험을 풀 수 있어요.\n\n오늘 첫 단어, 잊지 말고 학습 표시해주세요!",
    date: "2026-04-29",
    unread: true,
    pinned: true
  },
  {
    id: 2,
    from: "유버디",
    fromHandle: "@youbuddy",
    subject: "🔔 알림 설정해두시면 매일 단어 놓치지 않아요",
    preview: "오전 8시 단어 도착 알림, 켜두시면 스트릭 안 끊겨요...",
    body: "단어가 도착하는 시간 (기본 오전 8시) 에 알림을 받으실 수 있어요.\n\n마이페이지 → 알림 설정에서 켜두시면 됩니다. 스트릭 끊기는 사람들 중 90%가 알림 안 켜둔 분들이에요. 😅",
    date: "2026-04-28",
    unread: true,
    pinned: false
  },
  {
    id: 3,
    from: "유버디",
    fromHandle: "@youbuddy",
    subject: "📚 누적 단어 50개 돌파 시 — Notion 백업 PDF 보내드려요",
    preview: "누적 50개 달성한 분들께는 Notion에 바로 붙여넣을 수 있는 백업 PDF를...",
    body: "누적 단어 50개를 달성하시면 Notion에 바로 붙여넣을 수 있게 정리된 백업 PDF를 보내드려요.\n\n월말 시험 점수도 함께 첨부됩니다.",
    date: "2026-04-22",
    unread: false,
    pinned: false
  },
  {
    id: 4,
    from: "유버디",
    fromHandle: "@youbuddy",
    subject: "💬 단어 추천받습니다 — 실무에서 자주 보는 표현 있다면",
    preview: "여러분이 매일 만나는 비즈니스 표현, 추천해주시면 다음 시즌에 반영해요...",
    body: "여러분이 실제로 메일·미팅·메신저에서 자주 만나는 표현이 있다면 DM으로 알려주세요!\n\n다음 시즌 단어 큐레이션에 반영합니다.",
    date: "2026-04-15",
    unread: false,
    pinned: false
  }
];

// ============================================================
// 사용자 상태 (Day 14 차 구독자)
// ============================================================
window.USER_STATE = {
  name: "민지",
  email: "minji@example.com",
  subscribedAt: "2026-04-16",
  currentDay: 14,        // 오늘이 14일차
  savedPoints: 0,        // 일시중지 누적 일수
  streak: 12,            // 12일 연속
  studied: [1,2,3,4,5,6,7,8,9,10,11,12], // 1~12 학습 완료
  unstudied: [13],       // 13은 어제 거 미학습
  // 14는 오늘의 단어 (아직 도달 X)
  testHistory: [
    { date: "2026-04-25", score: 8, total: 10 }
  ],
  notificationsEnabled: false,
  subscriptionStatus: "active" // active | paused
};
