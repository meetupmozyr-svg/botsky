// src/rules.js

// 1. Черный список удаленных статей
export const BLACKLISTED_ARTICLE_IDS = new Set([
  36, 37, 46, 47, 48, 49, 50, 51, 52, 87, 88, 169, 314, 390, 391, 392,
  404, 407, 408, 409, 410, 411, 427, 428, 429, 430, 431, 432, 434, 435,
  436, 437, 438, 439, 440, 441, 470, 472, 576, 577, 578, 579, 592, 593,
  594, 595, 596, 597
]);

// 2. Реестр сценариев для классификатора и evalSuite
export const SCENARIOS = {
  UNIVERSAL_CANCEL: 'universal_cancel',
  UNIVERSAL_LATE: 'universal_late',
  AMBIGUOUS_LESSON_ISSUE: 'ambiguous_lesson_issue',
  STUDENT_CHURN: 'student_churn',
  BREAK_TEACHER: 'break_teacher',
  STUDENT_LATE: 'student_late',
  STUDENT_ABSENCE: 'student_absence',
  STUDENT_CANCEL: 'student_cancel',
  TEACHER_CANCEL: 'teacher_cancel',
  TEACHER_EMERGENCY: 'teacher_emergency',
  TEACHER_LATE: 'teacher_late',
  ZERO_BALANCE: 'zero_balance',
  TECHNICAL_ISSUE: 'technical_issue',
  CORPORATE_B2B: 'corporate_b2b',
  GROUP_LESSON: 'group_lesson',
  PARALLEL_LESSON: 'parallel_lesson',
  FIRST_LESSON_ALOHA: 'first_lesson_aloha',
  PARENT_FEEDBACK: 'parent_feedback',
  UNKNOWN: 'unknown'
};

// 3. Золотой стандарт школы (Сентябрь 2026)
export const PLATFORM_GOLD_STANDARD = `
ГЛАВНЫЕ СТАНДАРТЫ И РЕГЛАМЕНТЫ ШКОЛЫ (СЕНТЯБРЬ 2026):
1. Статусы уроков: существует строго 5 официальных статусов:
   - «Урок состоялся»
   - «Пропущен учеником»
   - «Урок пропущен преподавателем»
   - «Урок перенесен»
   - «Урок отменен»
   Во время ожидания ученика никакой статус в личном кабинете НЕ ставится!
2. Неявка ученика: учитель ждет в комнате полные 50 минут. Если ученик не пришел — после 50-й минуты ставится статус «Пропущен учеником» (100% оплата). Писать в поддержку не нужно.
3. Форс-мажор учителя (< 24 ч): учитель НЕ отменяет урок руками в расписании. Срочно пишет в Teachers Care / Mattermost для снятия слота операторами без влияния на KPI.
4. Перерывы преподавателя: оформляются минимум за 14 дней в личном кабинете. Экстренных перерывов день в день в кабинете нет — только через Teachers Care.
5. Мессенджер: официальный стандарт — Mattermost (ММТ).
6. Вводный урок: Aloha 3.0. На пакетных курсах («Английский для жизни / +1 уровень») Aloha СТРОГО ЗАПРЕЩЕНА.
7. Отчет родителям: устный One Page (5 блоков за 5–10 минут).
8. KPI: проверка каждые 2 недели по 6 метрикам (ID 310). Порог брака — до 20,0%.
9. Финансы: ОАНО ДПО «СКАЕНГ» (ИНН 9709022748). СМЗ — Банк 131; ИП РФ, РБ и РК — «Рокет Ворк».
`;

// 4. Жесткие политики для evalSuite
export const HARD_POLICIES = {
  [SCENARIOS.UNIVERSAL_CANCEL]: {
    evaluate: () => ({
      decision: 'SHOW_UNIVERSAL_CANCELLATION_MATRIX',
      lessonStatus: '«Урок отменен» или «Урок перенесен»',
      actionPlan: ['Отмена учеником: за 8 часов (за 4 ч для Premium). Отмена учителем: за 24 часа.']
    })
  },
  [SCENARIOS.UNIVERSAL_LATE]: {
    evaluate: () => ({
      decision: 'SHOW_UNIVERSAL_LATE_MATRIX',
      lessonStatus: '«Урок состоялся» (при проведении) или «Пропущен учеником» (при неявке)',
      actionPlan: ['При опоздании ученика ждем 50 минут. При опоздании учителя более 5 минут звонит робот.']
    })
  },
  [SCENARIOS.AMBIGUOUS_LESSON_ISSUE]: {
    evaluate: () => ({
      decision: 'SHOW_UNIVERSAL_RESCUE_MATRIX',
      lessonStatus: '«Урок состоялся»',
      actionPlan: ['При сбое платформы перейдите в резервный сервис (Google Meet / Телемост / Zoom).']
    })
  },
  [SCENARIOS.STUDENT_CHURN]: {
    evaluate: () => ({
      decision: 'WARN_CHURN_LIMITS',
      lessonStatus: 'Уроки снимаются системой автоматически',
      actionPlan: ['Лимит ушедших: не более 2 за 2 недели (не более 1 в первые 4 урока).']
    })
  },
  [SCENARIOS.BREAK_TEACHER]: {
    evaluate: () => ({
      decision: 'SHOW_BREAK_MATRIX',
      lessonStatus: 'Перерыв оформляется в личном кабинете',
      actionPlan: ['Плановый перерыв оформляется минимум за 14 дней в личном кабинете. Новым учителям в первые 2 месяца перерыв более 3 дней недоступен.']
    })
  },
  [SCENARIOS.STUDENT_LATE]: {
    evaluate: () => ({
      decision: 'CONDUCT_REMAINING_TIME',
      lessonStatus: 'Во время ожидания статус не ставится. После 50 минут: «Пропущен учеником» (если не пришел) или «Урок состоялся» (если подключился)',
      actionPlan: ['Ожидайте 50 минут в комнате. При подключении ведите занятие до конца слота.']
    })
  },
  [SCENARIOS.STUDENT_ABSENCE]: {
    evaluate: (facts) => {
      if (facts?.rawText && /3\s+урок.*подряд|пропустил\s+3\s+урока/i.test(facts.rawText)) {
        return {
          decision: 'REPORT_3RD_ABSENCE_TO_CARE',
          lessonStatus: '«Пропущен учеником»',
          actionPlan: ['Выставите «Пропущен учеником» и напишите в Teachers Care для снятия расписания.']
        };
      }
      return {
        decision: 'MARK_STUDENT_ABSENT',
        lessonStatus: '«Пропущен учеником»',
        actionPlan: ['После 50 минут ожидания в комнате выставите статус «Пропущен учеником».']
      };
    }
  },
  [SCENARIOS.STUDENT_CANCEL]: {
    evaluate: () => ({
      decision: 'FREE_STUDENT_CANCELLATION',
      lessonStatus: '«Урок отменен»',
      actionPlan: ['Бесплатная отмена учеником доступна за 8 часов (за 4 часа для Premium).']
    })
  },
  [SCENARIOS.TEACHER_CANCEL]: {
    evaluate: () => ({
      decision: 'TEACHER_LATE_CANCELLATION_WARNING',
      lessonStatus: '«Урок пропущен преподавателем»',
      actionPlan: ['Отмена учителем за < 24 часов фиксируется как неуспешный урок.']
    })
  },
  [SCENARIOS.TEACHER_EMERGENCY]: {
    evaluate: () => ({
      decision: 'REPORT_TO_TEACHERS_CARE_URGENT',
      lessonStatus: '«Урок перенесен» (выставляется поддержкой)',
      actionPlan: ['Не отменяйте урок сами. Срочно напишите в Teachers Care в Mattermost для отмены без штрафа.']
    })
  },
  [SCENARIOS.TEACHER_LATE]: {
    evaluate: () => ({
      decision: 'CONNECT_AND_HANDLE_BOT_CALL',
      lessonStatus: '«Урок состоялся»',
      actionPlan: ['Срочно войдите в урок и нажмите 1 при звонке робота.']
    })
  },
  [SCENARIOS.ZERO_BALANCE]: {
    evaluate: () => ({
      decision: 'DO_NOT_CONDUCT_LESSON',
      lessonStatus: 'Урок удаляется системой автоматически',
      actionPlan: ['Урок с 0 балансом удаляется роботом за 5 минут до начала. Не проводите и не отменяйте руками.']
    })
  },
  [SCENARIOS.TECHNICAL_ISSUE]: {
    evaluate: () => ({
      decision: 'RESCUE_LESSON_BACKUP_PLATFORM',
      lessonStatus: '«Урок состоялся»',
      actionPlan: ['Спасите урок в Google Meet / Телемост и отметьте как состоявшийся.']
    })
  },
  [SCENARIOS.CORPORATE_B2B]: {
    evaluate: () => ({
      decision: 'STRICT_B2B_CURRICULUM_COMPLIANCE',
      lessonStatus: '«Урок состоялся»',
      actionPlan: ['Ведите строго New General или New Business в темпе 1 занятие = 1 урок.']
    })
  },
  [SCENARIOS.GROUP_LESSON]: {
    evaluate: () => ({
      decision: 'CONDUCT_GROUP_IF_AT_LEAST_ONE',
      lessonStatus: '«Урок состоялся»',
      actionPlan: ['Урок проводится, если пришел хотя бы 1 ученик.']
    })
  },
  [SCENARIOS.PARALLEL_LESSON]: {
    evaluate: () => ({
      decision: 'MAINTAIN_TET_A_TET_INTERVALS',
      lessonStatus: '«Урок состоялся»',
      actionPlan: ['Чередуйте самостоятельную работу с тет-а-тет по 3–5 минут.']
    })
  },
  [SCENARIOS.FIRST_LESSON_ALOHA]: {
    evaluate: () => ({
      decision: 'FOLLOW_ALOHA_STRUCTURE',
      lessonStatus: '«Урок состоялся»',
      actionPlan: ['Проведите урок по Aloha 3.0. На пакетных курсах Aloha запрещена.']
    })
  },
  [SCENARIOS.PARENT_FEEDBACK]: {
    evaluate: () => ({
      decision: 'SEND_ONE_PAGE_REPORT_20_DAYS',
      lessonStatus: '«Урок состоялся»',
      actionPlan: ['Каждые 20 дней проводите 5-минутный устный диалог по 5 блокам One Page.']
    })
  }
};

// 5. Точные правила для промпта
export function getScopedScenarioRules(query) {
  const q = query.toLowerCase();

  if (/не\s+пришел|не\s+подключ|нет\s+на\s+урок|опазд.*ученик|ученик.*опазд|пропустил.*урок|сколько\s+ждать/i.test(q)) {
    return `
ЦЕЛЕВОЙ СЦЕНАРИЙ: НЕЯВКА ИЛИ ОПОЗДАНИЕ УЧЕНИКА
- Точный статус: Во время ожидания статус не ставится. После 50 минут ожидания выставляется строго «Пропущен учеником».
- Время ожидания: Ровно 50 минут в открытой комнате (для 100% оплаты).
- При опоздании: проводите урок ровно до конца времени по расписанию без продления. Статус: «Урок состоялся».
- В поддержку писать НЕ нужно.
`;
  }

  if (/форс-мажор|заболел|нет\s+свет|отключил|срочн.*отмен|я\s+отменяю|не\s+могу\s+провести/i.test(q)) {
    return `
ЦЕЛЕВОЙ СЦЕНАРИЙ: ЭКСТРЕННАЯ ОТМЕНА / ФОРС-МАЖОР ПРЕПОДАВАТЕЛЯ
- Точный статус: «Урок перенесен» (выставляется операторами поддержки).
- Главное правило: Не отменяйте урок самостоятельно в кабинете за < 24 часов.
- Порядок действий: Срочно напишите дежурным в чат Teachers Care / Mattermost для отмены без влияния на двухнедельный KPI (ID 310).
- Предупредите ученика в чате платформы о переносе по непредвиденным обстоятельствам.
`;
  }

  if (/отпуск|перерыв|хочу\s+отдохнуть|график\s+перерыв/i.test(q)) {
    return `
ЦЕЛЕВОЙ СЦЕНАРИЙ: ПЕРЕРЫВ И ОТПУСК ПРЕПОДАВАТЕЛЯ
- Порядок: Оформляется минимум за 14 дней (336 часов) в личном кабинете.
- Экстренных перерывов день в день в личном кабинете нет: любые срочные паузы оформляются только через Teachers Care.
- Новым учителям в первые 2 месяца перерыв более 3 дней недоступен.
`;
  }

  if (/0\s+на\s+балансе|нулев.*баланс|баланс\s+0/i.test(q)) {
    return `
ЦЕЛЕВОЙ СЦЕНАРИЙ: НУЛЕВОЙ БАЛАНС УЧЕНИКА
- Точный статус: Урок удаляется автоматически за 5 минут до начала (статус вручную не ставится).
- Правило: Проводить уроки при нулевом балансе запрещено. Если за 8 часов на балансе 0, учитель имеет право не выходить на урок.
`;
  }

  if (/отказ.*ученик|смен.*преподават|ученик.*хочет.*сменить|ушли.*ученик/i.test(q)) {
    return `
ЦЕЛЕВОЙ СЦЕНАРИЙ: ОТКАЗ ОТ УЧЕНИКА И СМЕНА ПРЕПОДАВАТЕЛЯ
- Лимиты по KPI (ID 310): Не более 2 уходов за 2 недели (не более 1 в первые 4 урока).
- Оформление: В разделе «Мои ученики» строго за 72–24 часа до урока с обоснованной причиной.
`;
  }

  if (/one[\s-]page|обратн.*связ.*родител|отчет.*родител/i.test(q)) {
    return `
ЦЕЛЕВОЙ СЦЕНАРИЙ: ОБРАТНАЯ СВЯЗЬ РОДИТЕЛЯМ (ONE PAGE)
- Регламент: 5-минутный устный диалог в конце урока каждые 20 дней (после от 4 уроков).
- 5 блоков: Прогресс → Зона роста → План → Совет родителю → Личное слово.
`;
  }

  if (/aloha|алоха|первый\s+урок/i.test(q)) {
    return `
ЦЕЛЕВОЙ СЦЕНАРИЙ: ПЕРВЫЙ УРОК ALOHA 3.0
- Взрослые: 7 этапов Aloha 3.0. Дети: 6 этапов Aloha 3.0.
- Пакетные курсы («Английский для жизни», Level Up): уроки Aloha СТРОГО ЗАПРЕЩЕНЫ (старт сразу с Unit 1).
`;
  }

  return "";
}
