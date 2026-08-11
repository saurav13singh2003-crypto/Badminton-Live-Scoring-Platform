const API_BASE = '';
const CURRENT_USER_KEY = 'badminton-current-user';
const BASE_MATCH_LOG_KEY = 'badminton-match-log';

function getCurrentUser() {
    try {
        const stored = localStorage.getItem(CURRENT_USER_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (err) {
        console.error('Failed to load current user', err);
        return null;
    }
}

function getNamespacedKey(baseKey) {
    const user = getCurrentUser();
    if (!user || !user.email) {
        return baseKey;
    }
    return `${baseKey}-${user.email.toLowerCase()}`;
}

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || response.statusText || 'Request failed');
    }
    return response.json();
}

async function loadMatchLog() {
    const user = getCurrentUser();
    if (!user?.email) {
        try {
            const stored = localStorage.getItem('badminton-match-log');
            return stored ? JSON.parse(stored) : [];
        } catch (err) {
            console.error('Failed to load match log', err);
            return [];
        }
    }
    try {
        const data = await apiRequest(`/api/match-log?email=${encodeURIComponent(user.email)}`);
        return data.log || [];
    } catch (err) {
        try {
            const stored = localStorage.getItem(getNamespacedKey(BASE_MATCH_LOG_KEY));
            return stored ? JSON.parse(stored) : [];
        } catch (fallbackErr) {
            console.error('Failed to load fallback match log', fallbackErr);
            return [];
        }
    }
}

function formatCountryIcon(flag) {
    if (!flag) return '';
    if (/^https?:\/\//i.test(flag)) {
        return `<img src="${flag}" alt="flag" class="table-flag" />`;
    }
    return `<span class="player-flag">${flag}</span>`;
}

function buildRankings(log) {
    const map = {};

    log.forEach((entry) => {
        const players = [
            { name: entry.player1, flag: entry.player1CountryFlag },
            { name: entry.player2, flag: entry.player2CountryFlag }
        ];

        players.forEach(({ name, flag }) => {
            if (!map[name]) {
                map[name] = { name, flag: '', wins: 0, losses: 0, matches: 0, points: 0 };
            }
            if (!map[name].flag && flag) {
                map[name].flag = flag;
            }
            map[name].matches += 1;
        });

        if (map[entry.winner]) {
            map[entry.winner].wins += 1;
            map[entry.winner].points += 2;
        }
        if (map[entry.loser]) {
            map[entry.loser].losses += 1;
        }
    });

    return Object.values(map).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (a.losses !== b.losses) return a.losses - b.losses;
        return a.name.localeCompare(b.name);
    });
}

function calculateMovement(log, ranking) {
    if (log.length < 2) {
        return ranking.reduce((acc, player) => {
            acc[player.name] = '0';
            return acc;
        }, {});
    }

    const previousRanking = buildRankings(log.slice(0, -1));
    const previousPositions = {};
    previousRanking.forEach((player, index) => {
        previousPositions[player.name] = index + 1;
    });

    return ranking.reduce((acc, player, index) => {
        const currentPosition = index + 1;
        const previousPosition = previousPositions[player.name];
        if (previousPosition == null) {
            acc[player.name] = 'new';
        } else {
            const delta = previousPosition - currentPosition;
            acc[player.name] = delta > 0 ? `🔺${delta}` : delta < 0 ? `🔻${Math.abs(delta)}` : '0';
        }
        return acc;
    }, {});
}

async function renderRankingTable() {
    const rankingBody = document.getElementById('rankingBody');
    const log = await loadMatchLog();

    if (!rankingBody) return;
    rankingBody.innerHTML = '';

    const ranking = buildRankings(log);
    if (!ranking.length) {
        rankingBody.innerHTML = '<tr><td colspan="8">No completed matches yet.</td></tr>';
        return;
    }

    const movement = calculateMovement(log, ranking);

    ranking.forEach((player, index) => {
        const winPercent = player.matches ? Math.round((player.wins / player.matches) * 100) : 0;
        const movementValue = movement[player.name] || '0';
        const movementClass = movementValue.startsWith('🔺') ? 'movement-up' : movementValue.startsWith('🔻') ? 'movement-down' : '';
        const movementHtml = movementClass ? `<span class="${movementClass}">${movementValue}</span>` : movementValue;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${player.name} ${formatCountryIcon(player.flag)}</td>
            <td>${player.matches}</td>
            <td>${player.wins}</td>
            <td>${player.losses}</td>
            <td>${player.points}</td>
            <td>${movementHtml}</td>
            <td>${winPercent}%</td>
        `;
        rankingBody.appendChild(row);
    });
}

window.addEventListener('load', renderRankingTable);
