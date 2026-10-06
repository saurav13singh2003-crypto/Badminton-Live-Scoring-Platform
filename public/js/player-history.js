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

function getCurrentUser() {
    try {
        const stored = localStorage.getItem(CURRENT_USER_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (err) {
        console.error('Failed to load current user', err);
        return null;
    }
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
    try {
        const data = await apiRequest('/api/matches/history');
        return data.log || [];
    } catch (err) {
        console.error('Failed to load match history', err);
        return [];
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
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
            if (player.name && flag) {
                acc[player.name] = { country, flag };
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

function getPlayerQuery() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('player') || '').trim();
}

function formatPlayerLink(playerName, flagHtml) {
    const safeName = String(playerName ?? '').trim() || 'Player';
    const encodedName = encodeURIComponent(safeName);
    const link = `<a class="player-history-link" href="player-history.html?player=${encodedName}" target="_blank" rel="noopener noreferrer">${escapeHtml(safeName)}</a>`;
    return `${link}${flagHtml ? ` ${flagHtml}` : ''}`;
}

function getOpponent(entry, selectedPlayer) {
    if (entry.player1 === selectedPlayer) {
        return { name: entry.player2, score: entry.finalScore2, playerFlag: entry.player2CountryFlag, country: entry.player2Country };
    }
    return { name: entry.player1, score: entry.finalScore1, playerFlag: entry.player1CountryFlag, country: entry.player1Country };
}

function getPlayerGameScoreString(entry, selectedPlayer) {
    const games = Array.isArray(entry.gameHistory) && entry.gameHistory.length ? entry.gameHistory : [];
    if (!games.length) {
        if (entry.player1 === selectedPlayer) {
            return `${entry.finalScore1}-${entry.finalScore2}`;
        }
        return `${entry.finalScore2}-${entry.finalScore1}`;
    }

    return games.map((game) => {
        const first = entry.player1 === selectedPlayer ? game.score1 : game.score2;
        const second = entry.player1 === selectedPlayer ? game.score2 : game.score1;
        return `${first}-${second}`;
    }).join(', ');
}

async function renderPlayerHistory() {
    const body = document.getElementById('playerHistoryBody');
    const title = document.getElementById('playerHistoryTitle');
    const selectedPlayer = getPlayerQuery();

    if (!body || !title) return;

    if (!selectedPlayer) {
        title.textContent = 'Player Match History';
        body.innerHTML = '<tr><td colspan="6">No player selected. Open this page by clicking a player name.</td></tr>';
        return;
    }

    title.textContent = `${selectedPlayer} Match History`;
    const log = await loadMatchLog();
    const playerCountryMap = await loadPlayerCountryMap();
    const matches = log.filter((entry) => {
        const names = [entry.player1, entry.player2].map((name) => String(name || '').trim());
        return names.some((name) => name.toLowerCase() === selectedPlayer.toLowerCase());
    });

    if (!matches.length) {
        body.innerHTML = `<tr><td colspan="6">No matches found for ${escapeHtml(selectedPlayer)}.</td></tr>`;
        return;
    }

    body.innerHTML = '';

    matches.forEach((entry) => {
        const opponent = getOpponent(entry, selectedPlayer);
        const opponentMeta = playerCountryMap[opponent.name] || { country: opponent.country || defaultPlayerCountryMap[opponent.name], flag: opponent.playerFlag };
        const opponentFlag = resolvePlayerFlag(opponent.name, opponentMeta.country, opponentMeta.flag);
        const opponentHtml = formatPlayerLink(opponent.name, formatCountryIcon(opponentFlag));
        const playerIsFirst = entry.player1 === selectedPlayer;
        const playerScore = playerIsFirst ? entry.finalScore1 : entry.finalScore2;
        const opponentScore = playerIsFirst ? entry.finalScore2 : entry.finalScore1;
        const result = entry.winner === selectedPlayer ? 'Won' : 'Lost';
        const resultClass = result === 'Won' ? 'movement-up' : 'movement-down';

        const row = document.createElement('tr');
        const gameScores = getPlayerGameScoreString(entry, selectedPlayer);
        row.innerHTML = `
            <td>${escapeHtml(entry.date)}</td>
            <td>${opponentHtml}</td>
            <td><span class="${resultClass}">${escapeHtml(result)}</span></td>
            <td>${escapeHtml(gameScores)}</td>
            <td>${escapeHtml(entry.winner || '-')}</td>
            <td>${escapeHtml(String(Math.floor((entry.durationSeconds || 0) / 60)).padStart(2, '0') + ':' + String((entry.durationSeconds || 0) % 60).padStart(2, '0'))}</td>
        `;
        body.appendChild(row);
    });
}

window.addEventListener('load', async () => {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ role: 'admin', username: 'Admin' }));
    await renderPlayerHistory();
});
