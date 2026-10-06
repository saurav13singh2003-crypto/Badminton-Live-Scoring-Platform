let channel = null;
let viewerPlayerRoster = [];
let lastViewerState = null;
const scoreTarget = 21;
const finalPoint = 31;
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
const BASE_STATE_KEY = 'badminton-latest-state';

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

function loadCachedViewerPlayers() {
    try {
        const stored = localStorage.getItem(getNamespacedKey('badminton-players'));
        const players = stored ? JSON.parse(stored) : [];
        viewerPlayerRoster = Array.isArray(players) ? players : [];
    } catch (err) {
        viewerPlayerRoster = [];
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

async function loadLatestState() {
    try {
        const data = await apiRequest('/api/latest-state');
        return data.state || null;
    } catch (err) { return null; }
}

async function loadViewerPlayers() {
    try {
        const data = await apiRequest('/api/players');
        viewerPlayerRoster = Array.isArray(data.players) ? data.players : [];
        if (lastViewerState) updateDisplay(lastViewerState);
    } catch (err) {
        // Keep cached profile photos available if the database is offline.
    }
}

async function initViewer() {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ role: 'admin', username: 'Admin' }));
    loadCachedViewerPlayers();
    channel = createChannel();
    const [savedState] = await Promise.all([loadLatestState(), loadViewerPlayers()]);
    if (savedState) {
        try {
            updateDisplay(typeof savedState === 'string' ? JSON.parse(savedState) : savedState);
            setStatus('Live display restored from last broadcast.');
            return;
        } catch (err) {
            console.error('Invalid saved state', err);
        }
    }

    setStatus('Waiting for live input from the admin page...');
}

function createChannel() {
    if (window.BroadcastChannel) {
        const bc = new BroadcastChannel('badminton-scoreboard');
        bc.onmessage = (event) => {
            if (event.data && event.data.type === 'state') {
                updateDisplay(event.data.payload);
                setStatus('Live score updated.');
            }
        };
        return bc;
    }
    return null;
}

function getCountryColor(country) {
    if (!country) {
        return '#2d3748';
    }
    const key = country.toLowerCase().trim();
    const colors = {
        india: '#0047ab',
        china: '#de2910',
        indonesia: '#e60000',
        malaysia: '#000000',
        korea: '#000080',
        japan: '#bc002d',
        england: '#00247d',
        thailand: '#00205b',
        denmark: '#c60c30',
        brazil: '#009c3b',
        usa: '#3c3b6e',
        france: '#002395',
        spain: '#aa151b'
    };
    return colors[key] || '#2d3748';
}

function getCountryFlag(country, customFlag) {
    if (customFlag) {
        return customFlag;
    }
    if (!country) {
        return '';
    }
    const key = country.toLowerCase().trim();
    const flags = {
        india: '🇮🇳',
        china: '🇨🇳',
        indonesia: '🇮🇩',
        malaysia: '🇲🇾',
        korea: '🇰🇷',
        japan: '🇯🇵',
        england: '🏴',
        thailand: '🇹🇭',
        denmark: '🇩🇰',
        brazil: '🇧🇷',
        usa: '🇺🇸',
        france: '🇫🇷',
        spain: '🇪🇸'
    };
    return flags[key] || '';
}

function isFlagUrl(flag) {
    return typeof flag === 'string' && /^https?:\/\//i.test(flag);
}

function getViewerPlayerPhoto(name) {
    const player = viewerPlayerRoster.find((entry) => entry.name?.toLocaleLowerCase() === name.toLocaleLowerCase());
    return /^https?:\/\//i.test(player?.photo_url || '') ? player.photo_url : '';
}

function renderPlayerLabel(labelEl, text, flag, statusText, photoUrl) {
    if (!labelEl) return;
    labelEl.innerHTML = '';

    const backdrop = document.createElement('span');
    backdrop.className = 'viewer-country-backdrop';
    if (flag) {
        if (isFlagUrl(flag)) {
            const flagImage = document.createElement('img');
            flagImage.src = flag;
            flagImage.alt = '';
            backdrop.appendChild(flagImage);
        } else {
            backdrop.classList.add('is-emoji');
            backdrop.textContent = flag;
        }
    }
    labelEl.appendChild(backdrop);

    const content = document.createElement('span');
    content.className = 'player-label-content';
    const row = document.createElement('div');
    row.className = 'player-name-row';
    const nameNode = document.createElement('span');
    nameNode.className = 'viewer-player-name';
    nameNode.textContent = text;
    row.appendChild(nameNode);

    if (flag) {
        const wrapper = document.createElement('span');
        wrapper.className = 'country-flag';
        if (isFlagUrl(flag)) {
            const img = document.createElement('img');
            img.src = flag;
            img.alt = `${text} flag`;
            img.className = 'custom-flag';
            wrapper.appendChild(img);
        } else {
            wrapper.textContent = flag;
        }
        row.appendChild(wrapper);
    }

    if (photoUrl) {
        const photo = document.createElement('img');
        photo.className = 'viewer-player-photo';
        photo.src = photoUrl;
        photo.alt = `${text} portrait`;
        photo.onerror = () => photo.classList.add('hidden');
        row.appendChild(photo);
    }

    content.appendChild(row);
    if (statusText) {
        const status = document.createElement('span');
        status.className = `player-status ${statusText.toLowerCase().replace(/\s+/g, '-')}`;
        status.textContent = statusText;
        content.appendChild(status);
    }
    labelEl.appendChild(content);
}

function hasWinner(scoreA, scoreB) {
    if (scoreA >= finalPoint && scoreA > scoreB) {
        return true;
    }
    if (scoreA >= scoreTarget && scoreA - scoreB >= 2) {
        return true;
    }
    return false;
}

function willWinWithNextPoint(score, opponentScore) {
    return hasWinner(score + 1, opponentScore);
}

function getPointStatus(score, opponentScore, gameWins) {
    if (willWinWithNextPoint(score, opponentScore)) {
        if (gameWins === 1) {
            return 'Match Point';
        }
        return 'Game Point';
    }
    return '';
}

function getDistinctColors(color1, color2) {
    if (color1 !== color2) {
        return [color1, color2];
    }
    const fallback = ['#ff8b00', '#6c63ff', '#18b7a4', '#d97706', '#1d4ed8'];
    for (const alt of fallback) {
        if (alt !== color1) {
            return [color1, alt];
        }
    }
    return [color1, '#64748b'];
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function updateDisplay(state) {
    if (!state) {
        return;
    }
    lastViewerState = state;

    const currentGame = state.currentGame ?? 1;
    const score1 = state.score1 ?? 0;
    const score2 = state.score2 ?? 0;
    const history = Array.isArray(state.gameHistory) ? state.gameHistory : [];
    const color1 = getCountryColor(state.player1Country);
    const color2 = getCountryColor(state.player2Country);

    const flag1 = getCountryFlag(state.player1Country, state.player1CountryFlag);
    const flag2 = getCountryFlag(state.player2Country, state.player2CountryFlag);
    const label1 = document.getElementById('rowLabel1');
    const label2 = document.getElementById('rowLabel2');
    const status1 = (!state.matchOver && score1 > score2) ? getPointStatus(score1, score2, state.gameWins1) : '';
    const status2 = (!state.matchOver && score2 > score1) ? getPointStatus(score2, score1, state.gameWins2) : '';
    renderPlayerLabel(label1, state.player1 || 'Player 1', flag1, status1, getViewerPlayerPhoto(state.player1 || 'Player 1'));
    renderPlayerLabel(label2, state.player2 || 'Player 2', flag2, status2, getViewerPlayerPhoto(state.player2 || 'Player 2'));

    const durationEl = document.getElementById('matchDuration');
    if (durationEl) {
        durationEl.innerText = state.matchOver ? formatTime(state.elapsedSeconds || 0) : '--:--';
    }

    const [uniqueColor1, uniqueColor2] = getDistinctColors(color1, color2);
    const server = state.currentServer;
    if (label1) {
        label1.classList.toggle('serving', server === 1);
        label1.style.borderLeftColor = uniqueColor1;
        label1.style.setProperty('--country-color', uniqueColor1);
        label1.style.color = '#fff';
    }
    if (label2) {
        label2.classList.toggle('serving', server === 2);
        label2.style.borderLeftColor = uniqueColor2;
        label2.style.setProperty('--country-color', uniqueColor2);
        label2.style.color = '#fff';
    }

    for (let gameIndex = 1; gameIndex <= 3; gameIndex++) {
        const p1El = document.getElementById(`game${gameIndex}p1`);
        const p2El = document.getElementById(`game${gameIndex}p2`);
        const durationEl = document.getElementById(`duration${gameIndex}`);
        const entry = history.find((item) => item.game === gameIndex);

        if (entry) {
            if (p1El) p1El.innerText = entry.score1;
            if (p2El) p2El.innerText = entry.score2;
            if (p1El) p1El.classList.toggle('game-winner', entry.winner === 1);
            if (p2El) p2El.classList.toggle('game-winner', entry.winner === 2);
            if (p1El) p1El.classList.remove('current-game');
            if (p2El) p2El.classList.remove('current-game');
            if (entry.winner === 1) {
                if (p1El) p1El.style.backgroundColor = uniqueColor1;
                if (p2El) p2El.style.backgroundColor = '';
            } else if (entry.winner === 2) {
                if (p2El) p2El.style.backgroundColor = uniqueColor2;
                if (p1El) p1El.style.backgroundColor = '';
            } else {
                if (p1El) p1El.style.backgroundColor = '';
                if (p2El) p2El.style.backgroundColor = '';
            }
            if (durationEl) durationEl.innerText = entry.durationSeconds != null ? formatTime(entry.durationSeconds) : '--:--';
        } else if (gameIndex === currentGame && !state.matchOver) {
            if (p1El) p1El.innerText = score1;
            if (p2El) p2El.innerText = score2;
            if (p1El) p1El.classList.remove('game-winner');
            if (p2El) p2El.classList.remove('game-winner');
            if (p1El) p1El.classList.add('current-game');
            if (p2El) p2El.classList.add('current-game');
            if (p1El) p1El.style.backgroundColor = '';
            if (p2El) p2El.style.backgroundColor = '';
            if (durationEl) durationEl.innerText = '--:--';
        } else if (gameIndex === currentGame && state.matchOver) {
            if (p1El) p1El.innerText = score1;
            if (p2El) p2El.innerText = score2;
            if (p1El) p1El.classList.remove('game-winner');
            if (p2El) p2El.classList.remove('game-winner');
            if (p1El) p1El.classList.remove('current-game');
            if (p2El) p2El.classList.remove('current-game');
            if (p1El) p1El.style.backgroundColor = '';
            if (p2El) p2El.style.backgroundColor = '';
            if (durationEl) durationEl.innerText = '--:--';
        } else {
            if (p1El) {
                p1El.innerText = '-';
                p1El.classList.remove('game-winner');
                p1El.classList.remove('current-game');
                p1El.style.backgroundColor = '';
            }
            if (p2El) {
                p2El.innerText = '-';
                p2El.classList.remove('game-winner');
                p2El.classList.remove('current-game');
                p2El.style.backgroundColor = '';
            }
            if (durationEl) durationEl.innerText = '--:--';
        }
    }

}

function setStatus(message) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerText = message;
    }
}

window.addEventListener('storage', (event) => {
    if (event.key === getNamespacedKey(BASE_STATE_KEY) && event.newValue) {
        try {
            updateDisplay(JSON.parse(event.newValue));
            setStatus('Live score updated via storage fallback.');
        } catch (err) {
            console.error('Failed to parse state from storage event', err);
        }
    }
});

window.addEventListener('load', initViewer);
