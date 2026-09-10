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
// 2. PLATFORM GOLD STANDARD & MANDATORY LEXICON
// ============================================================================
export const PLATFORM_GOLD_STANDARD = `
ЗОЛОТОЙ СТАНДАРТ И СЛОВАРЬ ПРЕПОДАВАТЕЛЯ (SKYENG / SKYSMART):
1. ТЕРМИНОЛОГИЯ (КРИТИЧНО):
   - ИСПОЛЬЗУЙ ТОЛЬКО: «личный кабинет», «неуспешные уроки», «допустимый порог до 20%», «Teachers Care», «Mattermost (MMT)».
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: «CRM», «брак», «буфер», «штрафной буфер», «штрафная сетка».

2. БАЗОВЫЕ АКСИОМЫ ПЛАТФОРМЫ:
   - Правило 50 минут: Преподаватель обязан находиться в виртуальном классе ровно 50 минут при любом опоздании ученика.
   - Оплата неявки: Если ученик не явился за 50 минут, преподавателю начисляется 100% оплата, статус урока — «Ученик не пришел».
   - Правило 8 часов: Ученик может бесплатно отменить/перенести урок не позднее чем за 8 часов до начала. При отмене менее чем за 8 часов урок оплачивается преподавателю на 100%.
   - Зеленая зона расписания: Отпуска и регулярные перерывы открываются не менее чем за 72 часа.
   - Форс-мажор: Любые ЧП (отключение света, болезнь, эвакуация) фиксируются через дежурных в Mattermost / Teachers Care с последующим предоставлением подтверждения без потери KPI.
`;

// ============================================================================
// 3. SCENARIO ENUM
// ============================================================================
export const SCENARIOS = {
  STUDENT_LATE: 'student_late',
  STUDENT_ABSENCE: 'student_absence',
  STUDENT_CANCEL: 'student_cancel',
  TEACHER_LATE: 'teacher_late',
  TEACHER_EMERGENCY: 'teacher_emergency',
  BREAK_SCHEDULE: 'break_schedule',
  CHANGE_TEACHER: 'change_teacher',
  TECHNICAL_ISSUE: 'technical_issue',
  PAYMENT_DISPUTE: 'payment_dispute',
  CONSECUTIVE_LESSONS: 'consecutive_lessons',
  GROUP_LESSON: 'group_lesson',
  NEED_CLARIFICATION: 'need_clarification',
  UNKNOWN: 'unknown'
};

// ============================================================================
// 4. DETERMINISTIC HARD POLICY DECISION ENGINE
// ============================================================================
export const HARD_POLICIES = {
  [SCENARIOS.STUDENT_LATE]: {
    name: "Опоздание ученика на урок",
    forbiddenScenarios: ['teacher_late', 'teacher_emergency', 'break_schedule', 'student_cancel', 'consecutive_lessons'],
    evaluate(facts = {}) {
      const minutes = facts.minutes || 0;
      if (minutes < 50) {
        return {
          decision: "WAIT_IN_CLASSROOM",
          lessonStatus: "Урок продолжается (в процессе ожидания)",
          financialOutcome: "100% оплата ставки преподавателю за проведенный урок / ожидание",
          studentMessageRequired: true,
          mustDo: [
            "Преподаватель обязан находиться в виртуальном классе / на видеосвязи ровно 50 минут от официального начала урока.",
            "Отправить сообщение ученику/родителю в чат урока через 5 минут и повторно через 15 минут ожидания.",
            "Если ученик подключится (например, на 10-й, 25-й или 40-й минуте) — провести занятие в оставшееся от 50 минут время без претензий."
          ],
          forbiddenActions: [
            "Категорически запрещено выходить из виртуального класса раньше 50-й минуты.",
            "Запрещено самостоятельно выставлять статус 'Отменен преподавателем' или самовольно переносить урок."
          ],
          sourceRule: "РЕГЛАМЕНТ_ОЖИДАНИЯ_50_МИНУТ"
        };
      } else {
        return {
          decision: "MARK_STUDENT_ABSENT",
          lessonStatus: "Ученик не пришел",
          financialOutcome: "100% оплата преподавателю (урок списывается с баланса ученика)",
          studentMessageRequired: false,
          mustDo: [
            "Ровно на 50-й минуте ожидания зафиксировать окончание урока.",
            "В личном кабинете выставить статус «Ученик не пришел».",
            "Урок считается успешно закрытым, вознаграждение начисляется автоматически в полном объеме."
          ],
          forbiddenActions: [
            "Запрещено ставить статус «Отменен» или «Технический сбой».",
            "Запрещено переносить урок день-в-день без предварительного согласования с поддержкой."
          ],
          sourceRule: "РЕГЛАМЕНТ_НЕЯВКИ_УЧЕНИКА"
        };
      }
    }
  },

  [SCENARIOS.STUDENT_ABSENCE]: {
    name: "Полная неявка ученика (пропуск урока)",
    forbiddenScenarios: ['teacher_emergency', 'teacher_late', 'break_schedule', 'student_cancel'],
    evaluate() {
      return {
        decision: "MARK_STUDENT_ABSENT",
        lessonStatus: "Ученик не пришел",
        financialOutcome: "100% оплата преподавателю",
        studentMessageRequired: false,
        mustDo: [
          "Ожидать ученика в классе до истечения 50 минут от начала урока.",
          "В 50 минут выставить статус «Ученик не пришел» в личном кабинете.",
          "Зафиксировать тему урока в журнале как пропущенную для дальнейшего прохождения."
        ],
        forbiddenActions: [
          "Не покидать класс раньше 50 минут.",
          "Не отменять урок по инициативе преподавателя."
        ],
        sourceRule: "РЕГЛАМЕНТ_НЕЯВКИ_УЧЕНИКА"
      };
    }
  },

  [SCENARIOS.STUDENT_CANCEL]: {
    name: "Отмена или перенос занятия учеником",
    forbiddenScenarios: ['teacher_emergency', 'break_schedule', 'teacher_late'],
    evaluate(facts = {}) {
      const hours = (facts.hoursBeforeLesson !== undefined && facts.hoursBeforeLesson !== null)
        ? facts.hoursBeforeLesson
        : 8;

      if (hours >= 8) {
        return {
          decision: "FREE_STUDENT_CANCELLATION",
          lessonStatus: "Отменен учеником (заблаговременно)",
          financialOutcome: "Урок отменен бесплатно для ученика, оплата преподавателю не начисляется",
          studentMessageRequired: false,
          mustDo: [
            "Ученик имеет регламентное право отменить занятие за 8 и более часов до старта.",
            "Слот в расписании освобождается и становится доступным для других учеников."
          ],
          forbiddenActions: [
            "Не требовать оплаты или компенсации за заблаговременную отмену (8+ часов)."
          ],
          sourceRule: "РЕГЛАМЕНТ_ОТМЕНЫ_8_ЧАСОВ"
        };
      } else {
        return {
          decision: "LATE_STUDENT_CANCELLATION",
          lessonStatus: "Отменен учеником менее чем за 8 часов",
          financialOutcome: "100% оплата преподавателю (списание с баланса ученика)",
          studentMessageRequired: false,
          mustDo: [
            "При отмене учеником менее чем за 8 часов система автоматически списывает урок с ученика и начисляет 100% вознаграждения преподавателю.",
            "Преподаватель не обязан дежурить в виртуальном классе во время отмененного урока."
          ],
          forbiddenActions: [
            "Не менять статус на бесплатную отмену без прямого распоряжения Teachers Care."
          ],
          sourceRule: "РЕГЛАМЕНТ_ПОЗДНЕЙ_ОТМЕНЫ_УЧЕНИКОМ"
        };
      }
    }
  },

  [SCENARIOS.TEACHER_EMERGENCY]: {
    name: "Форс-мажор у преподавателя (отключение электричества, болезнь, эвакуация)",
    forbiddenScenarios: ['student_late', 'student_absence', 'break_schedule', 'change_teacher'],
    evaluate() {
      return {
        decision: "REPORT_TO_TEACHERS_CARE",
        lessonStatus: "Отмена по форс-мажору",
        financialOutcome: "Без штрафов и без ухудшения показателей качества при своевременном подтверждении",
        studentMessageRequired: true,
        mustDo: [
          "Немедленно написать дежурным в Mattermost (MMT) или в чат поддержки Teachers Care с описанием ситуации.",
          "Если сохраняется мобильная связь — отправить краткое предупреждающее сообщение ученику/родителю.",
          "Предоставить подтверждающий документ (справку от врача, скриншот/акт об аварии от интернет/электро-провайдера) в службу заботы в установленный регламентом срок."
        ],
        forbiddenActions: [
          "Категорически запрещено отменять уроки молча без оповещения поддержки Teachers Care.",
          "Запрещено самовольно закрывать будущие слоты без уведомления координаторов."
        ],
        sourceRule: "РЕГЛАМЕНТ_ФОРС_МАЖОРА_ПРЕПОДАВАТЕЛЯ"
      };
    }
  },

  [SCENARIOS.TEACHER_LATE]: {
    name: "Опоздание преподавателя на урок",
    forbiddenScenarios: ['student_late', 'student_absence', 'break_schedule'],
    evaluate(facts = {}) {
      const minutes = facts.minutes || 5;
      return {
        decision: "CONNECT_AND_COMPENSATE",
        lessonStatus: "Урок проведен с опозданием",
        financialOutcome: "Оплата начисляется в полном объеме при условии компенсации пропущенного времени",
        studentMessageRequired: true,
        mustDo: [
          "Срочно подключиться к виртуальному классу и принести вежливые извинения ученику.",
          `Продлить урок на время опоздания (${minutes} мин.) с согласия ученика.`,
          "Если ученик торопится и не может продлить текущий урок — зафиксировать долг по времени и компенсировать минуты на следующем уроке."
        ],
        forbiddenActions: [
          "Запрещено завершать урок раньше положенного суммарного времени (50 минут чистого занятия)."
        ],
        sourceRule: "РЕГЛАМЕНТ_ОПОЗДАНИЯ_ПРЕПОДАВАТЕЛЯ"
      };
    }
  },

  [SCENARIOS.BREAK_SCHEDULE]: {
    name: "Перерыв в расписании, отпуск и выходные дни",
    forbiddenScenarios: ['student_late', 'teacher_emergency', 'teacher_late'],
    evaluate() {
      return {
        decision: "CHECK_GREEN_ZONE_72H",
        lessonStatus: "Отпуск / Перерыв в расписании",
        financialOutcome: "Без штрафов и списаний при соблюдении регламентных зон",
        studentMessageRequired: false,
        mustDo: [
          "Оформлять перерывы и отпуска в расписании через личный кабинет строго в 'зеленой зоне' (не менее чем за 72 часа до слота).",
          "При отпуске длительностью более 14 дней система автоматически инициирует подбор временных замен для регулярных учеников.",
          "Заранее предупредить постоянных учеников о датах вашего отсутствия и возвращения к урокам."
        ],
        forbiddenActions: [
          "Запрещено снимать регулярные слоты и удалять уроки день-в-день через личный кабинет (красная зона)."
        ],
        sourceRule: "РЕГЛАМЕНТ_ПЕРЕРЫВОВ_И_ОТПУСКОВ"
      };
    }
  },

  [SCENARIOS.CHANGE_TEACHER]: {
    name: "Смена преподавателя по инициативе ученика или преподавателя",
    forbiddenScenarios: ['student_late', 'teacher_emergency'],
    evaluate() {
      return {
        decision: "TRANSFER_PUPIL_WITHOUT_PENALTY",
        lessonStatus: "Ученик передан на замену",
        financialOutcome: "Без штрафов. Допустимый порог неуспешных уроков и смен учеников — до 20%",
        studentMessageRequired: false,
        mustDo: [
          "Зафиксировать запрос ученика на смену в личном кабинете без споров и конфликтов.",
          "Оставить подробный комментарий в карточке ученика по пройденным материалам, сильным и слабым сторонам для нового преподавателя.",
          "Контролировать общий процент смен и неуспешных уроков (норма платформы — не более 20%)."
        ],
        forbiddenActions: [
          "Запрещено вступать в пререкания с клиентом или препятствовать передаче ученика."
        ],
        sourceRule: "РЕГЛАМЕНТ_СМЕНЫ_ПРЕПОДАВАТЕЛЯ"
      };
    }
  },

  [SCENARIOS.TECHNICAL_ISSUE]: {
    name: "Технические неполадки на платформе или у провайдера",
    forbiddenScenarios: ['student_cancel', 'break_schedule'],
    evaluate() {
      return {
        decision: "DIAGNOSE_AND_REPORT",
        lessonStatus: "Технический сбой платформы",
        financialOutcome: "Урок оплачивается преподавателю при подтверждении сбоя со стороны платформы",
        studentMessageRequired: true,
        mustDo: [
          "Проверить работу класса в режиме инкогнито и перезагрузить браузер (рекомендуется Google Chrome / Яндекс.Браузер).",
          "Сделать полный снимок экрана (скриншот) с кодом ошибки и консолью разработчика.",
          "Написать дежурным в Teachers Care / Mattermost и продублировать связь с учеником через резервный канал."
        ],
        forbiddenActions: [
          "Не закрывать урок самовольно без обращения в техническую поддержку."
        ],
        sourceRule: "РЕГЛАМЕНТ_ТЕХНИЧЕСКИХ_СБОЕВ"
      };
    }
  },

  [SCENARIOS.PAYMENT_DISPUTE]: {
    name: "Вопросы выплат, расчетных периодов и вознаграждения",
    forbiddenScenarios: ['student_late', 'teacher_emergency'],
    evaluate() {
      return {
        decision: "CHECK_PAYMENT_SCHEDULE",
        lessonStatus: "Финансовый аудит",
        financialOutcome: "Выплата производится в соответствии с утвержденным графиком школы",
        studentMessageRequired: false,
        mustDo: [
          "Сверить начисления в детализации баланса в личном кабинете преподавателя.",
          "Проверить статус подписания акта выполненных работ и привязку платежного сервиса (Банк 131 / Рокет Ворк).",
          "При обнаружении неточностей составить обращение в финансовый отдел через форму в личном кабинете."
        ],
        forbiddenActions: [
          "Категорически запрещено обсуждать ставки, выплаты и финансовые взаимоотношения школы с учениками."
        ],
        sourceRule: "РЕГЛАМЕНТ_ВЫПЛАТ_ВОЗНАГРАЖДЕНИЯ"
      };
    }
  },

  [SCENARIOS.CONSECUTIVE_LESSONS]: {
    name: "Два урока подряд с одним учеником",
    forbiddenScenarios: ['break_schedule'],
    evaluate(facts = {}) {
      const minutes = facts.minutes || 0;
      return {
        decision: "TREAT_AS_SEPARATE_SESSIONS",
        lessonStatus: "Спаренные уроки",
        financialOutcome: "Каждый урок рассчитывается как независимая академическая единица",
        studentMessageRequired: minutes < 50,
        mustDo: [
          "Оба урока считаются самостоятельными занятиями со своими 50-минутными окнами ожидания.",
          "Если ученик не пришел на первый урок — ждать до 50-й минуты, ставить «Ученик не пришел», затем ждать начало второго урока.",
          "За каждый неявившийся урок начисляется полная ставка при соблюдении 50 минут ожидания в каждом."
        ],
        forbiddenActions: [
          "Запрещено уходить со второго урока, даже если ученик пропустил первый, без дежурства положенные 50 минут на втором уроке."
        ],
        sourceRule: "РЕГЛАМЕНТ_СПАРЕННЫХ_УРОКОВ"
      };
    }
  },

  [SCENARIOS.GROUP_LESSON]: {
    name: "Групповые занятия / Skysmart Класс",
    forbiddenScenarios: ['break_schedule'],
    evaluate() {
      return {
        decision: "CONDUCT_IF_AT_LEAST_ONE",
        lessonStatus: "Групповой урок",
        financialOutcome: "Оплата начисляется по тарифу группового занятия",
        studentMessageRequired: false,
        mustDo: [
          "Урок проводится, если на встречу подключился хотя бы 1 ученик из группы.",
          "Если не подключился никто — ждать 50 минут и зафиксировать неявку группы."
        ],
        forbiddenActions: ["Не отменять групповой урок из-за отсутствия части учеников."],
        sourceRule: "РЕГЛАМЕНТ_ГРУППОВЫХ_УРОКОВ"
      };
    }
  },

  [SCENARIOS.NEED_CLARIFICATION]: {
    name: "Требуется уточнение деталей ситуации",
    forbiddenScenarios: [],
    evaluate() {
      return {
        decision: "REQUEST_MORE_DETAILS",
        lessonStatus: "Ожидает уточнения",
        financialOutcome: "Зависит от конкретной причины и стороны отмены",
        studentMessageRequired: false,
        mustDo: [
          "Уточнить у преподавателя: кто именно отменяет/опаздывает (ученик или учитель).",
          "Уточнить сколько времени прошло от начала урока или сколько часов осталось до старта."
        ],
        forbiddenActions: ["Не давать категоричных рекомендаций до выяснения роли и тайминга."],
        sourceRule: "УТОЧНЕНИЕ_ПАРАМЕТРОВ_СИТУАЦИИ"
      };
    }
  }
};

export function getScopedScenarioRules(queryText = "") {
  return PLATFORM_GOLD_STANDARD;
}  STUDENT_CANCEL: 'student_cancel',
  TEACHER_LATE: 'teacher_late',
  TEACHER_EMERGENCY: 'teacher_emergency',
  BREAK_SCHEDULE: 'break_schedule',
  CHANGE_TEACHER: 'change_teacher',
  TECHNICAL_ISSUE: 'technical_issue',
  PAYMENT_DISPUTE: 'payment_dispute',
  CONSECUTIVE_LESSONS: 'consecutive_lessons',
  GROUP_LESSON: 'group_lesson',
  NEED_CLARIFICATION: 'need_clarification',
  UNKNOWN: 'unknown'
};

// ============================================================================
// 4. DETERMINISTIC HARD POLICY DECISION ENGINE
// ============================================================================
export const HARD_POLICIES = {
  [SCENARIOS.STUDENT_LATE]: {
    name: "Опоздание ученика на урок",
    forbiddenScenarios: ['teacher_late', 'teacher_emergency', 'break_schedule', 'student_cancel', 'consecutive_lessons'],
    evaluate(facts) {
      const minutes = facts.minutes || 0;
      if (minutes < 50) {
        return {
          decision: "WAIT_IN_CLASSROOM",
          lessonStatus: "Урок продолжается (в процессе ожидания)",
          financialOutcome: "100% оплата ставки преподавателю за проведенный урок / ожидание",
          studentMessageRequired: true,
          mustDo: [
            "Преподаватель обязан находиться в виртуальном классе / на видеосвязи ровно 50 минут от официального начала урока.",
            "Отправить сообщение ученику/родителю в чат урока через 5 минут и повторно через 15 минут ожидания.",
            "Если ученик подключится (например, на 10-й, 25-й или 40-й минуте) — провести занятие в оставшееся от 50 минут время без претензий."
          ],
          forbiddenActions: [
            "Категорически запрещено выходить из виртуального класса раньше 50-й минуты.",
            "Запрещено самостоятельно выставлять статус 'Отменен преподавателем' или самовольно переносить урок."
          ],
          sourceRule: "РЕГЛАМЕНТ_ОЖИДАНИЯ_50_МИНУТ"
        };
      } else {
        return {
          decision: "MARK_STUDENT_ABSENT",
          lessonStatus: "Ученик не пришел",
          financialOutcome: "100% оплата преподавателю (урок списывается с баланса ученика)",
          studentMessageRequired: false,
          mustDo: [
            "Ровно на 50-й минуте ожидания зафиксировать окончание урока.",
            "В личном кабинете выставить статус «Ученик не пришел».",
            "Урок считается успешно закрытым, вознаграждение начисляется автоматически в полном объеме."
          ],
          forbiddenActions: [
            "Запрещено ставить статус «Отменен» или «Технический сбой».",
            "Запрещено переносить урок день-в-день без предварительного согласования с поддержкой."
          ],
          sourceRule: "РЕГЛАМЕНТ_НЕЯВКИ_УЧЕНИКА"
        };
      }
    }
  },

  [SCENARIOS.STUDENT_ABSENCE]: {
    name: "Полная неявка ученика (пропуск урока)",
    forbiddenScenarios: ['teacher_emergency', 'teacher_late', 'break_schedule', 'student_cancel'],
    evaluate() {
      return {
        decision: "MARK_STUDENT_ABSENT",
        lessonStatus: "Ученик не пришел",
        financialOutcome: "100% оплата преподавателю",
        studentMessageRequired: false,
        mustDo: [
          "Ожидать ученика в классе до истечения 50 минут от начала урока.",
          "В 50 минут выставить статус «Ученик не пришел» в личном кабинете.",
          "Зафиксировать тему урока в журнале как пропущенную для дальнейшего прохождения."
        ],
        forbiddenActions: [
          "Не покидать класс раньше 50 минут.",
          "Не отменять урок по инициативе преподавателя."
        ],
        sourceRule: "РЕГЛАМЕНТ_НЕЯВКИ_УЧЕНИКА"
      };
    }
  },

  [SCENARIOS.STUDENT_CANCEL]: {
    name: "Отмена или перенос занятия учеником",
    forbiddenScenarios: ['teacher_emergency', 'break_schedule', 'teacher_late'],
    evaluate(facts) {
      const hours = facts.hoursBeforeLesson !== null ? facts.hoursBeforeLesson : 8;
      if (hours >= 8) {
        return {
          decision: "FREE_STUDENT_CANCELLATION",
          lessonStatus: "Отменен учеником (заблаговременно)",
          financialOutcome: "Урок отменен бесплатно для ученика, оплата преподавателю не начисляется",
          studentMessageRequired: false,
          mustDo: [
            "Ученик имеет регламентное право отменить занятие за 8 и более часов до старта.",
            "Слот в расписании освобождается и становится доступным для других учеников."
          ],
          forbiddenActions: [
            "Не требовать оплаты или компенсации за заблаговременную отмену (8+ часов)."
          ],
          sourceRule: "РЕГЛАМЕНТ_ОТМЕНЫ_8_ЧАСОВ"
        };
      } else {
        return {
          decision: "LATE_STUDENT_CANCELLATION",
          lessonStatus: "Отменен учеником менее чем за 8 часов",
          financialOutcome: "100% оплата преподавателю (списание с баланса ученика)",
          studentMessageRequired: false,
          mustDo: [
            "При отмене учеником менее чем за 8 часов система автоматически списывает урок с ученика и начисляет 100% вознаграждения преподавателю.",
            "Преподаватель не обязан дежурить в виртуальном классе во время отмененного урока."
          ],
          forbiddenActions: [
            "Не менять статус на бесплатную отмену без прямого распоряжения Teachers Care."
          ],
          sourceRule: "РЕГЛАМЕНТ_ПОЗДНЕЙ_ОТМЕНЫ_УЧЕНИКОМ"
        };
      }
    }
  },

  [SCENARIOS.TEACHER_EMERGENCY]: {
    name: "Форс-мажор у преподавателя (отключение электричества, болезнь, эвакуация)",
    forbiddenScenarios: ['student_late', 'student_absence', 'break_schedule', 'change_teacher'],
    evaluate() {
      return {
        decision: "REPORT_TO_TEACHERS_CARE",
        lessonStatus: "Отмена по форс-мажору",
        financialOutcome: "Без штрафов и без ухудшения показателей качества при своевременном подтверждении",
        studentMessageRequired: true,
        mustDo: [
          "Немедленно написать дежурным в Mattermost (MMT) или в чат поддержки Teachers Care с описанием ситуации.",
          "Если сохраняется мобильная связь — отправить краткое предупреждающее сообщение ученику/родителю.",
          "Предоставить подтверждающий документ (справку от врача, скриншот/акт об аварии от интернет/электро-провайдера) в службу заботы в установленный регламентом срок."
        ],
        forbiddenActions: [
          "Категорически запрещено отменять уроки молча без оповещения поддержки Teachers Care.",
          "Запрещено самовольно закрывать будущие слоты без уведомления координаторов."
        ],
        sourceRule: "РЕГЛАМЕНТ_ФОРС_МАЖОРА_ПРЕПОДАВАТЕЛЯ"
      };
    }
  },

  [SCENARIOS.TEACHER_LATE]: {
    name: "Опоздание преподавателя на урок",
    forbiddenScenarios: ['student_late', 'student_absence', 'break_schedule'],
    evaluate(facts) {
      const minutes = facts.minutes || 5;
      return {
        decision: "CONNECT_AND_COMPENSATE",
        lessonStatus: "Урок проведен с опозданием",
        financialOutcome: "Оплата начисляется в полном объеме при условии компенсации пропущенного времени",
        studentMessageRequired: true,
        mustDo: [
          "Срочно подключиться к виртуальному классу и принести вежливые извинения ученику.",
          `Продлить урок на время опоздания (${minutes} мин.) с согласия ученика.`,
          "Если ученик торопится и не может продлить текущий урок — зафиксировать долг по времени и компенсировать минуты на следующем уроке."
        ],
        forbiddenActions: [
          "Запрещено завершать урок раньше положенного суммарного времени (50 минут чистого занятия)."
        ],
        sourceRule: "РЕГЛАМЕНТ_ОПОЗДАНИЯ_ПРЕПОДАВАТЕЛЯ"
      };
    }
  },

  [SCENARIOS.BREAK_SCHEDULE]: {
    name: "Перерыв в расписании, отпуск и выходные дни",
    forbiddenScenarios: ['student_late', 'teacher_emergency', 'teacher_late'],
    evaluate() {
      return {
        decision: "CHECK_GREEN_ZONE_72H",
        lessonStatus: "Отпуск / Перерыв в расписании",
        financialOutcome: "Без штрафов и списаний при соблюдении регламентных зон",
        studentMessageRequired: false,
        mustDo: [
          "Оформлять перерывы и отпуска в расписании через личный кабинет строго в 'зеленой зоне' (не менее чем за 72 часа до слота).",
          "При отпуске длительностью более 14 дней система автоматически инициирует подбор временных замен для регулярных учеников.",
          "Заранее предупредить постоянных учеников о датах вашего отсутствия и возвращения к урокам."
        ],
        forbiddenActions: [
          "Запрещено снимать регулярные слоты и удалять уроки день-в-день через личный кабинет (красная зона)."
        ],
        sourceRule: "РЕГЛАМЕНТ_ПЕРЕРЫВОВ_И_ОТПУСКОВ"
      };
    }
  },

  [SCENARIOS.CHANGE_TEACHER]: {
    name: "Смена преподавателя по инициативе ученика или преподавателя",
    forbiddenScenarios: ['student_late', 'teacher_emergency'],
    evaluate() {
      return {
        decision: "TRANSFER_PUPIL_WITHOUT_PENALTY",
        lessonStatus: "Ученик передан на замену",
        financialOutcome: "Без штрафов. Допустимый порог неуспешных уроков и смен учеников — до 20%",
        studentMessageRequired: false,
        mustDo: [
          "Зафиксировать запрос ученика на смену в личном кабинете без споров и конфликтов.",
          "Оставить подробный комментарий в карточке ученика по пройденным материалам, сильным и слабым сторонам для нового преподавателя.",
          "Контролировать общий процент смен и неуспешных уроков (норма платформы — не более 20%)."
        ],
        forbiddenActions: [
          "Запрещено вступать в пререкания с клиентом или препятствовать передаче ученика."
        ],
        sourceRule: "РЕГЛАМЕНТ_СМЕНЫ_ПРЕПОДАВАТЕЛЯ"
      };
    }
  },

  [SCENARIOS.TECHNICAL_ISSUE]: {
    name: "Технические неполадки на платформе или у провайдера",
    forbiddenScenarios: ['student_cancel', 'break_schedule'],
    evaluate() {
      return {
        decision: "DIAGNOSE_AND_REPORT",
        lessonStatus: "Технический сбой платформы",
        financialOutcome: "Урок оплачивается преподавателю при подтверждении сбоя со стороны платформы",
        studentMessageRequired: true,
        mustDo: [
          "Проверить работу класса в режиме инкогнито и перезагрузить браузер (рекомендуется Google Chrome / Яндекс.Браузер).",
          "Сделать полный снимок экрана (скриншот) с кодом ошибки и консолью разработчика.",
          "Написать дежурным в Teachers Care / Mattermost и продублировать связь с учеником через резервный канал."
        ],
        forbiddenActions: [
          "Не закрывать урок самовольно без обращения в техническую поддержку."
        ],
        sourceRule: "РЕГЛАМЕНТ_ТЕХНИЧЕСКИХ_СБОЕВ"
      };
    }
  },

  [SCENARIOS.PAYMENT_DISPUTE]: {
    name: "Вопросы выплат, расчетных периодов и вознаграждения",
    forbiddenScenarios: ['student_late', 'teacher_emergency'],
    evaluate() {
      return {
        decision: "CHECK_PAYMENT_SCHEDULE",
        lessonStatus: "Финансовый аудит",
        financialOutcome: "Выплата производится в соответствии с утвержденным графиком школы",
        studentMessageRequired: false,
        mustDo: [
          "Сверить начисления в детализации баланса в личном кабинете преподавателя.",
          "Проверить статус подписания акта выполненных работ и привязку платежного сервиса (Банк 131 / Рокет Ворк).",
          "При обнаружении неточностей составить обращение в финансовый отдел через форму в личном кабинете."
        ],
        forbiddenActions: [
          "Категорически запрещено обсуждать ставки, выплаты и финансовые взаимоотношения школы с учениками."
        ],
        sourceRule: "РЕГЛАМЕНТ_ВЫПЛАТ_ВОЗНАГРАЖДЕНИЯ"
      };
    }
  },

  [SCENARIOS.CONSECUTIVE_LESSONS]: {
    name: "Два урока подряд с одним учеником",
    forbiddenScenarios: ['break_schedule'],
    evaluate(facts) {
      const minutes = facts.minutes || 0;
      return {
        decision: "TREAT_AS_SEPARATE_SESSIONS",
        lessonStatus: "Спаренные уроки",
        financialOutcome: "Каждый урок рассчитывается как независимая академическая единица",
        studentMessageRequired: minutes < 50,
        mustDo: [
          "Оба урока считаются самостоятельными занятиями со своими 50-минутными окнами ожидания.",
          "Если ученик не пришел на первый урок — ждать до 50-й минуты, ставить «Ученик не пришел», затем ждать начало второго урока.",
          "За каждый неявившийся урок начисляется полная ставка при соблюдении 50 минут ожидания в каждом."
        ],
        forbiddenActions: [
          "Запрещено уходить со второго урока, даже если ученик пропустил первый, без дежурства положенные 50 минут на втором уроке."
        ],
        sourceRule: "РЕГЛАМЕНТ_СПАРЕННЫХ_УРОКОВ"
      };
    }
  },

  [SCENARIOS.GROUP_LESSON]: {
    name: "Групповые занятия / Skysmart Класс",
    forbiddenScenarios: ['break_schedule'],
    evaluate() {
      return {
        decision: "CONDUCT_IF_AT_LEAST_ONE",
        lessonStatus: "Групповой урок",
        financialOutcome: "Оплата начисляется по тарифу группового занятия",
        studentMessageRequired: false,
        mustDo: [
          "Урок проводится, если на встречу подключился хотя бы 1 ученик из группы.",
          "Если не подключился никто — ждать 50 минут и зафиксировать неявку группы."
        ],
        forbiddenActions: ["Не отменять групповой урок из-за отсутствия части учеников."],
        sourceRule: "РЕГЛАМЕНТ_ГРУППОВЫХ_УРОКОВ"
      };
    }
  },

  [SCENARIOS.NEED_CLARIFICATION]: {
    name: "Требуется уточнение деталей ситуации",
    forbiddenScenarios: [],
    evaluate(facts) {
      return {
        decision: "REQUEST_MORE_DETAILS",
        lessonStatus: "Ожидает уточнения",
        financialOutcome: "Зависит от конкретной причины и стороны отмены",
        studentMessageRequired: false,
        mustDo: [
          "Уточнить у преподавателя: кто именно отменяет/опаздывает (ученик или учитель).",
          "Уточнить сколько времени прошло от начала урока или сколько часов осталось до старта."
        ],
        forbiddenActions: ["Не давать категоричных рекомендаций до выяснения роли и тайминга."],
        sourceRule: "УТОЧНЕНИЕ_ПАРАМЕТРОВ_СИТУАЦИИ"
      };
    }
  }
};

export function getScopedScenarioRules(queryText = "") {
  return PLATFORM_GOLD_STANDARD;
}
