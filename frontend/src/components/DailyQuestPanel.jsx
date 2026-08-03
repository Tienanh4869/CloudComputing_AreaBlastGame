import React, { useEffect, useState } from 'react';
import { getDailyQuests } from '../api/quests';

const QUEST_ICONS = {
  DAILY_LOGIN: '📅',
  DAILY_KILL_5: '⚔️',
  DAILY_PLAY_30_MIN: '⏱️',
};

function getProgressText(quest) {
  const progress = Number(quest.progress) || 0;
  const target = Number(quest.target) || 0;

  if (quest.unit === 'seconds') {
    return `${Math.floor(progress / 60)} / ${Math.ceil(target / 60)} phút`;
  }

  if (quest.unit === 'kills') {
    return `${progress} / ${target} mạng`;
  }

  return `${progress} / ${target} lần`;
}

export default function DailyQuestPanel() {
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadQuests = async () => {
      try {
        const { data } = await getDailyQuests();

        if (mounted) {
          setQuests(Array.isArray(data.quests) ? data.quests : []);
          setError('');
        }
      } catch (err) {
        if (mounted) {
          setError(
            err.response?.data?.error ||
            'Không thể tải nhiệm vụ hằng ngày'
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadQuests();

    const interval = setInterval(loadQuests, 15000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      className="card"
      style={{
        width: '100%',
        padding: 18,
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
          🎯 Nhiệm vụ hằng ngày
        </h3>


      </div>

      {loading ? (
        <div
          style={{
            color: 'var(--text-secondary)',
            textAlign: 'center',
            padding: 12,
          }}
        >
          Đang tải nhiệm vụ...
        </div>
      ) : error ? (
        <div
          style={{
            color: 'var(--accent-danger)',
            textAlign: 'center',
            padding: 12,
          }}
        >
          {error}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {quests.map((quest) => {
            const progress = Number(quest.progress) || 0;
            const target = Number(quest.target) || 0;
            const percentage =
              target > 0
                ? Math.min(100, Math.floor((progress / target) * 100))
                : 0;

            return (
              <div
                key={quest.code}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${
                    quest.completed
                      ? 'var(--accent-success)'
                      : 'var(--border-color)'
                  }`,
                  background: quest.completed
                    ? 'rgba(46, 213, 115, 0.08)'
                    : 'rgba(255, 255, 255, 0.03)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    {QUEST_ICONS[quest.code] || '🎯'} {quest.title}
                  </span>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--accent-gold)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      🎁 +{quest.reward || 0} điểm
                    </span>

                    <span
                      style={{
                        color: quest.completed
                          ? 'var(--accent-success)'
                          : 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      {quest.completed
                        ? '✓ Hoàn thành'
                        : getProgressText(quest)}
                    </span>
                  </div>
                </div>

                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={target}
                  aria-valuenow={progress}
                  style={{
                    height: 7,
                    borderRadius: 999,
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div
                    style={{
                      width: `${percentage}%`,
                      height: '100%',
                      borderRadius: 999,
                      transition: 'width 0.3s ease',
                      background: quest.completed
                        ? 'var(--accent-success)'
                        : 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}