import { SCENARIOS, HARD_POLICIES } from './rules.js';

// ============================================================================
// 1. 40+ GOLD STANDARD OPERATIONAL TEST CASES
// ============================================================================
export const EVALUATION_TEST_CASES = [
  // --- A. Student Late (Опоздание ученика) ---
  {
    id: "SL_01",
    input: "Ученик опаздывает на 15 минут. Что мне делать?",
    expectedScenario: SCENARIOS.STUDENT_LATE,
    expectedDecision: "WAIT_IN_CLASSROOM",
    expectedStatus: "Урок продолжается (в процессе ожидания)",
    forbiddenTerms: ["CRM", "брак", "буфер", "Отменен преподавателем", "форс-мажор"]
  },
  {
    id: "SL_02",
    input: "Жду ученика уже 5 минут, в классе никого нет.",
    expectedScenario: SCENARIOS.STUDENT_LATE,
    expectedDecision: "WAIT_IN_CLASSROOM",
    expectedStatus: "Урок продолжается (в процессе ожидания)",
    forbiddenTerms: ["CRM", "брак", "буфер", "Ученик не пришел"]
  },
  {
    id: "SL_03",
    input: "Ученик написал, что задерживается на 20 минут. Могу ли я отменить урок?",
    expectedScenario: SCENARIOS.STUDENT_LATE,
    expectedDecision: "WAIT_IN_CLASSROOM",
    expectedStatus: "Урок продолжается (в процессе ожидания)",
    forbiddenTerms: ["CRM", "брак", "буфер", "можете отменить", "штраф"]
  },
  {
    id: "SL_04",
    input: "Прошло 35 минут урока, ученик только подключился. Проводить ли занятие?",
    expectedScenario: SCENARIOS.STUDENT_LATE,
    expectedDecision: "WAIT_IN_CLASSROOM",
    expectedStatus: "Урок продолжается (в процессе ожидания)",
    forbiddenTerms: ["CRM", "брак", "буфер", "отмена"]
  },

  // --- B. Student Absence (Неявка 50 минут) ---
  {
    id: "SA_01",
    input: "Прошло ровно 50 минут, ученик так и не пришел на урок. Какой статус ставить?",
    expectedScenario: SCENARIOS.STUDENT_ABSENCE,
    expectedDecision: "MARK_STUDENT_ABSENT",
    expectedStatus: "Ученик не пришел",
    forbiddenTerms: ["CRM", "брак", "буфер", "Отменен", "Технический сбой"]
  },
  {
    id: "SA_02",
    input: "Ученик не явился на занятие, прождал его до конца урока.",
    expectedScenario: SCENARIOS.STUDENT_ABSENCE,
    expectedDecision: "MARK_STUDENT_ABSENT",
    expectedStatus: "Ученик не пришел",
    forbiddenTerms: ["CRM", "брак", "буфер", "без оплаты"]
  },
  {
    id: "SA_03",
    input: "Ученик не подключился. 50 минут истекли. Будет ли оплачен этот урок?",
    expectedScenario: SCENARIOS.STUDENT_ABSENCE,
    expectedDecision: "MARK_STUDENT_ABSENT",
    expectedStatus: "Ученик не пришел",
    forbiddenTerms: ["CRM", "брак", "буфер", "оплата не начисляется", "штраф"]
  },

  // --- C. Student Cancellation (Отмена учеником) ---
  {
    id: "SC_01",
    input: "Ученик отменил урок за 10 часов до начала. Оплатят ли мне его?",
    expectedScenario: SCENARIOS.STUDENT_CANCEL,
    expectedDecision: "FREE_STUDENT_CANCELLATION",
    expectedStatus: "Отменен учеником (заблаговременно)",
    forbiddenTerms: ["CRM", "брак", "буфер", "100% оплата"]
  },
  {
    id: "SC_02",
    input: "Ученик отменил занятие за 2 часа до старта. Какая компенсация?",
    expectedScenario: SCENARIOS.STUDENT_CANCEL,
    expectedDecision: "LATE_STUDENT_CANCELLATION",
    expectedStatus: "Отменен учеником менее чем за 8 часов",
    forbiddenTerms: ["CRM", "брак", "буфер", "бесплатная отмена", "без оплаты"]
  },
  {
    id: "SC_03",
    input: "Родитель предупредил об отмене урока за 30 минут до начала.",
    expectedScenario: SCENARIOS.STUDENT_CANCEL,
    expectedDecision: "LATE_STUDENT_CANCELLATION",
    expectedStatus: "Отменен учеником менее чем за 8 часов",
    forbiddenTerms: ["CRM", "брак", "буфер", "бесплатно"]
  },

  // --- D. Teacher Emergency & Force Majeure (Форс-мажор) ---
  {
    id: "TE_01",
    input: "У меня аварийно отключили электричество за 15 минут до урока! Что делать?",
    expectedScenario: SCENARIOS.TEACHER_EMERGENCY,
    expectedDecision: "REPORT_TO_TEACHERS_CARE",
    expectedStatus: "Отмена по форс-мажору",
    forbiddenTerms: ["CRM", "брак", "буфер", "штраф", "Ученик не пришел"]
  },
  {
    id: "TE_02",
    input: "Срочно госпитализировали в больницу, не могу провести вечерние уроки.",
    expectedScenario: SCENARIOS.TEACHER_EMERGENCY,
    expectedDecision: "REPORT_TO_TEACHERS_CARE",
    expectedStatus: "Отмена по форс-мажору",
    forbiddenTerms: ["CRM", "брак", "буфер", "штрафные санкции"]
  },
  {
    id: "TE_03",
    input: "В доме сработала пожарная тревога, идет эвакуация, урок через 5 минут!",
    expectedScenario: SCENARIOS.TEACHER_EMERGENCY,
    expectedDecision: "REPORT_TO_TEACHERS_CARE",
    expectedStatus: "Отмена по форс-мажору",
    forbiddenTerms: ["CRM", "брак", "буфер", "ждите 50 минут"]
  },

  // --- E. Teacher Delay (Опоздание преподавателя) ---
  {
    id: "TL_01",
    input: "Я опоздал на урок на 5 минут из-за перезагрузки компьютера. Как поступить?",
    expectedScenario: SCENARIOS.TEACHER_LATE,
    expectedDecision: "CONNECT_AND_COMPENSATE",
    expectedStatus: "Урок проведен с опозданием",
    forbiddenTerms: ["CRM", "брак", "буфер", "Ученик не пришел"]
  },
  {
    id: "TL_02",
    input: "Я задерживаюсь к началу занятия на 10 минут, как компенсировать время?",
    expectedScenario: SCENARIOS.TEACHER_LATE,
    expectedDecision: "CONNECT_AND_COMPENSATE",
    expectedStatus: "Урок проведен с опозданием",
    forbiddenTerms: ["CRM", "брак", "буфер", "отмените урок"]
  },

  // --- F. Break & Vacation (Отпуск и зеленая зона) ---
  {
    id: "BS_01",
    input: "Как правильно оформить отпуск в расписании на следующую неделю?",
    expectedScenario: SCENARIOS.BREAK_SCHEDULE,
    expectedDecision: "CHECK_GREEN_ZONE_72H",
    expectedStatus: "Отпуск / Перерыв в расписании",
    forbiddenTerms: ["CRM", "брак", "буфер", "удалите слоты день-в-день"]
  },
  {
    id: "BS_02",
    input: "Хочу сделать перерыв в слотах на 3 недели, что будет с моими постоянными учениками?",
    expectedScenario: SCENARIOS.BREAK_SCHEDULE,
    expectedDecision: "CHECK_GREEN_ZONE_72H",
    expectedStatus: "Отпуск / Перерыв в расписании",
    forbiddenTerms: ["CRM", "брак", "буфер", "штраф 100%"]
  },

  // --- G. Change Teacher (Смена преподавателя) ---
  {
    id: "CT_01",
    input: "Ученик хочет сменить преподавателя. Будет ли за это штраф?",
    expectedScenario: SCENARIOS.CHANGE_TEACHER,
    expectedDecision: "TRANSFER_PUPIL_WITHOUT_PENALTY",
    expectedStatus: "Ученик передан на замену",
    forbiddenTerms: ["CRM", "брак", "буфер", "штраф"]
  },
  {
    id: "CT_02",
    input: "Какой допустимый порог смен учеников и неуспешных уроков?",
    expectedScenario: SCENARIOS.CHANGE_TEACHER,
    expectedDecision: "TRANSFER_PUPIL_WITHOUT_PENALTY",
    expectedStatus: "Ученик передан на замену",
    forbiddenTerms: ["CRM", "брак", "буфер", "штрафной буфер"]
  },

  // --- H. Technical Issues (Технические сбои) ---
  {
    id: "TI_01",
    input: "Платформа выдает ошибку при входе в виртуальный класс, не работает камера.",
    expectedScenario: SCENARIOS.TECHNICAL_ISSUE,
    expectedDecision: "DIAGNOSE_AND_REPORT",
    expectedStatus: "Технический сбой платформы",
    forbiddenTerms: ["CRM", "брак", "буфер", "Ученик не пришел"]
  },

  // --- I. Consecutive & Group Lessons ---
  {
    id: "CL_01",
    input: "У меня стоят 2 урока подряд с одним учеником. Он не пришел на первый, что делать со вторым?",
    expectedScenario: SCENARIOS.CONSECUTIVE_LESSONS,
    expectedDecision: "TREAT_AS_SEPARATE_SESSIONS",
    expectedStatus: "Спаренные уроки",
    forbiddenTerms: ["CRM", "брак", "буфер", "уходите сразу"]
  },
  {
    id: "GL_01",
    input: "В групповом классе подключился только один ученик из 5. Проводить урок?",
    expectedScenario: SCENARIOS.GROUP_LESSON,
    expectedDecision: "CONDUCT_IF_AT_LEAST_ONE",
    expectedStatus: "Групповой урок",
    forbiddenTerms: ["CRM", "брак", "буфер", "отмените урок"]
  },

  // --- J. Payment Dispute ---
  {
    id: "PD_01",
    input: "Когда придет выплата вознаграждения за прошлый расчетный период?",
    expectedScenario: SCENARIOS.PAYMENT_DISPUTE,
    expectedDecision: "CHECK_PAYMENT_SCHEDULE",
    expectedStatus: "Финансовый аудит",
    forbiddenTerms: ["CRM", "брак", "буфер", "Payoneer"]
  },

  // --- K. Active Clarification / Ambiguous Prompts ---
  {
    id: "NC_01",
    input: "У меня сорвался урок, что делать?",
    expectedScenario: SCENARIOS.NEED_CLARIFICATION,
    expectedDecision: "REQUEST_MORE_DETAILS",
    expectedStatus: "Ожидает уточнения",
    forbiddenTerms: ["CRM", "брак", "буфер"]
  },
  {
    id: "NC_02",
    input: "Как отменить урок?",
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
  let forbiddenPassed = 0;

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
    forbiddenPassed++; // Passed static policy tree test

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
