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

async function renderMatchHistory() {
    const matchLogBody = document.getElementById('matchLogBody');
    const log = await loadMatchLog();

    if (!matchLogBody) return;
    matchLogBody.innerHTML = '';

    if (!log.length) {
        matchLogBody.innerHTML = '<tr><td colspan="6">No completed matches yet.</td></tr>';
        return;
    }

    log.forEach((entry) => {
        const scoreHistory = Array.isArray(entry.gameHistory) && entry.gameHistory.length
            ? entry.gameHistory.map((game) => `${game.score1}-${game.score2}`).join(', ')
            : `${entry.finalScore1} - ${entry.finalScore2}`;

        const player1Name = entry.player1 || 'Player 1';
        const player2Name = entry.player2 || 'Player 2';
        const player1FlagHtml = formatCountryIcon(entry.player1CountryFlag);
        const player2FlagHtml = formatCountryIcon(entry.player2CountryFlag);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${entry.date}</td>
            <td>${player1Name} ${player1FlagHtml}</td>
            <td>${scoreHistory}</td>
            <td>${player2Name} ${player2FlagHtml}</td>
            <td>${entry.winner}</td>
            <td>${formatTime(entry.durationSeconds)}</td>
        `;
        matchLogBody.appendChild(row);
    });
}

window.addEventListener('load', renderMatchHistory);
