function getApiBase() {
    const configured = (window.__BADMINTON_API_BASE__ || '').toString().trim();
    if (configured) {
        return configured.replace(/\/+$/, '');
    }

    const { port } = window.location;
    if (port && port !== '4000') {
        return 'http://localhost:4000';
    }

    return '';
}

const API_BASE = getApiBase();
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

let rankingRefreshTimer = null;
let rankingChannel = null;
let visibleRankingRows = 10;

function updateRankingPagination(totalRows) {
    const button = document.getElementById('rankingPaginationButton');
    if (!button) return;
    button.hidden = totalRows <= 10;
    if (totalRows <= 10) return;

    const showingAll = visibleRankingRows >= totalRows;
    button.innerHTML = showingAll
        ? 'SHOW LESS <span aria-hidden="true">&#8593;</span>'
        : 'SHOW MORE <span aria-hidden="true">&#8595;</span>';
}

function changeVisibleRankingRows() {
    const body = document.getElementById('rankingBody');
    if (!body) return;
    const rows = [...body.querySelectorAll('tr[data-ranking-row]')];
    if (visibleRankingRows >= rows.length) {
        visibleRankingRows = 10;
    } else {
        visibleRankingRows += 10;
    }
    rows.forEach((row, index) => { row.hidden = index >= visibleRankingRows; });
    updateRankingPagination(rows.length);
}

async function loadMatchLog() {
    const data = await apiRequest('/api/matches/history');
    return Array.isArray(data?.log) ? data.log : [];
}

function refreshRankingPage() {
    renderRankingTable();
}

function attachRankingListeners() {
    if (rankingChannel) return;
    if ('BroadcastChannel' in window) {
        rankingChannel = new BroadcastChannel('badminton-scoreboard');
        rankingChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'state') {
                refreshRankingPage();
            }
        };
    }

    window.addEventListener('storage', (event) => {
        if (event.key === 'badminton-latest-state' || event.key === 'badminton-match-log') {
            refreshRankingPage();
        }
    });

    if (rankingRefreshTimer) {
        clearInterval(rankingRefreshTimer);
    }
    document.getElementById('rankingPaginationButton')?.addEventListener('click', changeVisibleRankingRows);
    rankingRefreshTimer = setInterval(refreshRankingPage, 5000);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function buildPlayerHistoryLink(playerName) {
    const safeName = String(playerName ?? '').trim();
    if (!safeName) return 'Player';
    const encodedName = encodeURIComponent(safeName);
    return `<a class="player-history-link" href="player-profile.html?player=${encodedName}">${escapeHtml(safeName)}</a>`;
}

function renderPlayerCell(playerName, flagHtml) {
    const safeName = String(playerName ?? '').trim() || 'Player';
    return `${buildPlayerHistoryLink(safeName)}${flagHtml ? ` ${flagHtml}` : ''}`;
}

const defaultCountryFlags = {
    India: '🇮🇳',
    China: '🇨🇳',
    Indonesia: '🇮🇩',
    Malaysia: '🇲🇾',
    'South Korea': '🇰🇷',
    Japan: '🇯🇵',
    England: '🏴',
    Thailand: '🇹🇭',
    Denmark: '🇩🇰',
    Brazil: '🇧🇷',
    'United States': '🇺🇸',
    France: '🇫🇷',
    Spain: '🇪🇸',
    Germany: '🇩🇪',
    Australia: '🇦🇺'
};

const defaultPlayerCountryMap = {
    'Lakshya Sen': 'India',
    'Victor Lai': 'China',
    'Ayush Shetty': 'India',
    'B. Sai Praneeth': 'India',
    'H.S. Prannoy': 'India',
    'Kento Momota': 'Japan',
    'Anders Antonsen': 'Denmark',
    'Jonatan Christie': 'Indonesia',
    'Chen Long': 'China',
    'Lin Dan': 'China',
    'Lee Zii Jia': 'Malaysia',
    'Lee Chong Wei': 'Malaysia',
    'Christo Popov': 'France',
    'Viktor Axelsen': 'Denmark',
    'Kodai Naraoka': 'Japan',
    'Prakash Padukone': 'India',
    'Pullela Gopichand': 'India'
};

function resolveCountryFlag(countryName, fallbackFlag) {
    if (fallbackFlag) return fallbackFlag;
    if (!countryName) return '';
    return defaultCountryFlags[String(countryName).trim()] || '';
}

function resolvePlayerFlag(playerName, fallbackCountry, fallbackFlag) {
    if (fallbackFlag) return fallbackFlag;
    const country = fallbackCountry || defaultPlayerCountryMap[playerName];
    return resolveCountryFlag(country, '');
}

async function loadPlayerCountryMap() {
    const data = await apiRequest('/api/players');
    const players = Array.isArray(data?.players) ? data.players : [];
    return players.reduce((acc, player) => {
        const country = player.country || defaultPlayerCountryMap[player.name] || '';
        const flag = player.flag || resolveCountryFlag(country, '');
        if (player.name) {
            acc[player.name] = {
                country,
                flag,
                player_id: player.player_id || ''
            };
        }
        return acc;
    }, {});
}

function formatCountryIcon(flag) {
    if (!flag) return '';
    if (/^https?:\/\//i.test(flag)) {
        return `<img src="${escapeHtml(flag)}" alt="flag" class="table-flag" />`;
    }
    return `<span class="player-flag">${escapeHtml(flag)}</span>`;
}

function buildRankings(log, playerCountryMap = {}) {
    const map = {};

    Object.entries(playerCountryMap).forEach(([name, player]) => {
        map[name] = {
            name,
            flag: player.flag || '',
            player_id: player.player_id || '',
            wins: 0,
            losses: 0,
            matches: 0,
            points: 0
        };
    });

    log.forEach((entry) => {
        const players = [
            {
                name: entry.player1,
                country: playerCountryMap[entry.player1]?.country || entry.player1Country || defaultPlayerCountryMap[entry.player1],
                flag: resolvePlayerFlag(entry.player1, playerCountryMap[entry.player1]?.country || entry.player1Country || defaultPlayerCountryMap[entry.player1], entry.player1CountryFlag || playerCountryMap[entry.player1]?.flag),
                player_id: playerCountryMap[entry.player1]?.player_id || ''
            },
            {
                name: entry.player2,
                country: playerCountryMap[entry.player2]?.country || entry.player2Country || defaultPlayerCountryMap[entry.player2],
                flag: resolvePlayerFlag(entry.player2, playerCountryMap[entry.player2]?.country || entry.player2Country || defaultPlayerCountryMap[entry.player2], entry.player2CountryFlag || playerCountryMap[entry.player2]?.flag),
                player_id: playerCountryMap[entry.player2]?.player_id || ''
            }
        ];

        players.forEach(({ name, flag, player_id }) => {
            if (!map[name]) {
                map[name] = { name, flag: '', player_id: '', wins: 0, losses: 0, matches: 0, points: 0 };
            }
            if (!map[name].flag && flag) {
                map[name].flag = flag;
            }
            if (!map[name].player_id && player_id) {
                map[name].player_id = player_id;
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

function calculateMovement(log, ranking, playerCountryMap = {}) {
    if (log.length < 2) {
        return ranking.reduce((acc, player) => {
            acc[player.name] = '0';
            return acc;
        }, {});
    }

    const previousRanking = buildRankings(log.slice(0, -1), playerCountryMap);
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
    if (!rankingBody) return;

    try {
        const [log, playerCountryMap] = await Promise.all([
            loadMatchLog(),
            loadPlayerCountryMap()
        ]);
        rankingBody.innerHTML = '';

        const completedMatches = log.filter((entry) => entry.status === 'completed');
        const ranking = buildRankings(completedMatches, playerCountryMap);
        if (!ranking.length) {
            rankingBody.innerHTML = '<tr><td colspan="9">No players found.</td></tr>';
            updateRankingPagination(0);
            return;
        }

        const movement = calculateMovement(completedMatches, ranking, playerCountryMap);

        ranking.forEach((player, index) => {
            const winPercent = player.matches ? Math.round((player.wins / player.matches) * 100) : 0;
            const movementValue = movement[player.name] || '0';
            const movementClass = movementValue.startsWith('🔺') ? 'movement-up' : movementValue.startsWith('🔻') ? 'movement-down' : '';
            const movementHtml = movementClass ? `<span class="${movementClass}">${movementValue}</span>` : movementValue;
            const row = document.createElement('tr');
            row.dataset.rankingRow = 'true';
            row.hidden = index >= visibleRankingRows;
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${escapeHtml(player.player_id || '-')}</td>
                <td>${renderPlayerCell(player.name, formatCountryIcon(player.flag))}</td>
                <td>${player.matches}</td>
                <td>${player.wins}</td>
                <td>${player.losses}</td>
                <td>${player.points}</td>
                <td>${movementHtml}</td>
                <td>${winPercent}%</td>
            `;
            rankingBody.appendChild(row);
        });
        updateRankingPagination(ranking.length);
    } catch (err) {
        console.error('Failed to load rankings from the database', err);
        rankingBody.innerHTML = `<tr><td colspan="9">Could not load rankings: ${escapeHtml(err.message)}</td></tr>`;
        updateRankingPagination(0);
    }
}

window.addEventListener('load', async () => {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ role: 'admin', username: 'Admin' }));
    attachRankingListeners();
    await renderRankingTable();
});
