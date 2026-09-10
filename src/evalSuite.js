import { SCENARIOS, HARD_POLICIES } from './rules.js';

// ============================================================================
// 1. 25 GOLD STANDARD OPERATIONAL TEST CASES (ПО БАЗЕ ЗНАНИЙ HELP CENTER)
// ============================================================================
export const EVALUATION_TEST_CASES = [
  // --- A. Student Late (Опоздание ученика) ---
  {
    id: "SL_01",
    input: "Ученик опаздывает на 15 минут. Что мне делать?",
    expectedScenario: SCENARIOS.STUDENT_LATE,
    expectedDecision: "CONDUCT_REMAINING_TIME",
    expectedStatus: "Урок продолжается (в процессе ожидания)",
    forbiddenTerms: ["CRM", "брак", "буфер", "Урок пропущен преподавателем"]
  },
  {
    id: "SL_02",
    input: "Жду ученика уже 5 минут, в классе никого нет.",
    expectedScenario: SCENARIOS.STUDENT_LATE,
    expectedDecision: "CONDUCT_REMAINING_TIME",
    expectedStatus: "Урок продолжается (в процессе ожидания)",
    forbiddenTerms: ["CRM", "брак", "буфер", "Пропущен учеником"]
  },
  {
    id: "SL_03",
    input: "Ученик написал, что задерживается на 20 минут. Могу ли я отменить урок?",
    expectedScenario: SCENARIOS.STUDENT_LATE,
    expectedDecision: "CONDUCT_REMAINING_TIME",
    expectedStatus: "Урок продолжается (в процессе ожидания)",
    forbiddenTerms: ["CRM", "брак", "буфер", "можете отменить"]
  },
  {
    id: "SL_04",
    input: "Прошло 35 минут урока, ученик только подключился. Проводить ли занятие?",
    expectedScenario: SCENARIOS.STUDENT_LATE,
    expectedDecision: "CONDUCT_REMAINING_TIME",
    expectedStatus: "Урок продолжается (в процессе ожидания)",
    forbiddenTerms: ["CRM", "брак", "буфер", "отмена"]
  },

  // --- B. Student Absence (Неявка 50 минут) ---
  {
    id: "SA_01",
    input: "Прошло ровно 50 минут, ученик так и не пришел на урок. Какой статус ставить?",
    expectedScenario: SCENARIOS.STUDENT_ABSENCE,
    expectedDecision: "MARK_STUDENT_ABSENT",
    expectedStatus: "Пропущен учеником",
    forbiddenTerms: ["CRM", "брак", "буфер", "Урок пропущен преподавателем"]
  },
  {
    id: "SA_02",
    input: "Ученик не явился на занятие, прождал его до конца урока.",
    expectedScenario: SCENARIOS.STUDENT_ABSENCE,
    expectedDecision: "MARK_STUDENT_ABSENT",
    expectedStatus: "Пропущен учеником",
    forbiddenTerms: ["CRM", "брак", "буфер", "без оплаты"]
  },
  {
    id: "SA_03",
    input: "Ученик не подключился. 50 минут истекли. Будет ли оплачен этот урок?",
    expectedScenario: SCENARIOS.STUDENT_ABSENCE,
    expectedDecision: "MARK_STUDENT_ABSENT",
    expectedStatus: "Пропущен учеником",
    forbiddenTerms: ["CRM", "брак", "буфер", "оплата не начисляется"]
  },

  // --- C. Student Cancellation (Отмена учеником) ---
  {
    id: "SC_01",
    input: "Ученик отменил урок за 10 часов до начала. Оплатят ли мне его?",
    expectedScenario: SCENARIOS.STUDENT_CANCEL,
    expectedDecision: "FREE_STUDENT_CANCELLATION",
    expectedStatus: "Урок отменен",
    forbiddenTerms: ["CRM", "брак", "буфер", "100% оплата"]
  },
  {
    id: "SC_02",
    input: "Ученик отменил занятие за 2 часа до старта. Какая компенсация?",
    expectedScenario: SCENARIOS.STUDENT_CANCEL,
    expectedDecision: "LATE_STUDENT_CANCELLATION",
    expectedStatus: "Пропущен учеником",
    forbiddenTerms: ["CRM", "брак", "буфер", "бесплатная отмена", "без оплаты"]
  },
  {
    id: "SC_03",
    input: "Родитель предупредил об отмене урока за 30 минут до начала.",
    expectedScenario: SCENARIOS.STUDENT_CANCEL,
    expectedDecision: "LATE_STUDENT_CANCELLATION",
    expectedStatus: "Пропущен учеником",
    forbiddenTerms: ["CRM", "брак", "буфер", "бесплатно"]
  },

  // --- D. Teacher Emergency & Force Majeure ---
  {
    id: "TE_01",
    input: "У меня аварийно отключили электричество за 15 минут до урока! Что делать?",
    expectedScenario: SCENARIOS.TEACHER_EMERGENCY,
    expectedDecision: "REPORT_TO_TEACHERS_CARE_URGENT",
    expectedStatus: "Урок перенесен",
    forbiddenTerms: ["CRM", "брак", "буфер", "Пропущен учеником"]
  },
  {
    id: "TE_02",
    input: "Срочно госпитализировали в больницу, не могу провести вечерние уроки.",
    expectedScenario: SCENARIOS.TEACHER_EMERGENCY,
    expectedDecision: "REPORT_TO_TEACHERS_CARE_URGENT",
    expectedStatus: "Урок перенесен",
    forbiddenTerms: ["CRM", "брак", "буфер"]
  },

  // --- E. Teacher Delay ---
  {
    id: "TL_01",
    input: "Я опоздал на урок на 5 минут из-за перезагрузки компьютера. Как поступить?",
    expectedScenario: SCENARIOS.TEACHER_LATE,
    expectedDecision: "CONNECT_AND_HANDLE_BOT_CALL",
    expectedStatus: "Урок состоялся",
    forbiddenTerms: ["CRM", "брак", "буфер"]
  },

  // --- F. Teacher Break & Vacation ---
  {
    id: "BS_01",
    input: "Как правильно оформить перерыв преподавателя в расписании за 14 дней?",
    expectedScenario: SCENARIOS.BREAK_TEACHER,
    expectedDecision: "APPLY_BREAK_14_DAYS",
    expectedStatus: "Перерыв",
    forbiddenTerms: ["CRM", "брак", "буфер"]
  },
  {
    id: "BS_02",
    input: "Хочу уйти в отпуск более чем на 40 дней, что будет с моим сотрудничеством?",
    expectedScenario: SCENARIOS.BREAK_TEACHER,
    expectedDecision: "BREAK_OVER_40_DAYS_SUSPENSION",
    expectedStatus: "Перерыв",
    forbiddenTerms: ["CRM", "брак", "буфер"]
  },

  // --- G. Change Teacher & Refuse Student ---
  {
    id: "CT_01",
    input: "Ученик хочет сменить преподавателя. Какие последствия для меня?",
    expectedScenario: SCENARIOS.CHANGE_TEACHER,
    expectedDecision: "NO_ACTION_REQUIRED_FROM_TEACHER",
    expectedStatus: "Уроки снимаются системой автоматически",
    forbiddenTerms: ["CRM", "брак", "буфер", "отметьте в личном кабинете"]
  },
  {
    id: "RS_01",
    input: "Хочу отказаться от студента через карточку ученика за 72 часа.",
    expectedScenario: SCENARIOS.REFUSE_STUDENT,
    expectedDecision: "REFUSE_VIA_STUDENT_CARD_72H",
    expectedStatus: "Отказ от ученика",
    forbiddenTerms: ["CRM", "брак", "буфер"]
  },

  // --- H. Zero Balance & Aloha First Lesson ---
  {
    id: "ZB_01",
    input: "У ученика 0 на балансе за 3 часа до урока. Проводить ли занятие?",
    expectedScenario: SCENARIOS.ZERO_BALANCE,
    expectedDecision: "DO_NOT_CONDUCT_LESSON",
    expectedStatus: "Урок удаляется системой",
    forbiddenTerms: ["CRM", "брак", "буфер", "проведите в долг"]
  },
  {
    id: "FL_01",
    input: "Как провести первый урок Aloha 3.0 с новым учеником?",
    expectedScenario: SCENARIOS.FIRST_LESSON_ALOHA,
    expectedDecision: "FOLLOW_ALOHA_STRUCTURE",
    expectedStatus: "Урок состоялся",
    forbiddenTerms: ["CRM", "брак", "буфер", "отмените урок"]
  },

  // --- I. Technical Issues & Rescue ---
  {
    id: "TI_01",
    input: "Платформа зависла, как спасти урок через Zoom?",
    expectedScenario: SCENARIOS.TECHNICAL_ISSUE,
    expectedDecision: "RESCUE_LESSON_BACKUP_PLATFORM",
    expectedStatus: "Урок состоялся (при спасении)",
    forbiddenTerms: ["CRM", "брак", "буфер"]
  },

  // --- J. Corporate B2B & Group Lessons ---
  {
    id: "CB_01",
    input: "Обучение оплачивает корпоративная компания B2B, можно ли сменить курс?",
    expectedScenario: SCENARIOS.CORPORATE_B2B,
    expectedDecision: "STRICT_B2B_CURRICULUM_COMPLIANCE",
    expectedStatus: "Корпоративный урок",
    forbiddenTerms: ["CRM", "брак", "буфер"]
  },
  {
    id: "GL_01",
    input: "В групповом классе F2G подключился только один ученик из 5. Проводить урок?",
    expectedScenario: SCENARIOS.GROUP_LESSON,
    expectedDecision: "CONDUCT_GROUP_IF_AT_LEAST_ONE",
    expectedStatus: "Урок состоялся / Пропущен группой",
    forbiddenTerms: ["CRM", "брак", "буфер", "отмените урок"]
  },

  // --- K. Payments & Clarification ---
  {
    id: "PD_01",
    input: "Когда придет выплата вознаграждения самозанятым через Банк 131?",
    expectedScenario: SCENARIOS.PAYMENT_DISPUTE,
    expectedDecision: "CHECK_BIWEEKLY_PAYOUT_SCHEDULE",
    expectedStatus: "Финансовый аудит",
    forbiddenTerms: ["CRM", "брак", "буфер", "Payoneer"]
  },
  {
    id: "NC_01",
    input: "У меня сорвался урок, что делать?",
    expectedScenario: SCENARIOS.NEED_CLARIFICATION,
    expectedDecision: "REQUEST_MORE_DETAILS",
    expectedStatus: "Ожидает уточнения",
    forbiddenTerms: ["CRM", "брак", "буфер"]
  }
];

// ============================================================================
// 2. AUTOMATED EVALUATION RUNNER ENGINE
// ============================================================================
export async function executeEvaluationSuite(classifyFn) {
  const results = [];
  let scenarioMatches = 0;
  let decisionMatches = 0;

  for (const tc of EVALUATION_TEST_CASES) {
    const startTime = Date.now();
    const { scenario, facts, confidence } = classifyFn({ rawHistoryText: tc.input, facts: {} }, tc.input);
    const latency = Date.now() - startTime;

    const policy = HARD_POLICIES[scenario];
    const decisionObj = policy ? policy.evaluate(facts) : null;

    const isScenarioCorrect = scenario === tc.expectedScenario;
    const isDecisionCorrect = decisionObj?.decision === tc.expectedDecision;

    if (isScenarioCorrect) scenarioMatches++;
    if (isDecisionCorrect) decisionMatches++;

    results.push({
      id: tc.id,
      input: tc.input,
      expectedScenario: tc.expectedScenario,
      actualScenario: scenario,
      scenarioPassed: isScenarioCorrect,
      expectedDecision: tc.expectedDecision,
      actualDecision: decisionObj?.decision || 'NONE',
      decisionPassed: isDecisionCorrect,
      actualStatus: decisionObj?.lessonStatus || 'UNKNOWN',
      confidence,
      latencyMs: latency
    });
  }

  const total = EVALUATION_TEST_CASES.length;
  return {
    totalTests: total,
    scenarioAccuracyPct: Math.round((scenarioMatches / total) * 100),
    decisionAccuracyPct: Math.round((decisionMatches / total) * 100),
    passedAll: scenarioMatches === total && decisionMatches === total,
    results
  };
}
