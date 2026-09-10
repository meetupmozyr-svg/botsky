// src/classifier.js
import { SCENARIOS } from './rules.js';

export function synthesizeContextualQuery(messages) {
  if (!messages || messages.length === 0) return { query: '', historySummary: '' };

  const lastMsg = messages[messages.length - 1]?.content || '';
  const prevMsg = messages.length > 1 ? messages[messages.length - 2]?.content || '' : '';

  // Detect follow-up questions ("А если на 15 минут?", "А в этом случае?")
  const isShortFollowUp = lastMsg.trim().split(/\s+/).length <= 5;

  let contextualQuery = lastMsg;
  if (isShortFollowUp && prevMsg) {
    contextualQuery = `${prevMsg} -> Уточнение: ${lastMsg}`;
  }

  return { lastMsg, contextualQuery };
}

export function classifyScenarioAndFacts(query) {
  const text = query.toLowerCase();

  const facts = {
    minutes: null,
    actor: null,
    isEmergency: false
  };

  // Extract minute entities
  const minuteMatch = text.match(/(\d+)\s*(?:мин|минут)/);
  if (minuteMatch) {
    facts.minutes = parseInt(minuteMatch[1], 10);
  }

  // 1. Force Majeure / Teacher Emergency
  if (/пожар|эвакуац|нет свет|отключил|заболел|больнич|срочн|чп|форс-мажор/.test(text)) {
    facts.actor = 'teacher';
    facts.isEmergency = true;
    return { scenario: SCENARIOS.TEACHER_EMERGENCY, facts, confidence: 0.95 };
  }

  // 2. Student Late / Missed Lesson
  if (/опозда|задержив|не пришел|не подключ|нет на урок|жду ученик/.test(text)) {
    facts.actor = 'student';
    if (!facts.minutes && /не пришел|не явился/.test(text)) {
      facts.minutes = 50; // absence threshold
    }
    return { 
      scenario: (facts.minutes && facts.minutes >= 50) ? SCENARIOS.STUDENT_ABSENCE : SCENARIOS.STUDENT_LATE, 
      facts, 
      confidence: 0.92 
    };
  }

  // 3. Break / Vacation
  if (/отпуск|перерыв|зелен|расписан|выходн|отдых/.test(text)) {
    facts.actor = 'teacher';
    return { scenario: SCENARIOS.BREAK_SCHEDULE, facts, confidence: 0.90 };
  }

  // 4. Change Teacher
  if (/смен|друг.*преподават|отказ.*ученик/.test(text)) {
    return { scenario: SCENARIOS.CHANGE_TEACHER, facts, confidence: 0.88 };
  }

  return { scenario: SCENARIOS.UNKNOWN, facts, confidence: 0.40 };
}
