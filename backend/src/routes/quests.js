const router = require('express').Router();

const { authenticate } = require('../middleware/auth');
const {
  Player,
  DailyQuestProgress,
} = require('../models');

const {
  QUEST_DEFINITIONS,
  getQuestDate,
} = require('../utils/dailyQuests');

/**
 * GET /api/quests/daily
 * Lấy tiến độ ba nhiệm vụ của người chơi trong ngày hiện tại.
 */
router.get('/daily', authenticate, async (req, res, next) => {
  try {
    const player = await Player.findOne({
      where: {
        user_id: req.user.id,
      },
    });

    if (!player) {
      return res.status(404).json({
        error: 'Player profile not found',
      });
    }

    const questDate = getQuestDate();

    const progressRows = await DailyQuestProgress.findAll({
      where: {
        player_id: player.id,
        quest_date: questDate,
      },
    });

    const progressByCode = new Map(
      progressRows.map((row) => [
        row.quest_code,
        row.toJSON(),
      ])
    );

    const quests = QUEST_DEFINITIONS.map((definition) => {
      const current = progressByCode.get(definition.code);

      return {
        code: definition.code,
        title: definition.title,
        progress: current?.progress || 0,
        target: definition.target,
        unit: definition.unit,
        completed: current?.completed || false,
        completedAt: current?.completed_at || null,
      };
    });

    return res.json({
      date: questDate,
      timezone: 'Asia/Ho_Chi_Minh',
      quests,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;