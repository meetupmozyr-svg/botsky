// src/evalSuite.js
import { SCENARIOS, HARD_POLICIES } from './rules.js';

// ============================================================================
// 1. НАБОР ТЕСТОВЫХ СЦЕНАРИЕВ (ЗОЛОТОЙ СТАНДАРТ СЕНТЯБРЬ 2026)
// ============================================================================
export const EVALUATION_TEST_CASES = [
  // --- Универсальные ветвления (Universal Branching) ---
  {
    id: "UC_01",
    input: "Как отменить урок?",
    expectedScenario: SCENARIOS.UNIVERSAL_CANCEL,
    expectedDecision: "SHOW_UNIVERSAL_CANCELLATION_MATRIX",
    expectedStatus: "Зависит от инициатора"
  },
  {
    id: "UL_01",
    input: "Что делать при опоздании?",
    expectedScenario: SCENARIOS.UNIVERSAL_LATE,
    expectedDecision: "SHOW_UNIVERSAL_LATE_MATRIX",
    expectedStatus: "Зависит от инициатора"
  },
  {
    id: "AL_01",
    input: "Урок сорвался, что делать?",
    expectedScenario: SCENARIOS.AMBIGUOUS_LESSON_ISSUE,
    expectedDecision: "SHOW_UNIVERSAL_RESCUE_MATRIX",
    expectedStatus: "Зависит от ситуации"
  },

  // --- Отток и смена преподавателя (ID 310) ---
  {
    id: "CH_01",
    input: "Ученик хочет сменить преподавателя. Какие последствия для меня?",
    expectedScenario: SCENARIOS.STUDENT_CHURN,
    expectedDecision: "WARN_CHURN_LIMITS",
    expectedStatus: "Уроки снимаются системой"
  },
  {
    id: "CH_02",
    input: "Ушли 2 ученика на старте. Что будет?",
    expectedScenario: SCENARIOS.STUDENT_CHURN,
    expectedDecision: "WARN_CHURN_LIMITS",
    expectedStatus: "Уроки снимаются системой"
  },

  // --- Перерывы и отпуска (ID 5, 477) ---
  {
    id: "BT_01",
    input: "Хочу уйти в отпуск на 5 дней, подаю заявку за 3 дня.",
    expectedScenario: SCENARIOS.BREAK_TEACHER,
    expectedDecision: "SHOW_BREAK_MATRIX",
    expectedStatus: "Перерыв"
  },
  {
    id: "BT_02",
    input: "Как оформить перерыв на 45 дней?",
    expectedScenario: SCENARIOS.BREAK_TEACHER,
    expectedDecision: "SHOW_BREAK_MATRIX",
    expectedStatus: "Перерыв"
  },

  // --- Опоздания ученика ---
  {
    id: "SL_01",
    input: "Ученик опаздывает на 15 минут. Что мне делать?",
    expectedScenario: SCENARIOS.STUDENT_LATE,
    expectedDecision: "CONDUCT_REMAINING_TIME",
    expectedStatus: "Урок продолжается (в процессе ожидания)"
  },
  {
    id: "SL_04",
    input: "Прошло 35 минут урока, ученик только подключился.",
    expectedScenario: SCENARIOS.STUDENT_LATE,
    expectedDecision: "CONDUCT_REMAINING_TIME",
    expectedStatus: "Урок продолжается (в процессе ожидания)"
  },

  // --- Неявка ученика (Правило 50 минут и системные пропуски) ---
  {
    id: "SA_01",
    input: "Прошло ровно 50 минут, ученик так и не пришел на урок.",
    expectedScenario: SCENARIOS.STUDENT_ABSENCE,
    expectedDecision: "MARK_STUDENT_ABSENT",
    expectedStatus: "Пропущен учеником"
  },
  {
    id: "SA_02",
    input: "Ученик пропустил уже 3 урока подряд.",
    expectedScenario: SCENARIOS.STUDENT_ABSENCE,
    expectedDecision: "REPORT_3RD_ABSENCE_TO_CARE",
    expectedStatus: "Пропущен учеником"
  },

  // --- Отмены уроков ---
  {
    id: "SC_01",
    input: "Ученик отменил урок за 10 часов до начала.",
    expectedScenario: SCENARIOS.STUDENT_CANCEL,
    expectedDecision: "FREE_STUDENT_CANCELLATION",
    expectedStatus: "Урок отменен"
  },
  {
    id: "TC_01",
    input: "Я отменяю урок за 2 часа из-за планов.",
    expectedScenario: SCENARIOS.TEACHER_CANCEL,
    expectedDecision: "TEACHER_LATE_CANCELLATION_WARNING",
    expectedStatus: "Урок пропущен преподавателем"
  },

  // --- Форс-мажоры ---
  {
    id: "TE_01",
    input: "Аварийно отключили свет за 15 минут до урока!",
    expectedScenario: SCENARIOS.TEACHER_EMERGENCY,
    expectedDecision: "REPORT_TO_TEACHERS_CARE_URGENT",
    expectedStatus: "Урок перенесен"
  },

  // --- Опоздание преподавателя ---
  {
    id: "TL_01",
    input: "Я опоздал на 6 минут, звонил робот.",
    expectedScenario: SCENARIOS.TEACHER_LATE,
    expectedDecision: "CONNECT_AND_HANDLE_BOT_CALL",
    expectedStatus: "Урок состоялся"
  },

  // --- Технические сбои платформы ---
  {
    id: "TI_01",
    input: "Платформа зависла, спасаю урок через Zoom.",
    expectedScenario: SCENARIOS.TECHNICAL_ISSUE,
    expectedDecision: "RESCUE_LESSON_BACKUP_PLATFORM",
    expectedStatus: "Урок состоялся (при спасении)"
  },

  // --- B2B, Форматы и Методики 2026 ---
  {
    id: "CB_01",
    input: "Корпоративный ученик B2B не сдал Progress Test.",
    expectedScenario: SCENARIOS.CORPORATE_B2B,
    expectedDecision: "STRICT_B2B_CURRICULUM_COMPLIANCE",
    expectedStatus: "Корпоративный урок"
  },
  {
    id: "GL_01",
    input: "В группу пришел 1 человек из 4.",
    expectedScenario: SCENARIOS.GROUP_LESSON,
    expectedDecision: "CONDUCT_GROUP_IF_AT_LEAST_ONE",
    expectedStatus: "Урок состоялся"
  },
  {
    id: "PL_01",
    input: "Как вести параллельный урок на 5 учеников?",
    expectedScenario: SCENARIOS.PARALLEL_LESSON,
    expectedDecision: "MAINTAIN_TET_A_TET_INTERVALS",
    expectedStatus: "Параллельный блок"
  },
  {
    id: "FL_01",
    input: "Первый урок Aloha 3.0",
    expectedScenario: SCENARIOS.FIRST_LESSON_ALOHA,
    expectedDecision: "FOLLOW_ALOHA_STRUCTURE",
    expectedStatus: "Урок состоялся"
  },
  {
    id: "PF_01",
    input: "Обратная связь родителю (One-page)",
    expectedScenario: SCENARIOS.PARENT_FEEDBACK,
    expectedDecision: "SEND_ONE_PAGE_REPORT_20_DAYS",
    expectedStatus: "Педагогический отчет"
  },
  {
    id: "ZB_01",
    input: "У ученика 0 на балансе, урок через 2 часа.",
    expectedScenario: SCENARIOS.ZERO_BALANCE,
    expectedDecision: "DO_NOT_CONDUCT_LESSON",
    expectedStatus: "Урок удаляется"
  }
];

// ============================================================================
// 2. ДВИЖОК АВТОМАТИЧЕСКОГО ТЕСТИРОВАНИЯ
// ============================================================================
export async function executeEvaluationSuite(classifyFn) {
  const results = [];
  let scenarioMatches = 0;
  let decisionMatches = 0;

  for (const tc of EVALUATION_TEST_CASES) {
    const startTime = Date.now();
    
    // Классификация сценария
    const { scenario, facts, confidence } = classifyFn(
      { rawHistoryText: tc.input, facts: { rawText: tc.input } }, 
      tc.input
    );
    const latency = Date.now() - startTime;

    // Оценка детерминированного правила
    const policy = HARD_POLICIES[scenario];
    const evaluatedFacts = { ...facts, rawText: tc.input };
    const decisionObj = policy ? policy.evaluate(evaluatedFacts) : null;

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
