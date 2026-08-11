let score1 = 0;
let score2 = 0;
let currentGame = 1;
let gameWins1 = 0;
let gameWins2 = 0;
let gameHistory = [];
let currentServer = null;
let matchOver = false;
let channel = null;
let matchSeconds = 0;
let timerInterval = null;
let currentGameStartSeconds = 0;
let currentMatchId = null;
let currentGameId = null;
let player1DbId = null;
let player2DbId = null;

const maxGames = 3;
const scoreTarget = 21;
const finalPoint = 31;

const API_BASE = '';
let customCountries = [];

const countryColors = {
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
    spain: '#aa151b',
    default: '#2d3748'
};

function getCountryColor(country) {
    if (!country) {
        return countryColors.default;
    }
    const key = country.toLowerCase().trim();
    return countryColors[key] || countryColors.default;
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

function showLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('authTitle').innerText = 'Login to Continue';
    document.getElementById('authMessage').innerText = 'Enter your email and password to access the scoreboard.';
}

function showRegistration() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('authTitle').innerText = 'Register New User';
    document.getElementById('authMessage').innerText = 'Create an account to access the scoreboard.';
}

function lockApp() {
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('authOverlay').classList.remove('hidden');
}

async function unlockApp(username) {
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('authOverlay').classList.add('hidden');
    await populateAllCountryDropdowns();
    sendStatus(`Logged in as ${username}`);
}

async function handleRegister() {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();

    if (!username || !email || !password) {
        sendStatus('Please enter username, email, and password.');
        return;
    }

    let existing = null;
    try {
        existing = await findUserByEmail(email);
    } catch (err) {
        // continue with registration if API user lookup fails
    }
    if (existing) {
        sendStatus('This email is already registered. Please login with your existing account.');
        showLogin();
        return;
    }

    try {
        const user = await registerUser(username, email, password);
        sendStatus('Registration successful. Please login now.');
        document.getElementById('registerUsername').value = '';
        document.getElementById('registerEmail').value = '';
        document.getElementById('registerPassword').value = '';
        showLogin();
    } catch (err) {
        sendStatus(err.message || 'Registration failed.');
    }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!email || !password) {
        sendStatus('Enter email and password to login.');
        return;
    }

    try {
        const user = await loginUser(email, password);
        setCurrentUser(user);
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        await unlockApp(user.username);
    } catch (err) {
        if (err.message === 'User not found' || err.message === 'User not found') {
            sendStatus('No account found for this email. Please register first.');
            showRegistration();
        } else {
            sendStatus(err.message || 'Invalid email or password.');
        }
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function updateTimerDisplay() {
    const timerEl = document.getElementById('matchTimer');
    if (timerEl) {
        timerEl.innerText = formatTime(matchSeconds);
    }
}

function startTimer() {
    if (timerInterval) return; // Don't start if already running
    timerInterval = setInterval(() => {
        matchSeconds += 1;
        updateTimerDisplay();
    }, 1000);
}

function pauseTimer() {
    stopTimer();
    sendStatus('Timer paused. Click Start Match to continue.');
}
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function resetTimer() {
    stopTimer();
    matchSeconds = 0;
    updateTimerDisplay();
}

const USERS_KEY = 'badminton-registered-users';
const CURRENT_USER_KEY = 'badminton-current-user';
const BASE_MATCH_LOG_KEY = 'badminton-match-log';
const BASE_STATE_KEY = 'badminton-latest-state';
const BASE_CUSTOM_COUNTRY_KEY = 'custom-countries';

async function apiRequest(path, options = {}) {
    const request = {
        headers: {
            'Content-Type': 'application/json'
        },
        ...options
    };
    const response = await fetch(`${API_BASE}${path}`, request);
    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.error || response.statusText || 'Request failed';
        throw new Error(message);
    }
    return response.json();
}

function getCurrentUser() {
    try {
        const stored = localStorage.getItem(CURRENT_USER_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (err) {
        console.error('Failed to load current user', err);
        return null;
    }
}

function setCurrentUser(user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

function clearCurrentUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
}

async function handleLogout() {
    stopTimer();
    clearCurrentUser();
    lockApp();
    showLogin();
    sendStatus('Logged out successfully.');
}

function getNamespacedKey(baseKey) {
    const user = getCurrentUser();
    if (!user || !user.email) {
        return baseKey;
    }
    return `${baseKey}-${user.email.toLowerCase()}`;
}

function loadNamespaced(key) {
    try {
        const stored = localStorage.getItem(getNamespacedKey(key));
        return stored ? JSON.parse(stored) : [];
    } catch (err) {
        console.error(`Failed to load namespaced data for ${key}`, err);
        return [];
    }
}

function saveNamespaced(key, value) {
    localStorage.setItem(getNamespacedKey(key), JSON.stringify(value));
}

async function findUserByEmail(email) {
    if (!email) {
        return null;
    }
    try {
        const data = await apiRequest(`/api/users?email=${encodeURIComponent(email)}`);
        return data.user || null;
    } catch (err) {
        const users = loadNamespaced(USERS_KEY);
        return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
    }
}

async function registerUser(username, email, password) {
    try {
        const data = await apiRequest('/api/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
        return data.user;
    } catch (err) {
        if (err.message === 'Email already registered') {
            throw err;
        }
        const users = loadNamespaced(USERS_KEY);
        users.push({ username, email, password });
        saveNamespaced(USERS_KEY, users);
        return { username, email };
    }
}

async function loginUser(email, password) {
    try {
        const data = await apiRequest('/api/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        return data.user;
    } catch (err) {
        const users = loadNamespaced(USERS_KEY);
        const user = users.find((item) => item.email.toLowerCase() === email.toLowerCase());
        if (user && user.password === password) {
            return { username: user.username, email: user.email };
        }
        throw err;
    }
}

async function loadMatchLog() {
    const user = getCurrentUser();
    if (!user?.email) {
        return loadNamespaced(BASE_MATCH_LOG_KEY);
    }
    try {
        const data = await apiRequest(`/api/match-log?email=${encodeURIComponent(user.email)}`);
        return data.log || [];
    } catch (err) {
        return loadNamespaced(BASE_MATCH_LOG_KEY);
    }
}

async function saveMatchLog(log) {
    const user = getCurrentUser();
    if (!user?.email) {
        saveNamespaced(BASE_MATCH_LOG_KEY, log);
        return;
    }
    try {
        await apiRequest('/api/match-log', {
            method: 'POST',
            body: JSON.stringify({ email: user.email, log })
        });
    } catch (err) {
        saveNamespaced(BASE_MATCH_LOG_KEY, log);
    }
}

async function loadCustomCountries() {
    const user = getCurrentUser();
    if (!user?.email) {
        return loadNamespaced(BASE_CUSTOM_COUNTRY_KEY);
    }
    try {
        const data = await apiRequest(`/api/custom-countries?email=${encodeURIComponent(user.email)}`);
        return data.countries || [];
    } catch (err) {
        return loadNamespaced(BASE_CUSTOM_COUNTRY_KEY);
    }
}

async function saveCustomCountry(name, flag) {
    const user = getCurrentUser();
    const countries = await loadCustomCountries();
    if (!countries.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        countries.push({ name, flag });
    }
    customCountries = countries;
    if (!user?.email) {
        saveNamespaced(BASE_CUSTOM_COUNTRY_KEY, countries);
        return;
    }
    try {
        await apiRequest('/api/custom-countries', {
            method: 'POST',
            body: JSON.stringify({ email: user.email, name, flag })
        });
    } catch (err) {
        saveNamespaced(BASE_CUSTOM_COUNTRY_KEY, countries);
    }
}

async function saveLatestState(state) {
    const user = getCurrentUser();
    if (!user?.email) {
        localStorage.setItem(getNamespacedKey(BASE_STATE_KEY), JSON.stringify(state));
        return;
    }
    try {
        await apiRequest('/api/latest-state', {
            method: 'POST',
            body: JSON.stringify({ email: user.email, state })
        });
    } catch (err) {
        localStorage.setItem(getNamespacedKey(BASE_STATE_KEY), JSON.stringify(state));
    }
}

async function loadLatestState() {
    const user = getCurrentUser();
    if (!user?.email) {
        const saved = localStorage.getItem(getNamespacedKey(BASE_STATE_KEY));
        return saved ? JSON.parse(saved) : null;
    }
    try {
        const data = await apiRequest(`/api/latest-state?email=${encodeURIComponent(user.email)}`);
        return data.state || null;
    } catch (err) {
        const saved = localStorage.getItem(getNamespacedKey(BASE_STATE_KEY));
        return saved ? JSON.parse(saved) : null;
    }
}

async function addCompletedMatchToLog(state) {
    if (!state?.matchOver) {
        return;
    }

    const log = await loadMatchLog();
    const existing = log.some((entry) => entry.timestamp === state.timestamp);
    if (existing) {
        return;
    }

    const player1 = state.player1 || 'Player 1';
    const player2 = state.player2 || 'Player 2';
    const winnerIs1 = state.gameWins1 > state.gameWins2;
    const winner = winnerIs1 ? player1 : player2;
    const loser = winnerIs1 ? player2 : player1;

    const entry = {
        timestamp: state.timestamp,
        date: new Date(state.timestamp).toLocaleString(),
        player1,
        player2,
        player1Country: state.player1Country || '',
        player1CountryFlag: state.player1CountryFlag || '',
        player2Country: state.player2Country || '',
        player2CountryFlag: state.player2CountryFlag || '',
        winner,
        loser,
        finalScore1: state.score1,
        finalScore2: state.score2,
        gameHistory: Array.isArray(state.gameHistory) ? state.gameHistory : [],
        gameWins1: state.gameWins1,
        gameWins2: state.gameWins2,
        durationSeconds: state.elapsedSeconds || 0
    };

    log.unshift(entry);
    await saveMatchLog(log);
}

function populateCustomCountriesInDropdown(select, countries) {
    if (!select) return;
    const existingCustomOptions = select.querySelectorAll('option[data-custom="true"]');
    existingCustomOptions.forEach((opt) => opt.remove());
    countries.forEach((country) => {
        const option = document.createElement('option');
        option.value = country.name;
        option.textContent = `${country.flag} ${country.name}`;
        option.setAttribute('data-custom', 'true');
        const addNewOption = select.querySelector('option[value="ADD_NEW"]');
        if (addNewOption) {
            select.insertBefore(option, addNewOption);
        } else {
            select.appendChild(option);
        }
    });
}

async function populateAllCountryDropdowns() {
    const select1 = document.getElementById('player1Country');
    const select2 = document.getElementById('player2Country');
    customCountries = await loadCustomCountries();
    populateCustomCountriesInDropdown(select1, customCountries);
    populateCustomCountriesInDropdown(select2, customCountries);
}

async function deleteCustomCountryByName(name) {
    if (!name) return false;
    const user = getCurrentUser();
    const countries = await loadCustomCountries();
    const exists = countries.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!exists) return false;
    const updated = countries.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
    customCountries = updated;
    if (!user?.email) {
        saveNamespaced(BASE_CUSTOM_COUNTRY_KEY, updated);
    } else {
        try {
            await apiRequest('/api/custom-countries', {
                method: 'DELETE',
                body: JSON.stringify({ email: user.email, name })
            });
        } catch (err) {
            saveNamespaced(BASE_CUSTOM_COUNTRY_KEY, updated);
        }
    }
    await populateAllCountryDropdowns();
    return true;
}

async function confirmDeleteCountry(player) {
    const select = document.getElementById(`player${player}Country`);
    const name = select?.value?.trim();
    if (!name) {
        alert('Please select a country to delete.');
        return;
    }
    const countries = customCountries || [];
    const isCustom = countries.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!isCustom) {
        alert('Only custom countries can be deleted.');
        return;
    }
    if (!confirm(`Delete custom country "${name}"? This cannot be undone.`)) {
        return;
    }
    const ok = await deleteCustomCountryByName(name);
    if (ok) {
        sendStatus(`Deleted custom country ${name}`);
    } else {
        sendStatus(`Failed to delete ${name}`);
    }
}
function toggleAddCountryFields(player) {
    const select = document.getElementById(`player${player}Country`);
    const form = document.getElementById(`player${player}AddCountryForm`);
    if (select && form) {
        form.style.display = select.value === 'ADD_NEW' ? 'block' : 'none';
        if (select.value === 'ADD_NEW') {
            select.value = '';
        }
    }
}

function cancelAddCountry(player) {
    const select = document.getElementById(`player${player}Country`);
    const form = document.getElementById(`player${player}AddCountryForm`);
    const nameInput = document.getElementById(`player${player}CountryName`);
    const flagInput = document.getElementById(`player${player}CountryFlag`);
    if (select) select.value = '';
    if (form) form.style.display = 'none';
    if (nameInput) nameInput.value = '';
    if (flagInput) flagInput.value = '';
}

async function addNewCountry(player) {
    const nameInput = document.getElementById(`player${player}CountryName`);
    const flagInput = document.getElementById(`player${player}CountryFlag`);
    const name = nameInput?.value.trim();
    const flag = flagInput?.value.trim();
    if (!name || !flag) {
        alert('Please enter both country name and flag');
        return;
    }
    await saveCustomCountry(name, flag);
    await populateAllCountryDropdowns();
    const select = document.getElementById(`player${player}Country`);
    if (select) select.value = name;
    cancelAddCountry(player);
}

function applyPlayerColors(state) {
    const country1 = state?.player1Country ?? document.getElementById('player1Country')?.value.trim();
    const country2 = state?.player2Country ?? document.getElementById('player2Country')?.value.trim();
    const initialColor1 = getCountryColor(country1);
    const initialColor2 = getCountryColor(country2);
    const [color1, color2] = getDistinctColors(initialColor1, initialColor2);
    const score1El = document.getElementById('score1');
    const score2El = document.getElementById('score2');
    if (score1El) {
        score1El.style.backgroundColor = color1;
        score1El.style.color = '#fff';
        score1El.style.boxShadow = 'inset 0 0 0 8px rgba(0,0,0,0.08)';
    }
    if (score2El) {
        score2El.style.backgroundColor = color2;
        score2El.style.color = '#fff';
        score2El.style.boxShadow = 'inset 0 0 0 8px rgba(0,0,0,0.08)';
    }
}

async function init() {
    await populateAllCountryDropdowns();
    resetMatchState(false);
    channel = createChannel();

    const latestState = await loadLatestState();
    if (latestState) {
        updateDisplay(latestState);
    }

    updateDisplay();
    const currentUser = getCurrentUser();
    lockApp();

    if (currentUser) {
        await unlockApp(currentUser.username);
    } else {
        showLogin();
    }
}

function createChannel() {
    if (window.BroadcastChannel) {
        const bc = new BroadcastChannel('badminton-scoreboard');
        bc.onmessage = (event) => {
            if (event.data && event.data.type === 'state') {
                updateDisplay(event.data.payload);
            }
        };
        return bc;
    }
    return null;
}

function getState() {
    const player1CountrySelect = document.getElementById('player1Country');
    const player2CountrySelect = document.getElementById('player2Country');
    const player1Country = player1CountrySelect?.value.trim() || '';
    const player2Country = player2CountrySelect?.value.trim() || '';
    
    const countries = customCountries || [];
    const player1CountryData = countries.find((c) => c.name === player1Country);
    const player2CountryData = countries.find((c) => c.name === player2Country);

    return {
        player1: document.getElementById('name1').innerText,
        player2: document.getElementById('name2').innerText,
        player1Country,
        player1CountryFlag: player1CountryData?.flag || '',
        player2Country,
        player2CountryFlag: player2CountryData?.flag || '',
        score1,
        score2,
        currentGame,
        gameWins1,
        gameWins2,
        gameHistory,
        currentServer,
        matchOver,
        elapsedSeconds: matchSeconds,
        timestamp: Date.now()
    };
}

function updateDisplay(state) {
    if (state) {
        score1 = state.score1;
        score2 = state.score2;
        currentGame = state.currentGame;
        gameWins1 = state.gameWins1;
        gameWins2 = state.gameWins2;
        gameHistory = Array.isArray(state.gameHistory) ? state.gameHistory : [];
        document.getElementById('name1').innerText = state.player1 || 'Player 1';
        document.getElementById('name2').innerText = state.player2 || 'Player 2';
    }

    document.getElementById('score1').innerText = score1;
    document.getElementById('score2').innerText = score2;
    applyPlayerColors(state);
    if (state && typeof state.elapsedSeconds === 'number') {
        matchSeconds = state.elapsedSeconds;
        updateTimerDisplay();
    }

    const currentGameEl = document.getElementById('currentGame');
    if (currentGameEl) {
        currentGameEl.innerText = currentGame;
    }

    const wins1El = document.getElementById('wins1');
    if (wins1El) {
        wins1El.innerText = gameWins1;
    }

    const wins2El = document.getElementById('wins2');
    if (wins2El) {
        wins2El.innerText = gameWins2;
    }

    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    for (let gameIndex = 1; gameIndex <= maxGames; gameIndex++) {
        const p1El = document.getElementById(`game${gameIndex}p1`);
        const p2El = document.getElementById(`game${gameIndex}p2`);
        const entry = gameHistory.find((g) => g.game === gameIndex);

        if (entry) {
            if (p1El) p1El.innerText = entry.score1;
            if (p2El) p2El.innerText = entry.score2;
            if (p1El) p1El.classList.toggle('game-winner', entry.winner === 1);
            if (p2El) p2El.classList.toggle('game-winner', entry.winner === 2);
        } else {
            if (p1El) {
                p1El.innerText = '-';
                p1El.classList.remove('game-winner');
            }
            if (p2El) {
                p2El.innerText = '-';
                p2El.classList.remove('game-winner');
            }
        }
    }
}

function sendStatus(message) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerText = message;
    }
}

async function broadcastState() {
    const state = getState();
    const currentUser = getCurrentUser();
    const userEmail = currentUser?.email?.toLowerCase() || null;
    if (channel) {
        channel.postMessage({ type: 'state', payload: state, user: userEmail });
        sendStatus('Status: broadcast sent.');
    } else {
        localStorage.setItem(getNamespacedKey(BASE_STATE_KEY), JSON.stringify(state));
        sendStatus('Status: broadcast sent via storage fallback.');
    }
    await saveLatestState(state);
}

window.addEventListener('storage', (event) => {
    if (event.key === getNamespacedKey(BASE_STATE_KEY) && event.newValue) {
        try {
            const state = JSON.parse(event.newValue);
            if (state && state.timestamp) {
                updateDisplay(state);
            }
        } catch (err) {
            console.error('Failed to parse state from storage event', err);
        }
    }
});

async function startMatch() {
    // Prevent starting match if both countries are not selected
    const player1Country = document.getElementById('player1Country')?.value.trim();
    const player2Country = document.getElementById('player2Country')?.value.trim();
    if (!player1Country || !player2Country) {
        sendStatus('Please select both countries before starting the match.');
        return;
    }

    // If timer is running, do nothing (already started or resumed)
    if (timerInterval) {
        sendStatus('Timer is already running.');
        return;
    }

    // If matchSeconds is 0, this is a new match, so reset state and names
    if (matchSeconds === 0) {
        resetMatchState(false);

        const p1 = document.getElementById('player1Name').value.trim();
        const p2 = document.getElementById('player2Name').value.trim();

        if (p1 !== '') {
            document.getElementById('name1').innerText = p1;
        }
        if (p2 !== '') {
            document.getElementById('name2').innerText = p2;
        }

        updateDisplay();

        // create match on server (best-effort). include country flags for custom entries if available
        try {
            const countries = customCountries || [];
            const p1Country = document.getElementById('player1Country')?.value?.trim() || '';
            const p2Country = document.getElementById('player2Country')?.value?.trim() || '';
            const p1Flag = (countries.find((c) => c.name === p1Country) || {}).flag || '';
            const p2Flag = (countries.find((c) => c.name === p2Country) || {}).flag || '';
            const resp = await apiRequest('/api/matches', {
                method: 'POST',
                body: JSON.stringify({
                    player1Name: document.getElementById('name1').innerText,
                    player2Name: document.getElementById('name2').innerText,
                    player1Country: p1Country,
                    player2Country: p2Country,
                    player1CountryFlag: p1Flag,
                    player2CountryFlag: p2Flag
                })
            });
            currentMatchId = resp.matchId;
            currentGameId = resp.gameId;
            player1DbId = resp.player1Id;
            player2DbId = resp.player2Id;
            sendStatus('Match created on server.');
        } catch (err) {
            console.warn('Failed to create match on server:', err.message || err);
        }
    }
    // Start or resume timer
    startTimer();
    broadcastState();
}

async function addPoint(player) {
    // Prevent adding points if match is over
    if (matchOver) {
        return;
    }

    // Prevent adding points if match hasn't started (timer not running)
    if (!timerInterval) {
        sendStatus('Start the match first!');
        return;
    }

    // Prevent adding points if both countries are not selected
    const player1Country = document.getElementById('player1Country')?.value.trim();
    const player2Country = document.getElementById('player2Country')?.value.trim();
    if (!player1Country || !player2Country) {
        sendStatus('Please select both countries before adding points.');
        return;
    }

    if (player === 1) {
        score1++;
    }
    if (player === 2) {
        score2++;
    }

    currentServer = player;
    updateDisplay();
    await checkWinner();
    // update server-side game score (best-effort)
    if (currentGameId) {
        try {
            const resp = await apiRequest(`/api/games/${currentGameId}/score`, {
                method: 'PATCH',
                body: JSON.stringify({ player })
            });
            score1 = resp.score1;
            score2 = resp.score2;
            updateDisplay();
        } catch (err) {
            console.warn('Failed to update game score on server:', err.message || err);
        }
    }
    await broadcastState();
}

async function checkWinner() {
    if (hasWinner(score1, score2)) {
        return await finishGame(1);
    }
    if (hasWinner(score2, score1)) {
        return await finishGame(2);
    }
    return false;
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

async function finishGame(winner) {
    const winnerName = document.getElementById(`name${winner}`).innerText;
    const durationSeconds = matchSeconds - currentGameStartSeconds;
    gameHistory.push({ game: currentGame, score1, score2, winner, durationSeconds });

    if (winner === 1) {
        gameWins1++;
    } else {
        gameWins2++;
    }

    const resultText = `Game ${currentGame} won by ${winnerName}`;

    if (gameWins1 === 2 || gameWins2 === 2 || currentGame === maxGames) {
        matchOver = true;
        stopTimer();
        sendStatus(`${resultText}. ${winnerName} wins the match!`);
        // finish current game and match on server (best-effort)
        try {
            if (currentGameId) {
                await apiRequest(`/api/games/${currentGameId}/finish`, {
                    method: 'PATCH',
                    body: JSON.stringify({ winner })
                });
            }
            if (currentMatchId) {
                const winnerPlayerId = (winner === 1 ? player1DbId : player2DbId) || null;
                await apiRequest(`/api/matches/${currentMatchId}/finish`, {
                    method: 'PATCH',
                    body: JSON.stringify({ winnerPlayerId, durationSeconds })
                });
            }
        } catch (err) {
            console.warn('Failed to finalize game/match on server:', err.message || err);
        }

        await addCompletedMatchToLog(getState());
        updateDisplay();
        await broadcastState();
    } else {
        currentGame++;
        score1 = 0;
        score2 = 0;
        currentServer = null;
        currentGameStartSeconds = matchSeconds;
        sendStatus(`${resultText}. Starting game ${currentGame}.`);
        updateDisplay();
        // create next game on server if match exists
        try {
            if (currentMatchId) {
                const resp = await apiRequest(`/api/matches/${currentMatchId}/games`, {
                    method: 'POST',
                    body: JSON.stringify({})
                });
                currentGameId = resp.gameId;
            }
        } catch (err) {
            console.warn('Failed to create next game on server:', err.message || err);
        }
    }

    return true;
}

function resetMatch() {
    resetMatchState(false);
    updateDisplay();
    broadcastState();
    sendStatus('Status: match reset.');
}

function resetMatchState(clearNames) {
    score1 = 0;
    score2 = 0;
    currentGame = 1;
    gameWins1 = 0;
    gameWins2 = 0;
    gameHistory = [];
    currentServer = null;
    matchOver = false;
    currentGameStartSeconds = 0;
    resetTimer();

    if (clearNames) {
        document.getElementById('name1').innerText = 'Player 1';
        document.getElementById('name2').innerText = 'Player 2';
    }
}

window.addEventListener('load', init);
