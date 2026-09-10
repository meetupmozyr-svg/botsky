// ============================================================================
// 1. BLACKLISTED ARTICLES AUDIT (44+ устаревших/неактуальных статей)
// ============================================================================
export const BLACKLISTED_ARTICLE_IDS = new Set([
  36, 37, 169,
  51, 314, 404, 576, 577, 578, 579,
  470, 472,
  46, 47, 48, 49, 50, 52, 87, 88,
  390, 391, 392, 407, 408, 409, 410, 411,
  427, 428, 429, 430, 431, 432, 434, 435, 436, 437, 438, 439, 440, 441,
  592, 593, 594, 595, 596, 597
]);

// ============================================================================
// 2. PLATFORM GOLD STANDARD & MANDATORY TERMINOLOGY (ОФИЦИАЛЬНАЯ БАЗА ЗНАНИЙ)
// ============================================================================
export const PLATFORM_GOLD_STANDARD = `
ЗОЛОТОЙ СТАНДАРТ И СЛОВАРЬ ПРЕПОДАВАТЕЛЯ (SKYENG / SKYSMART):
1. ОФИЦИАЛЬНАЯ ТЕРМИНОЛОГИЯ:
   - ИСПОЛЬЗУЙ ТОЛЬКО: «личный кабинет», «неуспешные уроки» (норма до 20%), «Teachers Care» (09:00-22:00 МСК), «Support» (круглосуточно, только техпроблемы).
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: «CRM», «брак», «буфер», «штрафной буфер».

2. 5 ОФИЦИАЛЬНЫХ СТАТУСОВ УРОКОВ (ДРУГИХ НЕ СУЩЕСТВУЕТ):
   1. «Урок состоялся»
   2. «Пропущен учеником»
   3. «Урок пропущен преподавателем»
   4. «Урок перенесен»
   5. «Урок отменен»
`;

// ============================================================================
// 3. SCENARIO ENUM
// ============================================================================
export const SCENARIOS = {
  STUDENT_LATE: 'student_late',
  STUDENT_ABSENCE: 'student_absence',
  STUDENT_CANCEL: 'student_cancel',
  TEACHER_LATE: 'teacher_late',
  TEACHER_CANCEL: 'teacher_cancel',
  TEACHER_EMERGENCY: 'teacher_emergency',
  BREAK_TEACHER: 'break_teacher',
  BREAK_STUDENT: 'break_student',
  STUDENT_CHURN: 'student_churn',
  ZERO_BALANCE: 'zero_balance',
  TECHNICAL_ISSUE: 'technical_issue',
  CORPORATE_B2B: 'corporate_b2b',
  GROUP_LESSON: 'group_lesson',
  PARALLEL_LESSON: 'parallel_lesson',
  FIRST_LESSON_ALOHA: 'first_lesson_aloha',
  PARENT_FEEDBACK: 'parent_feedback',
  EXAM_MOCK: 'exam_mock',
  PAYMENT_DISPUTE: 'payment_dispute',
  UNIVERSAL_CANCEL: 'universal_cancel',
  UNIVERSAL_LATE: 'universal_late',
  AMBIGUOUS_LESSON_ISSUE: 'ambiguous_lesson_issue',
  UNKNOWN: 'unknown'
};

// ============================================================================
// 4. DETERMINISTIC HARD POLICY DECISION ENGINE
// ============================================================================
export const HARD_POLICIES = {
  [SCENARIOS.UNIVERSAL_CANCEL]: {
    name: "Общие правила отмены занятий (Шпаргалка)",
    forbiddenScenarios: [],
    evaluate() {
      return {
        decision: "SHOW_UNIVERSAL_CANCELLATION_MATRIX",
        lessonStatus: "Зависит от инициатора",
        financialOutcome: "Зависит от инициатора и времени",
        studentMessageRequired: false,
        mustDo: [
          "ЕСЛИ ОТМЕНЯЕТ ПРЕПОДАВАТЕЛЬ:",
          " • За 24+ часа: без последствий (статус «Урок перенесен»).",
          " • Менее чем за 24 часа: урок идет в «Неуспешные уроки» (допустимая норма KPI — до 20%).",
          " • При форс-мажоре (свет/болезнь): срочно пишите в Teachers Care с подтверждением, чтобы снять урок без нарушений.",
          "ЕСЛИ ОТМЕНЯЕТ УЧЕНИК:",
          " • За 8+ часов (на тарифе Premium за 4+ ч): Бесплатная отмена, оплата вам не начисляется. Слот освобождается.",
          " • Менее 8 часов (Premium менее 4 ч): Поздняя отмена. Урок списывается с ученика, вам начисляется 100% оплата."
        ],
        forbiddenActions: ["Не выдумывайте несуществующих статусов."],
        sourceRule: "РЕГЛАМЕНТ_ОТМЕН_СТАТЬЯ_124_И_690"
      };
    }
  },

  [SCENARIOS.UNIVERSAL_LATE]: {
    name: "Общие правила опозданий (Шпаргалка)",
    forbiddenScenarios: [],
    evaluate() {
      return {
        decision: "SHOW_UNIVERSAL_LATE_MATRIX",
        lessonStatus: "Зависит от инициатора",
        financialOutcome: "Оплата начисляется в обоих случаях при проведении или 50 мин ожидания",
        studentMessageRequired: false,
        mustDo: [
          "ЕСЛИ ОПАЗДЫВАЕТ УЧЕНИК:",
          " • Ждите в классе ровно 50 минут от начала по расписанию. Напишите в чат на 5-й и 15-й минуте.",
          " • Если пришел: проведите остаток урока и закончите строго по расписанию. Статус: «Урок состоялся».",
          " • Если не пришел за 50 минут: выходите из класса. Статус: «Пропущен учеником» (100% оплата).",
          "ЕСЛИ ОПАЗДЫВАЕТ ПРЕПОДАВАТЕЛЬ:",
          " • Опоздание от 1 минуты — уже считается нарушением. Срочно зайдите и извинитесь.",
          " • Если опоздание > 5 минут: вам позвонит робот (нажмите 1, чтобы подтвердить готовность).",
          " • Проведите урок и обязательно компенсируйте пропущенные минуты (сейчас или на следующем занятии)."
        ],
        forbiddenActions: ["Запрещено уходить с урока раньше 50-й минуты ожидания ученика."],
        sourceRule: "РЕГЛАМЕНТ_ОПОЗДАНИЙ_СТАТЬЯ_129_И_1974"
      };
    }
  },

  [SCENARIOS.AMBIGUOUS_LESSON_ISSUE]: {
    name: "Действия при срыве урока (Шпаргалка)",
    forbiddenScenarios: [],
    evaluate() {
      return {
        decision: "SHOW_UNIVERSAL_RESCUE_MATRIX",
        lessonStatus: "Зависит от ситуации",
        financialOutcome: "Зависит от ситуации",
        studentMessageRequired: false,
        mustDo: [
          "ЕСЛИ ПРОИЗОШЛА ТЕХНИЧЕСКАЯ ПРОБЛЕМА:",
          " • Перейдите в резервный канал (Zoom/Skype/Meet). Если урок спасен — статус «Урок состоялся» (100% оплата).",
          " • Если платформа лежит и урок не состоялся — сделайте скриншот и напишите в Support.",
          "ЕСЛИ УЧЕНИК НЕ ВЫШЕЛ НА СВЯЗЬ:",
          " • Ждите 50 минут. Если не пришел — статус «Пропущен учеником» (оплата 100%).",
          "ЕСЛИ ФОРС-МАЖОР У ВАС (отключили свет / болезнь):",
          " • Срочно пишите в Teachers Care и предоставьте справку/акт для снятия урока без штрафов."
        ],
        forbiddenActions: ["Запрещено самостоятельно ставить статус «Отменен», если ученик не пришел."],
        sourceRule: "УНИВЕРСАЛЬНЫЙ_АЛГОРИТМ_СРЫВА_УРОКА"
      };
    }
  },

  [SCENARIOS.STUDENT_CHURN]: {
    name: "Уход ученика и лимиты набора (Статья 2118)",
    forbiddenScenarios: ['student_late', 'teacher_emergency'],
    evaluate() {
      return {
        decision: "WARN_CHURN_LIMITS",
        lessonStatus: "Уроки снимаются системой",
        financialOutcome: "Риск блокировки набора и потери доплат",
        studentMessageRequired: false,
        mustDo: [
          "В школе действуют жесткие лимиты на отток учеников по инициативе преподавателя или ученика:",
          " • Лимит ушедших на старте (1–4 урок): не более 2 учеников за 2 недели.",
          " • Лимит ушедших суммарно: не более 3 учеников за 2 недели.",
          " • Административная жалоба: даже 1 подтвержденная жалоба ведет к немедленной блокировке набора.",
          "ПРИ ПРЕВЫШЕНИИ ЛИМИТОВ: Ваш набор новых учеников блокируется на 14 дней, а повышающие коэффициенты к ставке сгорают.",
          "ИСКЛЮЧЕНИЯ (когда уход не вредит KPI): ученик ушел из-за несовпадения расписания (если вы предложили все открытые слоты) или неверно подобранного курса (уровень выше вашего или ОГЭ/ЕГЭ, которые вы не ведете)."
        ],
        forbiddenActions: [
          "Категорически запрещено говорить, что отказ от ученика не несет последствий."
        ],
        sourceRule: "КРИТЕРИИ_ДОСТУПНОСТИ_НАБОРА_СТАТЬЯ_2118"
      };
    }
  },

  [SCENARIOS.BREAK_TEACHER]: {
    name: "Перерыв и отпуск преподавателя (Матрица зон)",
    forbiddenScenarios: ['student_late', 'teacher_emergency'],
    evaluate() {
      return {
        decision: "SHOW_BREAK_MATRIX",
        lessonStatus: "Перерыв",
        financialOutcome: "Без штрафов только в зеленой зоне",
        studentMessageRequired: false,
        mustDo: [
          "🟢 ЗЕЛЕНАЯ ЗОНА (подача за 14+ дней / 336 ч): Абсолютно безопасно для набора и рейтинга.",
          "🟡 ЖЕЛТАЯ ЗОНА (подача за 3–14 дней): Даты менять в ЛК можно, но все удаленные уроки идут в «Неуспешные» (норма до 20%).",
          "🔴 КРАСНАЯ ЗОНА (менее 3 дней): Действия в ЛК заблокированы, отмена только через Teachers Care.",
          "НАКОПИТЕЛЬНЫЕ САНКЦИИ:",
          " • 3 поздних перерыва (< 14 дней) за 6 месяцев = закрытие набора и потеря доплат. 4+ нарушения = пересмотр сотрудничества.",
          " • 3 коротких перерыва (< 5 дней) за 30 дней (даже поданных вовремя) = снижение доступности набора.",
          "ПРАВИЛО 40 ДНЕЙ: Перерыв 40+ дней ведет к автоматическому приостановлению сотрудничества по инфобезопасности. Исключение — летние каникулы по школьным предметам (до 90 дней).",
          "💡 ЛАЙФХАК: Если вы не успели подать перерыв за 14 дней, но ученик согласен сам оформить отпуск через свою поддержку — ваши уроки снимаются без ущерба для метрик."
        ],
        forbiddenActions: [
          "Запрещено снимать слоты день-в-день в ЛК."
        ],
        sourceRule: "РЕГЛАМЕНТ_ПЕРЕРЫВА_ПРЕПОДАВАТЕЛЯ_СТАТЬЯ_708"
      };
    }
  },

  [SCENARIOS.STUDENT_LATE]: {
    name: "Опоздание ученика на урок",
    forbiddenScenarios: ['teacher_late', 'teacher_emergency', 'break_teacher', 'student_cancel', 'universal_cancel'],
    evaluate(facts = {}) {
      const minutes = facts.minutes || 0;
      if (minutes < 50) {
        return {
          decision: "CONDUCT_REMAINING_TIME",
          lessonStatus: "Урок продолжается (в процессе ожидания)",
          financialOutcome: "100% оплата ставки",
          studentMessageRequired: true,
          mustDo: [
            "Находитесь в классе до 50-й минуты от начала урока по расписанию.",
            "Напишите ученику/родителю в чат урока через 5 и 15 минут ожидания.",
            "Если ученик подключился — проведите урок в оставшееся время. Заканчивайте строго по расписанию.",
            "После урока выставьте статус «Урок состоялся» с комментарием об опоздании."
          ],
          forbiddenActions: ["Не выходите из класса раньше 50-й минуты."],
          sourceRule: "РЕГЛАМЕНТ_ОПОЗДАНИЯ_СТАТЬЯ_129"
        };
      } else {
        return {
          decision: "MARK_STUDENT_ABSENT",
          lessonStatus: "Пропущен учеником",
          financialOutcome: "100% оплата преподавателю (урок списывается с баланса ученика)",
          studentMessageRequired: false,
          mustDo: [
            "Ровно на 50-й минуте выйдите из класса.",
            "В личном кабинете выставьте статус «Пропущен учеником».",
            "Урок оплачивается в полном объеме."
          ],
          forbiddenActions: ["Не выставляйте статус «Урок отменен»."],
          sourceRule: "РЕГЛАМЕНТ_ПРОПУСКА_СТАТЬЯ_130"
        };
      }
    }
  },

  [SCENARIOS.STUDENT_ABSENCE]: {
    name: "Полная неявка ученика (пропуск урока)",
    forbiddenScenarios: ['teacher_emergency', 'teacher_late', 'break_teacher', 'student_cancel'],
    evaluate(facts = {}) {
      const consecutive = facts.consecutiveAbsences || 1;
      return {
        decision: consecutive >= 3 ? "REPORT_3RD_ABSENCE_TO_CARE" : "MARK_STUDENT_ABSENT",
        lessonStatus: "Пропущен учеником",
        financialOutcome: "100% оплата преподавателю",
        studentMessageRequired: consecutive < 3,
        mustDo: [
          "Ожидайте ученика в классе 50 минут. Затем ставьте статус «Пропущен учеником».",
          consecutive >= 3
            ? "Так как это 3-й пропуск подряд: напишите в Teachers Care для удаления графика ученика. Списывать более 3 уроков подряд как прогул запрещено!"
            : "Если ученик пропустил 2 урока подряд — вы ОБЯЗАНЫ выйти на 3-й урок по расписанию."
        ],
        forbiddenActions: ["Запрещено списывать 4-й урок подряд."],
        sourceRule: "РЕГЛАМЕНТ_ПРОПУСКОВ_ПОДРЯД_СТАТЬЯ_906"
      };
    }
  },

  [SCENARIOS.STUDENT_CANCEL]: {
    name: "Отмена или перенос урока учеником",
    forbiddenScenarios: ['teacher_emergency', 'break_teacher', 'teacher_late'],
    evaluate(facts = {}) {
      const isPremium = facts.isPremium || false;
      const minHours = isPremium ? 4 : 8;
      const hours = (facts.hoursBeforeLesson !== undefined && facts.hoursBeforeLesson !== null) ? facts.hoursBeforeLesson : minHours;

      if (hours >= minHours) {
        return {
          decision: "FREE_STUDENT_CANCELLATION",
          lessonStatus: "Урок отменен",
          financialOutcome: `Бесплатная отмена (в пределах лимита). Оплата не начисляется.`,
          studentMessageRequired: false,
          mustDo: [
            `Ученик на тарифе ${isPremium ? 'Premium' : 'Standard'} отменил урок за ${minHours}+ часов.`,
            "Слот освобождается для других занятий."
          ],
          forbiddenActions: ["Не требуйте списания с ученика за заблаговременную отмену."],
          sourceRule: "РЕГЛАМЕНТ_ОТМЕНЫ_УЧЕНИКОМ_СТАТЬЯ_690"
        };
      } else {
        return {
          decision: "LATE_STUDENT_CANCELLATION",
          lessonStatus: "Пропущен учеником",
          financialOutcome: "100% оплата преподавателю (урок списывается с баланса ученика)",
          studentMessageRequired: false,
          mustDo: [
            `Поздняя отмена (менее ${minHours} часов). Урок оплачивается преподавателю на 100%.`,
            "Находиться в классе во время отмененного урока не нужно."
          ],
          forbiddenActions: ["Не меняйте статус на бесплатную отмену без указания Teachers Care."],
          sourceRule: "РЕГЛАМЕНТ_ПОЗДНЕЙ_ОТМЕНЫ_СТАТЬЯ_690"
        };
      }
    }
  },

  [SCENARIOS.TEACHER_CANCEL]: {
    name: "Отмена или перенос урока преподавателем",
    forbiddenScenarios: ['student_late', 'student_absence'],
    evaluate(facts = {}) {
      const hours = facts.hoursBeforeLesson !== undefined && facts.hoursBeforeLesson !== null ? facts.hoursBeforeLesson : 24;
      if (hours >= 24) {
        return {
          decision: "TEACHER_ADVANCE_RESCHEDULE",
          lessonStatus: "Урок перенесен",
          financialOutcome: "Без штрафов",
          studentMessageRequired: true,
          mustDo: [
            "Вы отменяете/переносите урок не менее чем за 24 часа. Это безопасно.",
            "Согласуйте с учеником в чате новую дату."
          ],
          forbiddenActions: ["Не отменяйте уроки без предупреждения."],
          sourceRule: "РЕГЛАМЕНТ_ПЕРЕНОСА_ПРЕПОДАВАТЕЛЕМ_СТАТЬЯ_124"
        };
      } else {
        return {
          decision: "TEACHER_LATE_CANCELLATION_WARNING",
          lessonStatus: "Урок пропущен преподавателем",
          financialOutcome: "Урок идет в «Неуспешные уроки» (норма до 20%)",
          studentMessageRequired: true,
          mustDo: [
            "Перенос или отмена менее чем за 24 часа — это нарушение.",
            "Исключение: перенос на более раннее время в тот же день, если урок состоялся."
          ],
          forbiddenActions: ["Избегайте отмен день-в-день."],
          sourceRule: "КРИТЕРИИ_ДОСТУПНОСТИ_НАБОРА_СТАТЬЯ_2118"
        };
      }
    }
  },

  [SCENARIOS.TEACHER_LATE]: {
    name: "Опоздание преподавателя на урок",
    forbiddenScenarios: ['student_late', 'student_absence', 'break_teacher'],
    evaluate(facts = {}) {
      return {
        decision: "CONNECT_AND_HANDLE_BOT_CALL",
        lessonStatus: "Урок состоялся",
        financialOutcome: "Оплата 100% при проведении урока",
        studentMessageRequired: true,
        mustDo: [
          "Срочно зайдите в класс и извинитесь.",
          "При опоздании более 5 минут вам позвонит робот-помощник (нажмите 1).",
          "Скомпенсируйте пропущенные минуты ученику."
        ],
        forbiddenActions: ["Не игнорируйте звонки робота-помощника."],
        sourceRule: "РЕГЛАМЕНТ_РОБОТА_ПОМОЩНИКА_СТАТЬЯ_1974"
      };
    }
  },

  [SCENARIOS.TEACHER_EMERGENCY]: {
    name: "Форс-мажор у преподавателя",
    forbiddenScenarios: ['student_late', 'student_absence', 'break_teacher'],
    evaluate() {
      return {
        decision: "REPORT_TO_TEACHERS_CARE_URGENT",
        lessonStatus: "Урок перенесен / отменен",
        financialOutcome: "Без штрафа при подтверждении",
        studentMessageRequired: true,
        mustDo: [
          "Срочно напишите в Teachers Care.",
          "Отправьте предупреждение ученику.",
          "Предоставьте справку/акт для снятия урока без нарушений KPI."
        ],
        forbiddenActions: ["Запрещено молча отменять уроки без оповещения."],
        sourceRule: "РЕГЛАМЕНТ_ФОРС_МАЖОРА_СТАТЬЯ_166"
      };
    }
  },

  [SCENARIOS.TECHNICAL_ISSUE]: {
    name: "Технические неполадки на платформе",
    forbiddenScenarios: ['student_cancel', 'break_teacher'],
    evaluate() {
      return {
        decision: "RESCUE_LESSON_BACKUP_PLATFORM",
        lessonStatus: "Урок состоялся (при спасении)",
        financialOutcome: "100% оплата при спасении",
        studentMessageRequired: true,
        mustDo: [
          "Перейдите в резервную видеосвязь (Zoom/Meet/Skype).",
          "Если платформа лежит и спасти не удалось — сделайте скриншот и напишите в Support."
        ],
        forbiddenActions: ["Не завершайте урок без попытки спасти его в Zoom."],
        sourceRule: "СПАСЕНИЕ_УРОКА_СТАТЬЯ_508"
      };
    }
  },

  [SCENARIOS.ZERO_BALANCE]: {
    name: "Нулевой баланс ученика",
    forbiddenScenarios: ['student_late'],
    evaluate() {
      return {
        decision: "DO_NOT_CONDUCT_LESSON",
        lessonStatus: "Урок удаляется",
        financialOutcome: "Запрещено проводить уроки в долг",
        studentMessageRequired: true,
        mustDo: [
          "За 8+ часов вежливо напомните о пополнении баланса.",
          "Менее чем за 8 часов: система автоматически удалит урок за 5–10 минут до начала.",
          "Если баланс нулевой 14 дней — график удаляется."
        ],
        forbiddenActions: ["Запрещено проводить уроки при 0 балансе."],
        sourceRule: "РЕГЛАМЕНТ_НУЛЕВОГО_БАЛАНСА_СТАТЬЯ_244"
      };
    }
  },
  
  [SCENARIOS.BREAK_STUDENT]: {
    name: "Перерыв ученика",
    forbiddenScenarios: ['teacher_emergency', 'student_late'],
    evaluate() {
      return {
        decision: "CHECK_STUDENT_BREAK_LIMITS",
        lessonStatus: "Перерыв ученика",
        financialOutcome: "График сохраняется при перерыве до 21 дня",
        studentMessageRequired: false,
        mustDo: [
          "График сохраняется, если перерыв длится не более 21 дня и на балансе есть минимум 1 урок.",
          "Если перерыв более 21 дня или баланс 0 — график ученика удаляется."
        ],
        forbiddenActions: ["Не удаляйте график вручную до 21 дня."],
        sourceRule: "РЕГЛАМЕНТ_ПЕРЕРЫВА_УЧЕНИКА_СТАТЬЯ_691"
      };
    }
  },

  [SCENARIOS.CORPORATE_B2B]: {
    name: "Корпоративные ученики (B2B)",
    forbiddenScenarios: ['student_late', 'teacher_emergency'],
    evaluate() {
      return {
        decision: "STRICT_B2B_CURRICULUM_COMPLIANCE",
        lessonStatus: "Корпоративный урок",
        financialOutcome: "Оплата по тарифу B2B",
        studentMessageRequired: false,
        mustDo: [
          "Строгое прохождение курса. Самовольно менять курс/уровень запрещено.",
          "Домашние задания и тесты строго обязательны.",
          "Если на урок вышел чужой человек — немедленно пишите в Teachers Care."
        ],
        forbiddenActions: ["Запрещено пропускать контрольные тесты B2B."],
        sourceRule: "РЕГЛАМЕНТ_КОРПОРАТИВНЫХ_УЧЕНИКОВ_СТАТЬЯ_1083"
      };
    }
  },

  [SCENARIOS.GROUP_LESSON]: {
    name: "Групповые уроки (F2G)",
    forbiddenScenarios: ['break_teacher'],
    evaluate() {
      return {
        decision: "CONDUCT_GROUP_IF_AT_LEAST_ONE",
        lessonStatus: "Урок состоялся",
        financialOutcome: "100% оплата при 1+ ученике",
        studentMessageRequired: false,
        mustDo: [
          "Урок проводится, если подключился хотя бы 1 ученик.",
          "Если не пришел никто — дежурьте 50 минут. Статус: «Пропущен группой».",
          "Ручных переносов в группах нет — только через кураторов."
        ],
        forbiddenActions: ["Не отменяйте урок из-за неполной группы."],
        sourceRule: "РЕГЛАМЕНТ_ГРУППОВЫХ_УРОКОВ_СТАТЬЯ_1532"
      };
    }
  },

  [SCENARIOS.PARALLEL_LESSON]: {
    name: "Параллельные уроки",
    forbiddenScenarios: ['student_late'],
    evaluate() {
      return {
        decision: "MAINTAIN_TET_A_TET_INTERVALS",
        lessonStatus: "Параллельный блок",
        financialOutcome: "Оплата за поток",
        studentMessageRequired: false,
        mustDo: [
          "Минимум 3 подключения тет-а-тет к каждому ученику за 50 минут.",
          "Не оставляйте ученика без внимания дольше 15 минут.",
          "Реагируйте на поднятую руку в течение 3–5 минут."
        ],
        forbiddenActions: ["Не игнорируйте поднятые руки."],
        sourceRule: "РЕГЛАМЕНТ_ПАРАЛЛЕЛЬНЫХ_УРОКОВ_СТАТЬЯ_829"
      };
    }
  },

  [SCENARIOS.FIRST_LESSON_ALOHA]: {
    name: "Первый урок Aloha 3.0",
    forbiddenScenarios: ['teacher_cancel'],
    evaluate() {
      return {
        decision: "FOLLOW_ALOHA_STRUCTURE",
        lessonStatus: "Урок состоялся",
        financialOutcome: "Влияет на конверсию и KPI",
        studentMessageRequired: true,
        mustDo: [
          "Отправьте приветствие за 24 часа.",
          "Соблюдайте этапы: Знакомство -> Цели -> Калибровка -> План -> ДЗ."
        ],
        forbiddenActions: ["Запрещено переносить первые уроки по своей инициативе."],
        sourceRule: "СТАНДАРТ_ПЕРВОГО_УРОКА_СТАТЬЯ_1350"
      };
    }
  },

  [SCENARIOS.PARENT_FEEDBACK]: {
    name: "Обратная связь родителям (One-Page)",
    forbiddenScenarios: [],
    evaluate() {
      return {
        decision: "SEND_ONE_PAGE_REPORT_20_DAYS",
        lessonStatus: "Педагогический отчет",
        financialOutcome: "Влияет на лояльность",
        studentMessageRequired: true,
        mustDo: [
          "Письменный отчет каждые 20 дней (после 4+ уроков).",
          "5 блоков: Прогресс -> Зона роста -> План -> Совет -> Напутствие."
        ],
        forbiddenActions: ["Запрещена критика ребенка без позитивного подкрепления."],
        sourceRule: "ОБРАТНАЯ_СВЯЗЬ_СТАТЬЯ_509"
      };
    }
  },

  [SCENARIOS.EXAM_MOCK]: {
    name: "Пробники ОГЭ / ЕГЭ",
    forbiddenScenarios: [],
    evaluate() {
      return {
        decision: "CHECK_MOCK_WITHIN_96H",
        lessonStatus: "Проверка пробника",
        financialOutcome: "300 руб. за проверку",
        studentMessageRequired: false,
        mustDo: [
          "Проверьте развернутую часть в течение 4 суток (96 часов).",
          "Оставьте критериальный комментарий по шкале ФИПИ."
        ],
        forbiddenActions: ["Не задерживайте проверку дольше 96 часов."],
        sourceRule: "РЕГЛАМЕНТ_ПРОБНИКОВ_СТАТЬЯ_820"
      };
    }
  },

  [SCENARIOS.PAYMENT_DISPUTE]: {
    name: "Вопросы выплат",
    forbiddenScenarios: ['student_late', 'teacher_emergency'],
    evaluate() {
      return {
        decision: "CHECK_BIWEEKLY_PAYOUT_SCHEDULE",
        lessonStatus: "Финансовый аудит",
        financialOutcome: "Выплата каждые 2 недели",
        studentMessageRequired: false,
        mustDo: [
          "Сверьте начисления в разделе «Баланс и выплаты».",
          "По финансовым вопросам обращайтесь в финансовую поддержку (будни 09:00–18:00)."
        ],
        forbiddenActions: ["Категорически запрещено обсуждать ставки с учениками."],
        sourceRule: "ВЫПЛАТЫ_СТАТЬЯ_413"
      };
    }
  }
};

export function getScopedScenarioRules(queryText = "") {
  return PLATFORM_GOLD_STANDARD;
}
