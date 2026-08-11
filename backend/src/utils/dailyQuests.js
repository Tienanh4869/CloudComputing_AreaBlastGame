const QUEST_DEFINITIONS = [
  {
    code: 'DAILY_LOGIN',
    title: 'Đăng nhập mỗi ngày',
    target: 1,
    unit: 'times',
    reward: 100,
  },
  {
    code: 'DAILY_KILL_5',
    title: 'Tiêu diệt 5 đối thủ',
    target: 5,
    unit: 'kills',
    reward: 200,
  },
  {
    code: 'DAILY_PLAY_30_MIN',
    title: 'Chơi trong 30 phút',
    target: 1800,
    unit: 'seconds',
    reward: 300,
  },
];

/**
 * Lấy ngày nhiệm vụ theo múi giờ Việt Nam UTC+7.
 * Kết quả có dạng YYYY-MM-DD.
 */
function getQuestDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Convert a gameplay event into one daily-quest increment.
 * This mapping is shared by the backend write-through path. Azure Functions
 * keeps the same mapping so queued events remain a reliable fallback.
 */
function getQuestUpdate(event) {
  switch (event?.eventType) {
    case 'PLAYER_LOGIN':
      return {
        questCode: 'DAILY_LOGIN',
        amount: 1,
        target: 1,
        unit: 'times',
        reward: 100,
      };

    case 'PLAYER_KILL':
      return {
        questCode: 'DAILY_KILL_5',
        amount: 1,
        target: 5,
        unit: 'kills',
        reward: 200,
      };

    case 'PLAYTIME_RECORDED':
      return {
        questCode: 'DAILY_PLAY_30_MIN',
        amount: Math.max(0, Math.floor(Number(event.durationSeconds) || 0)),
        target: 1800,
        unit: 'seconds',
        reward: 300,
      };

    default:
      return null;
  }
}

module.exports = {
  QUEST_DEFINITIONS,
  getQuestDate,
  getQuestUpdate,
};
