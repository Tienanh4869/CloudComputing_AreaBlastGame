// worker/leaderboard-updater/index.js
// Azure Function: HTTP Trigger — Update leaderboard rankings
// Deploy: Azure Functions Core Tools or Azure Portal
// Trigger: HTTP POST /api/leaderboard-updater (or Azure Service Bus message)

const { app } = require('@azure/functions');

// This simulates what would normally be triggered by Azure Service Bus
// when game events are published (player_killed, match_ended, etc.)
app.http('leaderboardUpdater', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    context.log('Leaderboard updater triggered');

    try {
      const body = await request.json();
      const { event, playerId, score, kills } = body;

      context.log(`Processing event: ${event} for player: ${playerId}`);

      // Kết nối vào PostgreSQL bằng connection string
      const { Client } = require('pg');
      const client = new Client({ connectionString: process.env.DB_CONNECTION });
      await client.connect();

      // Cập nhật điểm cho người chơi
      await client.query(`
        INSERT INTO leaderboard_scores (player_id, score, kills, period, created_at, updated_at)
        VALUES ($1, $2, $3, 'all_time', NOW(), NOW())
        ON CONFLICT (player_id, period)
        DO UPDATE SET
          score = leaderboard_scores.score + $2,
          kills = leaderboard_scores.kills + $3,
          updated_at = NOW()
      `, [playerId, score, kills]);

      // Tính toán lại thứ hạng (Rank) cho toàn bộ server (rất tốn tài nguyên nếu làm ở Backend)
      await client.query(`
        UPDATE leaderboard_scores ls
        SET rank = sub.rank
        FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY period ORDER BY score DESC) as rank
          FROM leaderboard_scores
        ) sub
        WHERE ls.id = sub.id AND ls.period = 'all_time'
      `);

      await client.end();

      context.log(`Leaderboard updated successfully for player ${playerId}`);

      return {
        status: 200,
        jsonBody: {
          success: true,
          processed: { event, playerId, score },
          message: "Serverless (Azure Functions) đã xử lý xong!",
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err) {
      context.log('Error:', err.message);
      return {
        status: 500,
        jsonBody: { error: err.message },
      };
    }
  },
});
