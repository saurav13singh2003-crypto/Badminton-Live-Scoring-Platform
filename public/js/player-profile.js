function getApiBase() {
    const configured = (window.__BADMINTON_API_BASE__ || '').toString().trim();
    if (configured) return configured.replace(/\/+$/, '');
    const { port } = window.location;
    return port && port !== '4000' ? 'http://localhost:4000' : '';
}

const PROFILE_API_BASE = getApiBase();

function escapeProfileHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

async function profileApiRequest(path) {
    const response = await fetch(`${PROFILE_API_BASE}${path}`);
    if (!response.ok) throw new Error(response.statusText || 'Request failed');
    return response.json();
}

function getSelectedPlayerName() {
    return (new URLSearchParams(window.location.search).get('player') || '').trim();
}

function getPlayerFromMatch(entry, name) {
    if (String(entry.player1 || '').toLowerCase() === name.toLowerCase()) {
        return { country: entry.player1Country, flag: entry.player1CountryFlag };
    }
    if (String(entry.player2 || '').toLowerCase() === name.toLowerCase()) {
        return { country: entry.player2Country, flag: entry.player2CountryFlag };
    }
    return {};
}

function renderProfileFlag(flag) {
    if (!flag) return '';
    if (/^https?:\/\//i.test(flag)) return `<img src="${escapeProfileHtml(flag)}" alt="" class="profile-country-flag">`;
    return `<span class="profile-country-emoji" aria-hidden="true">${escapeProfileHtml(flag)}</span>`;
}

function profilePlayerLink(name) {
    const safeName = String(name || '').trim();
    if (!safeName) return '-';
    return `<a class="player-history-link" href="player-profile.html?player=${encodeURIComponent(safeName)}">${escapeProfileHtml(safeName)}</a>`;
}

function profileDuration(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(Math.floor(total % 60)).padStart(2, '0')}`;
}

function renderPlayerMatchHistory(log, selectedPlayer) {
    const body = document.getElementById('playerMatchHistoryBody');
    const matches = log.filter((entry) => [entry.player1, entry.player2]
        .some((name) => String(name || '').toLowerCase() === selectedPlayer.toLowerCase()));

    if (!matches.length) {
        body.innerHTML = '<tr><td colspan="6">No matches found for this player.</td></tr>';
        return;
    }

    body.innerHTML = matches.map((entry) => {
        const playerIsFirst = String(entry.player1 || '').toLowerCase() === selectedPlayer.toLowerCase();
        const opponent = playerIsFirst ? entry.player2 : entry.player1;
        const playerWon = String(entry.winner || '').toLowerCase() === selectedPlayer.toLowerCase();
        const result = entry.status !== 'completed' ? 'In Progress' : playerWon ? 'Won' : 'Lost';
        const resultClass = result === 'Won' ? 'movement-up' : result === 'Lost' ? 'movement-down' : '';
        const games = Array.isArray(entry.gameHistory) && entry.gameHistory.length
            ? entry.gameHistory.map((game) => playerIsFirst ? `${game.score1}-${game.score2}` : `${game.score2}-${game.score1}`).join(', ')
            : `${playerIsFirst ? entry.finalScore1 : entry.finalScore2}-${playerIsFirst ? entry.finalScore2 : entry.finalScore1}`;
        const date = entry.date || (entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '-');

        return `<tr>
            <td>${escapeProfileHtml(date)}</td>
            <td>${profilePlayerLink(opponent)}</td>
            <td><span class="${resultClass}">${result}</span></td>
            <td>${escapeProfileHtml(games)}</td>
            <td>${entry.winner ? profilePlayerLink(entry.winner) : '-'}</td>
            <td>${profileDuration(entry.durationSeconds)}</td>
        </tr>`;
    }).join('');
}

function togglePlayerMatchHistory() {
    const panel = document.getElementById('playerMatchHistory');
    const button = document.getElementById('playerHistoryToggle');
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    button.innerHTML = expanded
        ? 'View Match History <span aria-hidden="true">&#8595;</span>'
        : 'Hide Match History <span aria-hidden="true">&#8593;</span>';
    panel.classList.toggle('hidden', expanded);
}

async function renderPlayerProfile() {
    const name = getSelectedPlayerName();
    const status = document.getElementById('profileStatus');
    if (!name) {
        document.getElementById('profileName').textContent = 'Player not selected';
        status.textContent = 'Open this page by selecting a player name.';
        return;
    }

    try {
        const [playerData, historyData] = await Promise.all([
            profileApiRequest('/api/players'),
            profileApiRequest('/api/matches/history')
        ]);
        const players = Array.isArray(playerData.players) ? playerData.players : [];
        const log = Array.isArray(historyData.log) ? historyData.log : [];
        const player = players.find((entry) => String(entry.name || '').toLowerCase() === name.toLowerCase());
        const canonicalName = player?.name || log.flatMap((entry) => [entry.player1, entry.player2]).find((playerName) => String(playerName || '').toLowerCase() === name.toLowerCase()) || name;
        const matches = log.filter((entry) => entry.status === 'completed' && [entry.player1, entry.player2].some((playerName) => String(playerName || '').toLowerCase() === canonicalName.toLowerCase()));
        const wins = matches.filter((entry) => String(entry.winner || '').toLowerCase() === canonicalName.toLowerCase()).length;
        const losses = matches.length - wins;
        const rankingStats = players.map((entry) => {
            const playerMatches = log.filter((match) => match.status === 'completed' && [match.player1, match.player2].some((playerName) => String(playerName || '').toLowerCase() === String(entry.name || '').toLowerCase()));
            const playerWins = playerMatches.filter((match) => String(match.winner || '').toLowerCase() === String(entry.name || '').toLowerCase()).length;
            return { name: entry.name, wins: playerWins, losses: playerMatches.length - playerWins, points: playerWins * 2 };
        }).sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
        const rankIndex = rankingStats.findIndex((entry) => entry.name.toLowerCase() === canonicalName.toLowerCase());
        const matchMeta = log.map((entry) => getPlayerFromMatch(entry, canonicalName)).find((meta) => meta.country || meta.flag) || {};
        const country = player?.country || matchMeta.country || '';
        const flag = player?.flag || matchMeta.flag || '';
        const initials = canonicalName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
        const photo = document.getElementById('profilePhoto');
        const initialElement = document.getElementById('profileInitials');

        document.title = `${canonicalName} | Player Profile`;
        document.getElementById('profileName').textContent = canonicalName;
        initialElement.textContent = initials || '?';
        if (player?.photo_url && /^https?:\/\//i.test(player.photo_url)) {
            photo.src = player.photo_url;
            photo.classList.remove('hidden');
            initialElement.classList.add('hidden');
            photo.onerror = () => {
                photo.classList.add('hidden');
                initialElement.classList.remove('hidden');
            };
        } else {
            photo.removeAttribute('src');
            photo.classList.add('hidden');
            initialElement.classList.remove('hidden');
        }
        document.getElementById('profileCountry').innerHTML = country ? `${renderProfileFlag(flag)}<span>${escapeProfileHtml(country)}</span>` : 'Player';
        document.getElementById('profileRank').textContent = rankIndex < 0 ? '—' : String(rankIndex + 1);
        document.getElementById('profileMatches').textContent = String(matches.length);
        document.getElementById('profileWins').textContent = String(wins);
        document.getElementById('profileLosses').textContent = String(losses);
        document.getElementById('profileWinRate').textContent = matches.length ? `${Math.round((wins / matches.length) * 100)}%` : '0%';
        document.getElementById('profileAge').textContent = player?.age ? `${player.age} years` : '—';
        document.getElementById('profileHeight').textContent = player?.height_cm ? `${Number(player.height_cm)} cm` : '—';
        document.getElementById('profileWeight').textContent = player?.weight_kg ? `${Number(player.weight_kg)} kg` : '—';
        document.getElementById('profileHand').textContent = player?.playing_hand ? `${player.playing_hand[0].toUpperCase()}${player.playing_hand.slice(1)}` : '—';
        renderPlayerMatchHistory(log, canonicalName);
        status.textContent = matches.length ? '' : 'No completed matches recorded for this player yet.';
    } catch (err) {
        console.error('Failed to load player profile', err);
        document.getElementById('profileName').textContent = name;
        document.getElementById('profileInitials').textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
        status.textContent = 'Could not load player statistics. Make sure the app server is running and try again.';
    }
}

window.addEventListener('load', renderPlayerProfile);
