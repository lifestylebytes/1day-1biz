/* global window */
// ============================================================
// 1일1비, 신입 출근 시뮬레이터 데이터
// ============================================================

// 등장 인물
const CHARACTERS = {
  buddy: { id: "buddy", name: "유버디", role: "내 버디 · 글로벌 코치", avatar: "🤝", color: "#D85A2A", note: "유버디 본사가 붙여준 1:1 글로벌 버디. 모를 때 부담 없이 톡톡 물어볼 수 있는 '한 발 앞서간 동료'. 매일 한 마디씩 응원과 팁을 주는 사람." },
  mentor: { id: "mentor", name: "차윤아", role: "사수 · 5년차 시니어", avatar: "차", color: "#E8743C", note: "따뜻하지만 디테일에 깐깐. 매일 아침 노란 포스트잇으로 단어를 알려줌." },
  manager: { id: "manager", name: "김 팀장", role: "팀장", avatar: "김", color: "#3A4A5C", note: "건조함. 회의 30초 전 호출이 특기." },
  daniel: { id: "daniel", name: "Daniel Park", role: "런던 본사 · Director", avatar: "D", color: "#4A7C59", note: "영국식 영어. 메일 답장이 빠름." },
  sarah: { id: "sarah", name: "Sarah Chen", role: "美 클라이언트 · VP", avatar: "S", color: "#6E3F6E", note: "미국식. 캐주얼하지만 숫자에 예리." },
  park: { id: "park", name: "박 대리", role: "동기 · 옆자리", avatar: "박", color: "#B89968", note: "번역 부탁이 잦음. 점심 메이트." },
  hr: { id: "hr", name: "인사팀", role: "12F", avatar: "HR", color: "#8A8579", note: "공지 발송 담당." },
};

// 단어 + 시추에이션 (Day 1 ~ 14는 학습 완료 / 15가 오늘)
const SCENARIOS = [
  { day: 1, word: "stakeholder", pos: "n.", meaning: "이해관계자", phonetic: "/ˈsteɪkˌhoʊldər/",
    scene: "월요일 09:30, 입사 첫 회의실. 김 팀장이 화이트보드에 도식을 그리며.",
    npc: "manager", quote: "이번 프로젝트 stakeholder map 부터 정리해보자. 누가 누구지?",
    youDo: "회의 끝나고 사수에게 'stakeholder가 정확히 뭔가요'라고 물어봤다.",
    mentorTip: "주주, 클라이언트, 내부 부서까지, 이 일에 영향을 주거나 받는 사람 전부야. 한 단어가 회의 절반을 정리해줘.",
    sampleAnswer: "I'll map out the key stakeholders by tomorrow morning.", tags: ["meeting", "project"], status: "studied" },
  { day: 2, word: "deadline", pos: "n.", meaning: "마감 기한", phonetic: "/ˈdedlaɪn/",
    scene: "화요일 18:40, 김 팀장이 자리로 와서.", npc: "manager",
    quote: "Daniel한테 deadline 다시 한번 confirm 좀.",
    youDo: "Daniel에게 슬랙으로 마감일 재확인 메시지를 보냈다.",
    mentorTip: "deadline은 진짜 '죽는 선'이라는 어원. due date보다 무거운 뉘앙스라 협상이 어려워.",
    sampleAnswer: "Just to confirm, the deadline for the draft is this Friday EOD?", tags: ["email", "schedule"], status: "studied" },
  { day: 3, word: "follow up", pos: "phr.", meaning: "후속 조치하다", phonetic: "/ˈfɑloʊ ʌp/",
    scene: "수요일 11:00, 사수가 지나가며.", npc: "mentor",
    quote: "어제 미팅 follow up 메일 보냈어?",
    youDo: "회의 액션 아이템을 정리해 참석자 전원에게 메일을 보냈다.",
    mentorTip: "회의가 끝나면 24시간 내 follow up. 이거 한 번만 챙겨도 신뢰가 달라져.",
    sampleAnswer: "Following up on yesterday's call, here are the action items.", tags: ["email", "meeting"], status: "studied" },
  { day: 4, word: "ASAP", pos: "abbr.", meaning: "최대한 빨리", phonetic: "/ˌeɪ ɛs eɪ ˈpi/",
    scene: "목요일 16:00, Sarah로부터 슬랙.", npc: "sarah",
    quote: "Need the revised numbers ASAP, board meeting tomorrow.",
    youDo: "수치 다시 검토해서 1시간 안에 회신했다.",
    mentorTip: "ASAP는 강한 표현이야. 우리가 쓸 땐 'by EOD' 같은 구체적 시간이 더 프로페셔널해.",
    sampleAnswer: "Sending the revised numbers within the hour.", tags: ["urgent", "client"], status: "studied" },
  { day: 5, word: "circle back", pos: "phr.", meaning: "(나중에) 다시 얘기하다", phonetic: "/ˈsɝkəl bæk/",
    scene: "금요일 14:00, 회의 중 시간이 부족.", npc: "daniel",
    quote: "Let's circle back on this next week, running short on time.",
    youDo: "다음 주 화요일로 follow-up 미팅을 잡았다.",
    mentorTip: "회의를 자연스럽게 끊을 때 쓰는 마법의 표현. 한국말로 '이건 다음에' 보다 부드러워.",
    sampleAnswer: "Sounds good, I'll set up a follow-up for next Tuesday.", tags: ["meeting", "schedule"], status: "studied" },
  { day: 6, word: "loop in", pos: "phr.", meaning: "(메일/대화에) 포함시키다", phonetic: "/luːp ɪn/",
    scene: "월요일 10:00, 박 대리가 옆자리에서.", npc: "park",
    quote: "이 건 디자인팀도 loop in 해야 할 것 같은데?",
    youDo: "디자인팀 리드를 cc에 추가해 메일을 다시 보냈다.",
    mentorTip: "정보 공유의 동사. cc보다 '동참시킨다'는 뉘앙스가 강해서 협업할 때 자주 써.",
    sampleAnswer: "Looping in @design-lead, could you weigh in on this?", tags: ["email", "team"], status: "studied" },
  { day: 7, word: "deliverable", pos: "n.", meaning: "산출물, 납품물", phonetic: "/dɪˈlɪvərəbl/",
    scene: "화요일 09:30, 분기 리뷰 회의.", npc: "manager",
    quote: "이번 분기 핵심 deliverable 3개만 정리해보자.",
    youDo: "팀의 핵심 산출물을 노션에 정리해 공유했다.",
    mentorTip: "'결과물' 보다 '약속한 산출물' 의 무게가 있어. 계약/프로젝트에서 자주 봐.",
    sampleAnswer: "The three key deliverables for Q2 are the report, prototype, and rollout plan.", tags: ["project", "meeting"], status: "studied" },
  { day: 8, word: "ramp up", pos: "phr.", meaning: "(생산·활동을) 늘리다", phonetic: "/ræmp ʌp/",
    scene: "수요일 11:30, 채용 회의.", npc: "manager",
    quote: "엔지니어링팀 ramp up 일정이 어떻게 돼?",
    youDo: "채용 일정과 온보딩 계획을 한 페이지로 정리해 공유했다.",
    mentorTip: "조직/생산을 단계적으로 늘리는 뉘앙스. 갑자기 크게 늘릴 땐 'scale up' 이 더 자연스러워.",
    sampleAnswer: "We're ramping up engineering hires from May through July.", tags: ["hr", "team"], status: "studied" },
  { day: 9, word: "low-hanging fruit", pos: "phr.", meaning: "쉽게 얻을 수 있는 성과", phonetic: "/loʊ ˈhæŋɪŋ fruːt/",
    scene: "목요일 15:00, 전략 워크숍.", npc: "daniel",
    quote: "Let's start with the low-hanging fruit before the heavy lifting.",
    youDo: "당장 실행 가능한 3개 액션을 따로 빼서 to-do 리스트로 만들었다.",
    mentorTip: "'쉬운 거 먼저', 회의에서 우선순위 정할 때 거의 매번 등장.",
    sampleAnswer: "I've pulled out three low-hanging fruit we can ship this week.", tags: ["strategy", "priority"], status: "studied" },
  { day: 10, word: "touch base", pos: "phr.", meaning: "잠깐 얘기하다, 안부 묻다", phonetic: "/tʌtʃ beɪs/",
    scene: "금요일 17:00, 사수가 캘린더 초대를 보냄.", npc: "mentor",
    quote: "월요일 15분만 touch base 하자. 진행 상황 듣고 싶어.",
    youDo: "월요일까지 진행 상황을 한 페이지로 정리해뒀다.",
    mentorTip: "야구의 '베이스 터치' 에서 옴. 가볍게 점검하는 짧은 미팅을 잡을 때 부담 없이 써.",
    sampleAnswer: "Sure, let's touch base Monday at 3, I'll have an update ready.", tags: ["meeting", "schedule"], status: "studied" },
  { day: 11, word: "due diligence", pos: "n.", meaning: "실사, 충분한 검토", phonetic: "/duː ˈdɪlɪdʒəns/",
    scene: "월요일 14:00, M&A 검토 회의.", npc: "manager",
    quote: "due diligence 끝나기 전엔 사인 못 해. 이번 주 안에 마무리.",
    youDo: "재무·법무·운영 체크리스트를 만들어 분담했다.",
    mentorTip: "법률·재무 검토 전부. 이 한 단어가 며칠치 일을 함축해.",
    sampleAnswer: "Due diligence will wrap by Thursday, we'll review findings Friday.", tags: ["legal", "deal"], status: "studied" },
  { day: 12, word: "pivot", pos: "v./n.", meaning: "(전략을) 전환하다", phonetic: "/ˈpɪvət/",
    scene: "화요일 16:00, 임원 보고.", npc: "daniel",
    quote: "Numbers aren't there. We may need to pivot.",
    youDo: "B2C → B2B 전환 시나리오를 1페이지로 그려봤다.",
    mentorTip: "스타트업 용어가 일반 비즈니스로 넘어온 사례. '방향 자체를 트는' 뉘앙스라 작은 변경엔 안 써.",
    sampleAnswer: "If conversion stays flat, we should consider a pivot to B2B.", tags: ["strategy", "exec"], status: "studied" },
  { day: 13, word: "actionable", pos: "adj.", meaning: "실행 가능한, 바로 할 수 있는", phonetic: "/ˈækʃənəbl/",
    scene: "수요일 11:00, 사수가 초안 리뷰.", npc: "mentor",
    quote: "피드백은 좋은데, 좀 더 actionable 하게 정리해줄래?",
    youDo: "추상적인 조언을 '담당자/기한/액션' 3열 표로 다시 썼다.",
    mentorTip: "'그래서 뭐 해?' 라는 질문에 답이 되면 actionable. 보고서의 마지막 페이지에 꼭 들어가야 해.",
    sampleAnswer: "Here are three actionable items, owner and deadline included.", tags: ["report", "feedback"], status: "studied" },
  { day: 14, word: "ballpark", pos: "n./adj.", meaning: "대략적인 추정치", phonetic: "/ˈbɔːlpɑːrk/",
    scene: "목요일 13:30, Sarah와 통화.", npc: "sarah",
    quote: "Just a ballpark, what are we looking at, budget-wise?",
    youDo: "정확한 수치 대신 '500만~700만원 범위' 라고 답했다.",
    mentorTip: "정확한 답을 줄 수 없을 때 시간을 버는 표현. 한국말 '대충 얼마' 보다 훨씬 프로페셔널해.",
    sampleAnswer: "Ballpark, we're looking at 5 to 7 million won.", tags: ["client", "budget"], status: "studied" },
  // ===== Day 15 = 오늘 (미학습) =====
  { day: 15, word: "table", pos: "v.", meaning: "(논의를) 보류하다", phonetic: "/ˈteɪbəl/",
    scene: "금요일 10:00, 분기 전략 회의. Daniel이 시계를 본다.",
    npc: "daniel",
    quote: "We're running short on time. Let's table the pricing discussion for now.",
    youDo: null,
    mentorTip: "재밌는 단어야. 미국식은 '보류', 영국식은 '정식 안건으로 올리다', 정반대! Daniel은 영국 본사라 헷갈릴 수 있어. 문맥으로 잡아야 해.",
    sampleAnswer: "Agreed. Let's table pricing and pick it up next week with the full deck.",
    tags: ["meeting", "decision"], status: "today" },
  // ===== Day 16+ = 미래 (잠금) =====
  { day: 16, word: "align", status: "locked" },
  { day: 17, word: "sync", status: "locked" },
  { day: 18, word: "bandwidth", status: "locked" },
  { day: 19, word: "scope", status: "locked" },
  { day: 20, word: "milestone", status: "locked" },
];

// 사내 공지 (인트라넷 메모)
const NOTICES = [
  { id: "n1", from: "hr", to: "신입 사원 전원", date: "4/30", subject: "[필수] 5월 워크숍 일정 안내", preview: "5월 둘째 주 워크숍 일정이 확정되었습니다. 각자 일정표 확인 부탁드립니다.", unread: true, tag: "필수" },
  { id: "n2", from: "mentor", to: "당신", date: "4/29", subject: "수습 14일차, 잘 하고 있어요", preview: "이번 주 미팅에서 'circle back' 자연스럽게 쓰는 거 봤어. 단어가 살아 움직이기 시작한 거야.", unread: true, tag: "사수" },
  { id: "n3", from: "hr", to: "수습 사원", date: "4/28", subject: "수습 평가 안내, Day 30 분기 평가", preview: "수습 30일차에 진행되는 분기 평가는 5개 시추에이션 롤플레이로 구성됩니다.", unread: false, tag: "평가" },
  { id: "n4", from: "park", to: "당신", date: "4/27", subject: "오늘 점심 같이 갈래?", preview: "1층 새로 생긴 김밥집 어때? 12시 30분에 봐.", unread: false, tag: "동기" },
];

// 사용자 상태
const USER = {
  name: "김지원",
  position: "수습 사원",
  positionEn: "Trainee",
  team: "Strategy Team · 12F",
  joinDate: "2026.04.16",
  currentDay: 15,
  totalDays: 30,
  studiedDays: 14,
  streak: 12,
  vacationDays: 3, // = saved point
  badges: ["첫 출근", "1주 개근", "사수 칭찬 3회", "외국인과 첫 대화"],
};

// 오늘의 일정 (홈 화면)
const TODAY_SCHEDULE = [
  { time: "09:00", title: "출근 / 슬랙 확인", status: "done" },
  { time: "09:30", title: "사수 모닝 브리핑", status: "done", note: "오늘의 단어 도착" },
  { time: "10:00", title: "분기 전략 회의 (Daniel 참석)", status: "now", note: "← 오늘의 시추에이션" },
  { time: "12:30", title: "박 대리와 점심", status: "next" },
  { time: "14:00", title: "Sarah Chen 클라이언트 콜", status: "next" },
  { time: "17:00", title: "주간 회고 + 단어 정리", status: "next" },
];

// ============================================================
// 버디 멘트, 홈 사이드 / 페이지 곳곳에 흩뿌릴 한 마디
// ============================================================
const BUDDY_NUDGES = [
  { tone: "morning", text: "굿모닝, 오늘 단어 한 번 소리 내서 읽어봐. 머리 아니고 입에 익혀야 회의에서 튀어나와." },
  { tone: "tip", text: "회의에서 모르는 표현 들으면 메모만 하고 그냥 넘어가도 돼. 끝나고 나한테 물어보면 돼." },
  { tone: "cheer", text: "수습 절반 왔어. 처음 만났을 때보다 메일 쓰는 속도 진짜 빨라졌더라." },
  { tone: "tip", text: "Daniel 같은 영국 본사 사람한테는 \"Just a quick check,\" 로 시작하면 톤이 부드러워져." },
  { tone: "tip", text: "오늘 표현, 진짜 쓸 일 있을 때 슬랙 DM이라도 한 번 써봐. 안 쓰면 휘발돼." },
  { tone: "morning", text: "아침에 출근부 도장 먼저 찍고 시작해. 작은 의식이 14일을 버티게 해." },
  { tone: "cheer", text: "어제 박 대리한테 영어로 도와준 거 봤어. 그게 진짜 실력이야, 가르치면서 내 것이 돼." },
  { tone: "tip", text: "비즈니스 영어는 단어보다 '톤'. 같은 단어도 분위기 따라 달라져, 시추에이션을 같이 외우는 이유야." },
];

// 단어/시추에이션 모달의 "버디한테 물어보기" 응답 풀
const BUDDY_ANSWERS = {
  default: [
    "오, 이거 좋은 질문이야. 내가 처음 회의 들어갔을 때도 이거 헷갈렸어.",
    "한 번에 외울 필요 없어. 오늘 한 번, 내일 한 번 더 보면 돼.",
    "이 표현은 클라이언트 메일에서 진짜 자주 봐. 익혀두면 손해 없어.",
  ],
  nuance: [
    "뉘앙스가 미묘하지? 비슷한 표현이 두세 개 있는데, 이건 '공식적인 자리'에 가까워.",
    "한국어로 1:1 매칭이 안 되는 단어야. 상황 통째로 외우는 게 답.",
  ],
  example: [
    "예문 한 개 더 줄게: \"Let me circle back on this after lunch.\", 이렇게 자주 써.",
    "내가 어제 쓴 슬랙 메시지에도 이거 들어갔어. 진짜 매일 써.",
  ],
};

window.__SIM = { CHARACTERS, SCENARIOS, NOTICES, USER, TODAY_SCHEDULE, BUDDY_NUDGES, BUDDY_ANSWERS };

