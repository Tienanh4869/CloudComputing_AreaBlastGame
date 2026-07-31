const { app } = require('@azure/functions');
const { Pool } = require('pg');
const { randomUUID } = require('crypto');

// Khởi tạo connection pool tới PostgreSQL (được cấu hình qua Environment Variables trong Azure)
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

/**
 * Trả về ngày nhiệm vụ theo múi giờ Việt Nam.
 * Kết quả có dạng YYYY-MM-DD.
 */
function getQuestDate(value) {
    let date = value ? new Date(value) : new Date();

    if (Number.isNaN(date.getTime())) {
        date = new Date();
    }

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts.map((part) => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Chuyển sự kiện game thành dữ liệu cập nhật nhiệm vụ.
 */
function getQuestUpdate(event) {
    switch (event.eventType) {
        case 'PLAYER_LOGIN':
            return {
                questCode: 'DAILY_LOGIN',
                amount: 1,
                target: 1,
                unit: 'times'
            };

        case 'PLAYER_KILL':
            return {
                questCode: 'DAILY_KILL_5',
                amount: 1,
                target: 5,
                unit: 'kills'
            };

        case 'PLAYTIME_RECORDED':
            return {
                questCode: 'DAILY_PLAY_30_MIN',
                amount: Math.max(
                    0,
                    Math.floor(Number(event.durationSeconds) || 0)
                ),
                target: 1800,
                unit: 'seconds'
            };

        default:
            return null;
    }
}
if (process.env.SERVICE_BUS_CONNECTION_STRING) {
app.serviceBusQueue('matchResultsProcessor', {
    connection: 'SERVICE_BUS_CONNECTION_STRING',
    queueName: 'match-results',
    handler: async (message, context) => {
        context.log('[Worker] Nhận dữ liệu kết thúc trận từ Service Bus:', message);
        
        try {
            const { event, playerId, score, kills, deaths, rank } = message;
            
            if (event === 'match_ended' && playerId) {
                const isWin = rank === 1 ? 1 : 0;
                const isLoss = rank !== 1 ? 1 : 0;
                
                const query = `
                    UPDATE players 
                    SET 
                        total_score = total_score + $1, 
                        kills = kills + $2,
                        deaths = deaths + $3,
                        wins = wins + $4,
                        losses = losses + $5
                    WHERE id = $6
                `;
                await pool.query(query, [score, kills, deaths, isWin, isLoss, playerId]);
                context.log(`[Worker] Cập nhật thành công điểm cho Player ${playerId}`);
            }
        } catch (err) {
            context.log.error('[Worker] Lỗi xử lý message:', err.message);
        }
    }
});
}
/**
 * Giữ lại HTTP Function leaderboardUpdater đang được backend sử dụng.
 */
app.http('leaderboardUpdater', {
    methods: ['POST'],
    authLevel: 'function',

    handler: async (request, context) => {
        let client;

        try {
            const body = await request.json();
            const { event, playerId } = body;
            const score = Number(body.score) || 0;
            const kills = Number(body.kills) || 0;

            if (event !== 'match_ended' || !playerId) {
                return {
                    status: 400,
                    jsonBody: {
                        success: false,
                        error: 'event must be match_ended and playerId is required'
                    }
                };
            }

            client = await pool.connect();
            await client.query('BEGIN');

            await client.query(
                `
                    INSERT INTO leaderboard_scores (
                        player_id,
                        score,
                        kills,
                        period,
                        created_at,
                        updated_at
                    )
                    VALUES ($1, $2, $3, 'all_time', NOW(), NOW())
                    ON CONFLICT (player_id, period)
                    DO UPDATE SET
                        score = leaderboard_scores.score + EXCLUDED.score,
                        kills = leaderboard_scores.kills + EXCLUDED.kills,
                        updated_at = NOW()
                `,
                [playerId, score, kills]
            );

            await client.query(`
                UPDATE leaderboard_scores AS leaderboard
                SET rank = ranking.rank
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY period
                            ORDER BY score DESC
                        ) AS rank
                    FROM leaderboard_scores
                ) AS ranking
                WHERE leaderboard.id = ranking.id
                  AND leaderboard.period = 'all_time'
            `);

            await client.query('COMMIT');

            context.log(
                `[Leaderboard] Updated successfully for Player ${playerId}`
            );

            return {
                status: 200,
                jsonBody: {
                    success: true,
                    processed: {
                        event,
                        playerId,
                        score,
                        kills
                    },
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            if (client) {
                await client.query('ROLLBACK').catch(() => {});
            }

            context.error('[Leaderboard] Update failed:', error);

            return {
                status: 500,
                jsonBody: {
                    success: false,
                    error: error.message
                }
            };
        } finally {
            if (client) {
                client.release();
            }
        }
    }
});
/**
 * Nhận các sự kiện nhiệm vụ hằng ngày từ queue game-events.
 */
app.serviceBusQueue('dailyQuestProcessor', {
    connection: 'SERVICE_BUS_DAILY',
    queueName: 'game-events',

    handler: async (message, context) => {
        let event = message;

        if (Buffer.isBuffer(event)) {
            event = event.toString('utf8');
        }

        if (typeof event === 'string') {
            event = JSON.parse(event);
        }

        if (!event || typeof event !== 'object') {
            throw new Error('Daily quest message must be an object');
        }

        if (!event.eventId) {
            throw new Error('Daily quest eventId is required');
        }

        if (!event.eventType) {
            throw new Error('Daily quest eventType is required');
        }

        if (!event.playerId) {
            throw new Error('Daily quest playerId is required');
        }

        const quest = getQuestUpdate(event);

        if (!quest) {
            context.warn(
                `[DailyQuest] Bỏ qua eventType không hỗ trợ: ${event.eventType}`
            );
            return;
        }

        const questDate = getQuestDate(event.occurredAt);
        const initialProgress = Math.min(
            quest.amount,
            quest.target
        );
        const initiallyCompleted =
            initialProgress >= quest.target;

        let client;

        try {
            client = await pool.connect();
            await client.query('BEGIN');

            /*
             * Lưu eventId trước để bảo đảm một sự kiện không bị cộng
             * nhiệm vụ nhiều lần khi Service Bus gửi lại.
             */
            const processedResult = await client.query(
                `
                    INSERT INTO processed_events (
                        event_id,
                        event_type,
                        processed_at
                    )
                    VALUES ($1, $2, NOW())
                    ON CONFLICT (event_id)
                    DO NOTHING
                    RETURNING event_id
                `,
                [
                    String(event.eventId),
                    String(event.eventType)
                ]
            );

            if (processedResult.rowCount === 0) {
                await client.query('COMMIT');

                context.log(
                    `[DailyQuest] Sự kiện ${event.eventId} đã được xử lý trước đó`
                );
                return;
            }

            await client.query(
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
                        "createdAt",
                        "updatedAt"
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7,
                        $8,
                        CASE WHEN $8 THEN NOW() ELSE NULL END,
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (
                        player_id,
                        quest_date,
                        quest_code
                    )
                    DO UPDATE SET
                        progress = LEAST(
                            EXCLUDED.target,
                            daily_quest_progress.progress
                                + EXCLUDED.progress
                        ),
                        target = EXCLUDED.target,
                        unit = EXCLUDED.unit,
                        completed = (
                            daily_quest_progress.completed
                            OR (
                                daily_quest_progress.progress
                                + EXCLUDED.progress
                                >= EXCLUDED.target
                            )
                        ),
                        completed_at = CASE
                            WHEN daily_quest_progress.completed
                                THEN daily_quest_progress.completed_at
                            WHEN (
                                daily_quest_progress.progress
                                + EXCLUDED.progress
                                >= EXCLUDED.target
                            )
                                THEN NOW()
                            ELSE daily_quest_progress.completed_at
                        END,
                        "updatedAt" = NOW()
                `,
                [
                    randomUUID(),
                    event.playerId,
                    questDate,
                    quest.questCode,
                    initialProgress,
                    quest.target,
                    quest.unit,
                    initiallyCompleted
                ]
            );

            await client.query('COMMIT');

            context.log(
                `[DailyQuest] Đã cập nhật ${quest.questCode} cho Player ${event.playerId}`
            );
        } catch (error) {
            if (client) {
                await client.query('ROLLBACK').catch(() => {});
            }

            context.error(
                '[DailyQuest] Xử lý sự kiện thất bại:',
                error
            );

            /*
             * Ném lỗi lại để Azure Functions không đánh dấu
             * message là đã xử lý thành công.
             */
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }
});
