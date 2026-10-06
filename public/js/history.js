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

let historyRefreshTimer = null;
let historyChannel = null;

async function loadMatchLog() {
    const data = await apiRequest('/api/matches/history');
    return Array.isArray(data?.log) ? data.log : [];
}

function refreshHistoryPage() {
    renderMatchHistory();
}

function attachHistoryListeners() {
    if (historyChannel) return;
    if ('BroadcastChannel' in window) {
        historyChannel = new BroadcastChannel('badminton-scoreboard');
        historyChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'state') {
                refreshHistoryPage();
            }
        };
    }

    window.addEventListener('storage', (event) => {
        if (event.key === 'badminton-latest-state' || event.key === 'badminton-match-log') {
            refreshHistoryPage();
        }
    });

    if (historyRefreshTimer) {
        clearInterval(historyRefreshTimer);
    }
    historyRefreshTimer = setInterval(refreshHistoryPage, 5000);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function buildPlayerHistoryLink(playerName) {
    const safeName = String(playerName ?? '').trim();
    if (!safeName) return 'Player';
    const encodedName = encodeURIComponent(safeName);
    return `<a class="player-history-link" href="player-history.html?player=${encodedName}" target="_blank" rel="noopener noreferrer">${escapeHtml(safeName)}</a>`;
}

function renderPlayerCell(playerName, flagHtml) {
    const safeName = String(playerName ?? '').trim() || 'Player';
    return `${buildPlayerHistoryLink(safeName)}${flagHtml ? ` ${flagHtml}` : ''}`;
}

function formatTime(seconds) {
    const totalSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
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
    try {
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
    } catch (err) {
        return {};
    }
}

function formatCountryIcon(flag) {
    if (!flag) return '';
    if (/^https?:\/\//i.test(flag)) {
        return `<img src="${escapeHtml(flag)}" alt="flag" class="table-flag" />`;
    }
    return `<span class="player-flag">${escapeHtml(flag)}</span>`;
}

async function renderMatchHistory() {
    const matchLogBody = document.getElementById('matchLogBody');
    if (!matchLogBody) return;
    try {
        const [log, playerCountryMap] = await Promise.all([
            loadMatchLog(),
            loadPlayerCountryMap()
        ]);
        matchLogBody.innerHTML = '';

        if (!log.length) {
            matchLogBody.innerHTML = '<tr><td colspan="7">No matches found.</td></tr>';
            return;
        }

        log.forEach((entry) => {
            const scoreHistory = Array.isArray(entry.gameHistory) && entry.gameHistory.length
                ? entry.gameHistory.map((game) => `${game.score1}-${game.score2}`).join(', ')
                : `${entry.finalScore1} - ${entry.finalScore2}`;

            const player1Name = entry.player1 || 'Player 1';
            const player2Name = entry.player2 || 'Player 2';
            const player1Meta = playerCountryMap[player1Name] || { country: entry.player1Country || defaultPlayerCountryMap[player1Name], flag: entry.player1CountryFlag };
            const player2Meta = playerCountryMap[player2Name] || { country: entry.player2Country || defaultPlayerCountryMap[player2Name], flag: entry.player2CountryFlag };
            const player1Flag = resolvePlayerFlag(player1Name, player1Meta.country, entry.player1CountryFlag || player1Meta.flag);
            const player2Flag = resolvePlayerFlag(player2Name, player2Meta.country, entry.player2CountryFlag || player2Meta.flag);
            const player1FlagHtml = formatCountryIcon(player1Flag);
            const player2FlagHtml = formatCountryIcon(player2Flag);
            const player1Id = entry.player1Id || player1Meta.player_id;
            const player2Id = entry.player2Id || player2Meta.player_id;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(entry.date)}</td>
                <td>${renderPlayerCell(player1Name, player1FlagHtml)}<small> ID: ${escapeHtml(player1Id || '-')}</small></td>
                <td>${escapeHtml(scoreHistory)}</td>
                <td>${renderPlayerCell(player2Name, player2FlagHtml)}<small> ID: ${escapeHtml(player2Id || '-')}</small></td>
                <td>${escapeHtml(entry.winner)}</td>
                <td>${escapeHtml(entry.status || 'completed')}</td>
                <td>${formatTime(entry.durationSeconds)}</td>
            `;
            matchLogBody.appendChild(row);
        });
    } catch (err) {
        console.error('Failed to load match history from the database', err);
        matchLogBody.innerHTML = `<tr><td colspan="7">Could not load match history: ${escapeHtml(err.message)}</td></tr>`;
    }
}

window.addEventListener('load', async () => {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ role: 'admin', username: 'Admin' }));
    attachHistoryListeners();
    await renderMatchHistory();
});
