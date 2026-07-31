const { app } = require('@azure/functions');
const { Pool } = require('pg');

// Khởi tạo connection pool tới PostgreSQL (được cấu hình qua Environment Variables trong Azure)
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

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
