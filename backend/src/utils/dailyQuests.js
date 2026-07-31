const QUEST_DEFINITIONS = [
  {
    code: 'DAILY_LOGIN',
    title: 'Đăng nhập mỗi ngày',
    target: 1,
    unit: 'times',
  },
  {
    code: 'DAILY_KILL_5',
    title: 'Tiêu diệt 5 đối thủ',
    target: 5,
    unit: 'kills',
  },
  {
    code: 'DAILY_PLAY_30_MIN',
    title: 'Chơi trong 30 phút',
    target: 1800,
    unit: 'seconds',
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

module.exports = {
  QUEST_DEFINITIONS,
  getQuestDate,
};