function getHomeApiBase() {
    const configured = (window.__BADMINTON_API_BASE__ || '').toString().trim();
    if (configured) return configured.replace(/\/+$/, '');
    return window.location.port && window.location.port !== '4000' ? 'http://localhost:4000' : '';
}

async function loadHomeStats() {
    const apiBase = getHomeApiBase();
    try {
        const [playersResponse, historyResponse] = await Promise.all([
            fetch(`${apiBase}/api/players`),
            fetch(`${apiBase}/api/matches/history`)
        ]);
        if (!playersResponse.ok || !historyResponse.ok) throw new Error('API unavailable');
        const [playersData, historyData] = await Promise.all([playersResponse.json(), historyResponse.json()]);
        const players = Array.isArray(playersData.players) ? playersData.players : [];
        const matches = Array.isArray(historyData.log) ? historyData.log.filter((match) => match.status === 'completed') : [];
        const games = matches.reduce((total, match) => total + (Array.isArray(match.gameHistory) ? match.gameHistory.length : 0), 0);

        document.getElementById('homePlayerCount').textContent = String(players.length);
        document.getElementById('homeMatchCount').textContent = String(matches.length);
        document.getElementById('homeGameCount').textContent = String(games);
        document.getElementById('homeConnection').textContent = 'Online';
    } catch (error) {
        document.getElementById('homeConnection').textContent = 'Offline';
    }
}

function setupHomeNavigation() {
    const button = document.querySelector('.home-menu-toggle');
    const navigation = document.querySelector('.home-nav');
    if (!button || !navigation) return;

    button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        navigation.classList.toggle('is-open', !expanded);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    setupHomeNavigation();
    if (document.getElementById('homePlayerCount')) loadHomeStats();
});
