const { QueryTypes } = require('sequelize');
const { randomUUID } = require('crypto');

const { sequelize } = require('../config/database');
const { publishGameEvent } = require('../config/serviceBus');
const { getQuestDate, getQuestUpdate } = require('../utils/dailyQuests');
const logger = require('../utils/logger');

function validateEvent(event) {
  if (!event?.eventId) throw new Error('Daily quest eventId is required');
  if (!event?.eventType) throw new Error('Daily quest eventType is required');
  if (!event?.playerId) throw new Error('Daily quest playerId is required');
}

async function grantReward(transaction, event, questDate, quest) {
  const rewardEventId =
    `QUEST_REWARD:${event.playerId}:${questDate}:${quest.questCode}`;

  const insertedReward = await sequelize.query(
    `
      INSERT INTO processed_events (
        event_id,
        event_type,
        processed_at
      )
      VALUES ($1, 'QUEST_REWARD', NOW())
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `,
    {
      bind: [rewardEventId],
      transaction,
    }
  );

  const rewardRows = insertedReward[0] || [];
  if (rewardRows.length === 0) return false;

  const updatedPlayers = await sequelize.query(
    `
      UPDATE players
      SET
        total_score = COALESCE(total_score, 0) + $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING id
    `,
    {
      bind: [quest.reward, event.playerId],
      transaction,
    }
  );

  const playerRows = updatedPlayers[0] || [];
  if (playerRows.length === 0) {
    throw new Error(`Player ${event.playerId} not found when granting quest reward`);
  }

  return true;
}

/**
 * Apply quest progress in the backend transactionally. The same event is also
 * sent to Service Bus; processed_events makes the backend and Function paths
 * idempotent, so either path may run first without double-counting.
 */
async function applyDailyQuestEvent(event) {
  validateEvent(event);

  const quest = getQuestUpdate(event);
  if (!quest) return { supported: false };

  const amount = Math.min(Math.max(0, quest.amount), quest.target);
  if (amount <= 0) {
    return { supported: true, skipped: true, questCode: quest.questCode };
  }

  const occurredAt = event.occurredAt
    ? new Date(event.occurredAt)
    : new Date();
  const questDate = getQuestDate(occurredAt);

  return sequelize.transaction(async (transaction) => {
    const insertedEvent = await sequelize.query(
      `
        INSERT INTO processed_events (
          event_id,
          event_type,
          processed_at
        )
        VALUES ($1, $2, NOW())
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `,
      {
        bind: [String(event.eventId), String(event.eventType)],
        transaction,
      }
    );

    const eventRows = insertedEvent[0] || [];
    let progressRows;

    if (eventRows.length > 0) {
      progressRows = await sequelize.query(
        `
          INSERT INTO daily_quest_progress (
            id,
            player_id,
            quest_date,
            quest_code,
            progress,
            target,
            unit,
            completed,
            completed_at,
            created_at,
            updated_at
          )
          VALUES (
            $7,
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $4 >= $5,
            CASE WHEN $4 >= $5 THEN NOW() ELSE NULL END,
            NOW(),
            NOW()
          )
          ON CONFLICT (player_id, quest_date, quest_code)
          DO UPDATE SET
            progress = LEAST(
              EXCLUDED.target,
              daily_quest_progress.progress + EXCLUDED.progress
            ),
            target = EXCLUDED.target,
            unit = EXCLUDED.unit,
            completed = (
              daily_quest_progress.completed
              OR daily_quest_progress.progress + EXCLUDED.progress
                >= EXCLUDED.target
            ),
            completed_at = CASE
              WHEN daily_quest_progress.completed
                THEN daily_quest_progress.completed_at
              WHEN daily_quest_progress.progress + EXCLUDED.progress
                >= EXCLUDED.target
                THEN NOW()
              ELSE daily_quest_progress.completed_at
            END,
            updated_at = NOW()
          RETURNING progress, completed
        `,
        {
          bind: [
            event.playerId,
            questDate,
            quest.questCode,
            amount,
            quest.target,
            quest.unit,
            randomUUID(),
          ],
          type: QueryTypes.SELECT,
          transaction,
        }
      );
    } else {
      progressRows = await sequelize.query(
        `
          SELECT progress, completed
          FROM daily_quest_progress
          WHERE player_id = $1
            AND quest_date = $2
            AND quest_code = $3
        `,
        {
          bind: [event.playerId, questDate, quest.questCode],
          type: QueryTypes.SELECT,
          transaction,
        }
      );
    }

    const progress = progressRows[0] || null;
    let rewarded = false;

    if (progress?.completed === true) {
      rewarded = await grantReward(
        transaction,
        event,
        questDate,
        quest
      );
    }

    return {
      supported: true,
      duplicate: eventRows.length === 0,
      questCode: quest.questCode,
      progress: Number(progress?.progress) || 0,
      completed: progress?.completed === true,
      rewarded,
    };
  });
}

/**
 * Write through to PostgreSQL for immediate UI feedback, then publish the
 * identical event to Service Bus as the event-driven retry/audit path.
 */
async function recordDailyQuestEvent(event) {
  let localResult = null;
  let localError = null;
  let published = false;
  let publishError = null;

  try {
    localResult = await applyDailyQuestEvent(event);
  } catch (error) {
    localError = error;
    logger.warn('[DailyQuest] Local write-through failed', {
      eventId: event?.eventId,
      error: error.message,
    });
  }

  try {
    published = await publishGameEvent(event);
  } catch (error) {
    publishError = error;
    logger.warn('[DailyQuest] Service Bus publish failed', {
      eventId: event?.eventId,
      error: error.message,
    });
  }

  if (localError && !published) {
    throw new AggregateError(
      [localError, publishError].filter(Boolean),
      `Daily quest event ${event?.eventId || 'unknown'} could not be recorded`
    );
  }

  return { localResult, published };
}

module.exports = {
  applyDailyQuestEvent,
  recordDailyQuestEvent,
};
