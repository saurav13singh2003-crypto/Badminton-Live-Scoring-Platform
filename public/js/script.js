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
let currentPlayer1Country = '';
let currentPlayer1CountryFlag = '';
let currentPlayer2Country = '';
let currentPlayer2CountryFlag = '';
let cachedPlayerRoster = [];

const maxGames = 3;
const scoreTarget = 21;
const finalPoint = 31;

function getApiBase() {
    const configured = (window.__BADMINTON_API_BASE__ || '').toString().trim();
    if (configured) {
        return configured.replace(/\/+$/, '');
    }

    const { port, hostname } = window.location;
    if (port && port !== '4000' && hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '0.0.0.0') {
        return 'http://localhost:4000';
    }

    if (port && port !== '4000') {
        return 'http://localhost:4000';
    }

    return '';
}

const API_BASE = getApiBase();
let customCountries = [];
let selectedRegistrationType = 'viewer';

const defaultCountries = [
    'India', 'China', 'Indonesia', 'Malaysia', 'South Korea', 'Japan', 'England',
    'Thailand', 'Denmark', 'Brazil', 'United States', 'France', 'Spain', 'Germany', 'Australia'
];

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

function resolveCountryFlag(countryName) {
    if (!countryName) return '';
    const cleanName = String(countryName).trim();
    if (!cleanName) return '';
    const customMatch = (customCountries || []).find((country) => country.name === cleanName);
    if (customMatch && customMatch.flag) return customMatch.flag;
    return defaultCountryFlags[cleanName] || '';
}

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

function isCurrentUserAdmin() {
    return true;
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
    document.getElementById('matchTimerDisplay')?.classList.add('is-visible');
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
    document.getElementById('matchTimerDisplay')?.classList.remove('is-visible');
}

const CURRENT_USER_KEY = 'badminton-current-user';
const BASE_MATCH_LOG_KEY = 'badminton-match-log';
const BASE_STATE_KEY = 'badminton-latest-state';
const BASE_CUSTOM_COUNTRY_KEY = 'custom-countries';
const BASE_PLAYERS_KEY = 'badminton-players';

async function apiRequest(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json'
    };
    const request = {
        headers,
        ...options
    };
    const response = await fetch(`${API_BASE}${path}`, request);
    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.message || errorBody?.error || response.statusText || 'Request failed';
        throw new Error(message);
    }

    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (err) {
        return text;
    }
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

function getNamespacedKey(baseKey) {
    return baseKey;
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

async function loadMatchLog() {
    try {
        const data = await apiRequest('/api/matches/history');
        const log = Array.isArray(data?.log) ? data.log : [];
        if (log.length) {
            saveNamespaced(BASE_MATCH_LOG_KEY, log);
            return log;
        }
    } catch (err) {
        console.warn('Failed to load match log from API, falling back to browser storage', err);
    }

    const stored = loadNamespaced(BASE_MATCH_LOG_KEY);
    return Array.isArray(stored) ? stored : [];
}

async function saveMatchLog(log) {
    try {
        await apiRequest('/api/match-log', { method: 'POST', body: JSON.stringify({ log }) });
    } catch (err) {
        console.warn('Could not save match log to API; saving locally only', err);
    }
    saveNamespaced(BASE_MATCH_LOG_KEY, log);
}

async function loadCustomCountries() {
    try {
        const data = await apiRequest('/api/custom-countries');
        const countries = Array.isArray(data?.countries) ? data.countries : [];
        customCountries = countries;
        saveNamespaced(BASE_CUSTOM_COUNTRY_KEY, countries);
        return countries;
    } catch (err) {
        console.warn('Failed to load custom countries from server, falling back to browser storage', err);
    }

    try {
        const saved = loadNamespaced(BASE_CUSTOM_COUNTRY_KEY);
        if (Array.isArray(saved) && saved.length > 0) {
            customCountries = saved;
            return saved;
        }
    } catch (err) {
        console.warn('Failed to load stored custom countries', err);
    }

    return [];
}

async function saveCustomCountry(name, flag) {
    const countries = await loadCustomCountries();
    const updated = countries.some((c) => c.name.toLowerCase() === name.toLowerCase())
        ? countries
        : [...countries, { name, flag }];
    customCountries = updated;
    saveNamespaced(BASE_CUSTOM_COUNTRY_KEY, updated);
    await apiRequest('/api/custom-countries', { method: 'POST', body: JSON.stringify({ name, flag }) });
    return updated;
}

async function saveLatestState(state) {
    await apiRequest('/api/latest-state', { method: 'POST', body: JSON.stringify({ state }) });
}

async function loadLatestState() {
    try {
        const data = await apiRequest('/api/latest-state');
        if (data && data.state != null) {
            saveNamespaced(BASE_STATE_KEY, data.state);
            return data.state;
        }
    } catch (err) {
        console.warn('Failed to load latest state from API, falling back to browser storage', err);
    }

    const saved = localStorage.getItem(getNamespacedKey(BASE_STATE_KEY));
    if (!saved) {
        return null;
    }
    try {
        return JSON.parse(saved);
    } catch (err) {
        console.error('Failed to parse saved state', err);
        return null;
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

function renderPlayerDropdowns(players) {
    cachedPlayerRoster = Array.isArray(players) ? players : [];
    const playerSelects = [
        document.getElementById('player1Select'),
        document.getElementById('player2Select')
    ];

    playerSelects.forEach((select) => {
        if (!select) return;
        const existingValue = select.value;
        select.innerHTML = '<option value="">Select Player</option><option value="ADD_NEW">+ Add New Player</option>';
        players.forEach((player) => {
            const option = document.createElement('option');
            option.value = player.name;
            option.textContent = player.player_id ? `${player.name} (${player.player_id})` : player.name;
            select.appendChild(option);
        });
        if (existingValue && existingValue !== 'ADD_NEW' && players.some((player) => player.name === existingValue)) {
            select.value = existingValue;
        }
    });

    const player1Select = document.getElementById('player1Select');
    const player2Select = document.getElementById('player2Select');
    if (player1Select) {
        updateScoringPlayerCard(1);
        syncSelectedPlayerId(1);
    }
    if (player2Select) {
        updateScoringPlayerCard(2);
        syncSelectedPlayerId(2);
    }
}

function updateScoringPlayerCard(player, playerDetails = null) {
    const select = document.getElementById(`player${player}Select`);
    const supplied = playerDetails && typeof playerDetails === 'object' ? playerDetails : null;
    const selectedName = (supplied?.name || (typeof playerDetails === 'string' ? playerDetails : select?.value) || '').trim();
    const playerName = selectedName && selectedName !== 'ADD_NEW' ? selectedName : `Player ${player}`;
    const rosterEntry = cachedPlayerRoster.find((entry) => entry.name?.toLocaleLowerCase() === playerName.toLocaleLowerCase());
    const details = { ...(rosterEntry || {}), ...(supplied || {}), name: playerName };
    const nameElement = document.getElementById(`name${player}`);
    const photoElement = document.getElementById(`player${player}Photo`);
    const backdrop = document.getElementById(`player${player}FlagBackdrop`);
    const flagImage = backdrop?.querySelector('img');
    const flagText = backdrop?.querySelector('span');

    if (nameElement) nameElement.textContent = playerName;
    if (photoElement) {
        const photoUrl = /^https?:\/\//i.test(details.photo_url || '') ? details.photo_url : '';
        photoElement.classList.toggle('hidden', !photoUrl);
        photoElement.alt = photoUrl ? `${playerName} portrait` : '';
        photoElement.onerror = () => photoElement.classList.add('hidden');
        if (photoUrl) photoElement.src = photoUrl;
        else photoElement.removeAttribute('src');
    }

    const country = details.country || (player === 1 ? currentPlayer1Country : currentPlayer2Country);
    const flag = details.flag || resolveCountryFlag(country);
    const flagUrl = /^https?:\/\//i.test(flag || '') ? flag : '';
    if (flagImage) {
        flagImage.classList.toggle('hidden', !flagUrl);
        flagImage.onerror = () => flagImage.classList.add('hidden');
        if (flagUrl) flagImage.src = flagUrl;
        else flagImage.removeAttribute('src');
    }
    if (flagText) {
        flagText.textContent = flag && !flagUrl ? flag : '';
        flagText.classList.toggle('hidden', !flag || Boolean(flagUrl));
    }
    if (backdrop) backdrop.dataset.country = country || '';
}

async function loadPlayers() {
    try {
        const data = await apiRequest('/api/players');
        const savedPlayers = loadNamespaced(BASE_PLAYERS_KEY);
        const serverPlayers = Array.isArray(data.players) ? data.players : [];
        const playersByName = new Map();
        // Keep locally saved names available if the server's roster is temporarily
        // empty, then let the database copy replace any matching cached entry.
        [...(Array.isArray(savedPlayers) ? savedPlayers : []), ...serverPlayers].forEach((player) => {
            const name = typeof player?.name === 'string' ? player.name.trim() : '';
            if (name) playersByName.set(name.toLocaleLowerCase(), { ...playersByName.get(name.toLocaleLowerCase()), ...player, name });
        });
        const players = [...playersByName.values()].sort((a, b) => a.name.localeCompare(b.name));
        saveNamespaced(BASE_PLAYERS_KEY, players);
        renderPlayerDropdowns(players);
        return players;
    } catch (err) {
        console.error('Failed to load players from the database', err);
        const savedPlayers = loadNamespaced(BASE_PLAYERS_KEY);
        const players = Array.isArray(savedPlayers) ? savedPlayers : [];
        renderPlayerDropdowns(players);
        sendStatus(`Could not refresh players from the database; showing saved players from this browser. ${err.message}`);
        return players.length ? players : null;
    }
}

async function retrievePlayersFromDatabase() {
    const button = document.getElementById('reloadPlayersBtn');
    if (button) {
        button.disabled = true;
        button.textContent = 'Loading Players...';
    }

    try {
        const data = await apiRequest('/api/players');
        if (!Array.isArray(data?.players)) throw new Error('The server returned an invalid player list.');
        const players = data.players
            .filter((player) => typeof player?.name === 'string' && player.name.trim())
            .sort((a, b) => a.name.localeCompare(b.name));
        saveNamespaced(BASE_PLAYERS_KEY, players);
        renderPlayerDropdowns(players);
        sendStatus(players.length
            ? `Loaded ${players.length} saved players from the database.`
            : 'Connected to the database, but it contains no saved players.');
    } catch (err) {
        console.error('Failed to retrieve players from the database', err);
        sendStatus(`Could not retrieve players from the database: ${err.message}`);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'Reload Players from Database';
        }
    }
}

function toggleAddPlayerFields(player) {
    const select = document.getElementById(`player${player}Select`);
    const form = document.getElementById(`player${player}AddPlayerForm`);
    const input = document.getElementById(`player${player}NewName`);
    if (select && form) {
        const shouldShow = select.value === 'ADD_NEW';
        form.style.display = shouldShow ? 'block' : 'none';
        if (shouldShow && input) {
            input.focus();
        }
    }
}

function cancelAddPlayer(player) {
    const select = document.getElementById(`player${player}Select`);
    const form = document.getElementById(`player${player}AddPlayerForm`);
    const input = document.getElementById(`player${player}NewName`);
    const idInput = document.getElementById(`player${player}NewPlayerId`);
    const profileFields = ['Country', 'Age', 'Height', 'Weight', 'Hand', 'PhotoUrl'];
    if (select) select.value = '';
    if (form) form.style.display = 'none';
    if (input) input.value = '';
    if (idInput) idInput.value = '';
    profileFields.forEach((field) => {
        const profileInput = document.getElementById(`player${player}New${field}`);
        if (profileInput) profileInput.value = '';
    });
}

async function deleteSelectedPlayer(player) {
    const select = document.getElementById(`player${player}Select`);
    const selectedName = select?.value?.trim();
    if (!selectedName || selectedName === 'ADD_NEW') {
        alert('Please select a player to delete.');
        return;
    }

    if (!confirm(`Delete player "${selectedName}" permanently from the database?`)) {
        return;
    }

    try {
        const data = await apiRequest('/api/players');
        const players = Array.isArray(data.players) ? data.players : [];
        const target = players.find((playerEntry) => playerEntry.name.toLowerCase() === selectedName.toLowerCase());

        if (!target) {
            throw new Error('Player not found in database.');
        }

        await apiRequest(`/api/players/${target.id}`, {
            method: 'DELETE'
        });

        saveNamespaced(BASE_PLAYERS_KEY, players.filter((entry) => entry.id !== target.id));
        await loadPlayers();
        if (select) select.value = '';
        sendStatus(`Deleted player ${selectedName} from the database.`);
    } catch (err) {
        sendStatus(`Failed to delete player: ${err.message || 'server request failed'}`);
    }
}

async function syncSelectedPlayerId(player) {
    const select = document.getElementById(`player${player}Select`);
    const input = document.getElementById(`player${player}PlayerId`);
    const selectedName = select?.value?.trim();
    if (!input || !selectedName || selectedName === 'ADD_NEW' || !selectedName) {
        return;
    }

    try {
        const data = await apiRequest('/api/players');
        const players = Array.isArray(data.players) ? data.players : [];
        const selectedPlayer = players.find((entry) => entry.name.toLowerCase() === selectedName.toLowerCase());
        if (selectedPlayer) {
            input.value = selectedPlayer.player_id || '';
        }
    } catch (err) {
        console.warn('Failed to sync selected player ID', err);
    }
}

async function savePlayerId(player) {
    const select = document.getElementById(`player${player}Select`);
    const input = document.getElementById(`player${player}PlayerId`);
    const selectedName = select?.value?.trim();
    const playerId = input?.value.trim();

    if (!selectedName || selectedName === 'ADD_NEW') {
        alert('Please select a player before assigning a Player ID.');
        return;
    }

    if (!playerId) {
        alert('Please enter a Player ID value before saving.');
        return;
    }

    try {
        const data = await apiRequest('/api/players');
        const players = Array.isArray(data.players) ? data.players : [];
        const target = players.find((entry) => entry.name.toLowerCase() === selectedName.toLowerCase());

        if (!target) {
            throw new Error('Selected player was not found in the database.');
        }

        const payload = {
            name: target.name,
            player_id: playerId,
            country: target.country,
            flag: target.flag,
            age: target.age,
            height_cm: target.height_cm,
            weight_kg: target.weight_kg,
            playing_hand: target.playing_hand,
            photo_url: target.photo_url
        };
        await apiRequest(`/api/players/${target.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        saveNamespaced(BASE_PLAYERS_KEY, players.map((entry) => entry.id === target.id ? { ...entry, ...payload } : entry));
        await loadPlayers();
        if (input) input.value = playerId;
        sendStatus(`Saved Player ID ${playerId} for ${selectedName}.`);
    } catch (err) {
        sendStatus(`Failed to save Player ID: ${err.message || 'server request failed'}`);
    }
}

async function editSelectedPlayerDetails(player) {
    const select = document.getElementById(`player${player}Select`);
    const selectedName = select?.value?.trim();
    if (!selectedName || selectedName === 'ADD_NEW') {
        sendStatus('Select a saved player before editing their details.');
        return;
    }

    try {
        const data = await apiRequest('/api/players');
        const players = Array.isArray(data.players) ? data.players : [];
        const target = players.find((entry) => entry.name.toLowerCase() === selectedName.toLowerCase());
        if (!target) throw new Error('Player not found in the database.');

        document.getElementById(`player${player}EditAge`).value = target.age ?? '';
        document.getElementById(`player${player}EditCountry`).value = target.country || '';
        document.getElementById(`player${player}EditHeight`).value = target.height_cm ?? '';
        document.getElementById(`player${player}EditWeight`).value = target.weight_kg ?? '';
        document.getElementById(`player${player}EditHand`).value = target.playing_hand || '';
        document.getElementById(`player${player}EditPhotoUrl`).value = target.photo_url || '';
        document.getElementById(`player${player}EditPlayerForm`).style.display = 'block';
    } catch (err) {
        sendStatus(`Could not load player details: ${err.message || 'server request failed'}`);
    }
}

function cancelEditPlayerDetails(player) {
    document.getElementById(`player${player}EditPlayerForm`).style.display = 'none';
}

async function savePlayerDetails(player) {
    const select = document.getElementById(`player${player}Select`);
    const selectedName = select?.value?.trim();
    if (!selectedName || selectedName === 'ADD_NEW') {
        sendStatus('Select a saved player before saving their details.');
        return;
    }

    try {
        const data = await apiRequest('/api/players');
        const players = Array.isArray(data.players) ? data.players : [];
        const target = players.find((entry) => entry.name.toLowerCase() === selectedName.toLowerCase());
        if (!target) throw new Error('Player not found in the database.');

        const age = document.getElementById(`player${player}EditAge`).value;
        const country = document.getElementById(`player${player}EditCountry`).value.trim();
        const height = document.getElementById(`player${player}EditHeight`).value;
        const weight = document.getElementById(`player${player}EditWeight`).value;
        const hand = document.getElementById(`player${player}EditHand`).value;
        const photoUrl = document.getElementById(`player${player}EditPhotoUrl`).value.trim();
        const payload = {
            name: target.name,
            player_id: target.player_id,
            country: country || null,
            flag: target.flag,
            age: age || null,
            height_cm: height || null,
            weight_kg: weight || null,
            playing_hand: hand || null,
            photo_url: photoUrl || null
        };
        const updated = await apiRequest(`/api/players/${target.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        saveNamespaced(BASE_PLAYERS_KEY, players.map((entry) => entry.id === target.id ? updated.player : entry));
        await loadPlayers();
        cancelEditPlayerDetails(player);
        sendStatus(`Saved profile details for ${target.name}.`);
    } catch (err) {
        sendStatus(`Failed to save player details: ${err.message || 'server request failed'}`);
    }
}

async function addNewPlayer(player) {
    const input = document.getElementById(`player${player}NewName`);
    const idInput = document.getElementById(`player${player}NewPlayerId`);
    const select = document.getElementById(`player${player}Select`);
    const name = input?.value.trim();
    const country = document.getElementById(`player${player}NewCountry`)?.value.trim();
    const age = document.getElementById(`player${player}NewAge`)?.value;
    const height = document.getElementById(`player${player}NewHeight`)?.value;
    const weight = document.getElementById(`player${player}NewWeight`)?.value;
    const hand = document.getElementById(`player${player}NewHand`)?.value;
    const photoUrl = document.getElementById(`player${player}NewPhotoUrl`)?.value.trim();
    if (!name) {
        alert('Please enter a player name.');
        return;
    }

    try {
        const data = await apiRequest('/api/players', {
            method: 'POST',
            body: JSON.stringify({
                name,
                player_id: idInput?.value.trim() || null,
                country: country || null,
                age: age || null,
                height_cm: height || null,
                weight_kg: weight || null,
                playing_hand: hand || null,
                photo_url: photoUrl || null
            })
        });
        const savedPlayers = loadNamespaced(BASE_PLAYERS_KEY);
        saveNamespaced(BASE_PLAYERS_KEY, [
            ...(Array.isArray(savedPlayers) ? savedPlayers.filter((entry) => entry.name.toLowerCase() !== data.player.name.toLowerCase()) : []),
            data.player
        ]);
        await loadPlayers();
        if (select && data.player?.name) {
            select.value = data.player.name;
        }
        if (input) input.value = '';
        if (idInput) idInput.value = '';
        ['Country', 'Age', 'Height', 'Weight', 'Hand', 'PhotoUrl'].forEach((field) => {
            const profileInput = document.getElementById(`player${player}New${field}`);
            if (profileInput) profileInput.value = '';
        });
        const form = document.getElementById(`player${player}AddPlayerForm`);
        if (form) form.style.display = 'none';
        sendStatus(`Added player ${data.player.name}.`);
    } catch (err) {
        sendStatus(`Failed to add player: ${err.message || 'server request failed'}`);
    }
}

async function populateAllCountryDropdowns() {
    const select1 = document.getElementById('player1Country');
    const select2 = document.getElementById('player2Country');
    customCountries = await loadCustomCountries();

    const buildOptions = (select) => {
        if (!select) return;
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Country';
        select.innerHTML = '';
        select.appendChild(defaultOption);

        for (const country of defaultCountries) {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = country;
            select.appendChild(option);
        }

        const addNewOption = document.createElement('option');
        addNewOption.value = 'ADD_NEW';
        addNewOption.textContent = '+ Add New Country';
        select.appendChild(addNewOption);

        populateCustomCountriesInDropdown(select, customCountries);
    };

    buildOptions(select1);
    buildOptions(select2);
}

async function deleteCustomCountryByName(name) {
    if (!name) return false;
    const countries = await loadCustomCountries();
    const exists = countries.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!exists) return false;
    const updated = countries.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
    customCountries = updated;
    saveNamespaced(BASE_CUSTOM_COUNTRY_KEY, updated);
    await apiRequest('/api/custom-countries', { method: 'DELETE', body: JSON.stringify({ name }) });
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
    const form = document.getElementById(`player${player}AddCountryForm`);
    const name = nameInput?.value.trim();
    const flag = flagInput?.value.trim();
    if (!name || !flag) {
        alert('Please enter both country name and flag');
        return;
    }
    await saveCustomCountry(name, flag);
    await populateAllCountryDropdowns();
    const select = document.getElementById(`player${player}Country`);
    if (select) {
        select.value = name;
    }
    if (form) form.style.display = 'none';
    if (nameInput) nameInput.value = '';
    if (flagInput) flagInput.value = '';
}

function applyPlayerColors(state) {
    const country1 = state?.player1Country ?? currentPlayer1Country;
    const country2 = state?.player2Country ?? currentPlayer2Country;
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
    setCurrentUser({ role: 'admin', username: 'Admin' });
    document.getElementById('mainApp')?.classList.remove('hidden');
    const players = await loadPlayers();
    customCountries = await loadCustomCountries();
    resetMatchState(false);
    channel = createChannel();
    const latestState = await loadLatestState();
    if (latestState) updateDisplay(latestState);
    updateDisplay();
    if (players !== null) sendStatus('Ready to broadcast.');
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
    return {
        player1: document.getElementById('name1').innerText,
        player2: document.getElementById('name2').innerText,
        player1Country: currentPlayer1Country,
        player1CountryFlag: currentPlayer1CountryFlag,
        player2Country: currentPlayer2Country,
        player2CountryFlag: currentPlayer2CountryFlag,
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
        currentPlayer1Country = state.player1Country || '';
        currentPlayer1CountryFlag = state.player1CountryFlag || '';
        currentPlayer2Country = state.player2Country || '';
        currentPlayer2CountryFlag = state.player2CountryFlag || '';
        document.getElementById('name1').innerText = state.player1 || 'Player 1';
        document.getElementById('name2').innerText = state.player2 || 'Player 2';
        updateScoringPlayerCard(1, {
            name: state.player1 || 'Player 1',
            country: currentPlayer1Country,
            flag: currentPlayer1CountryFlag
        });
        updateScoringPlayerCard(2, {
            name: state.player2 || 'Player 2',
            country: currentPlayer2Country,
            flag: currentPlayer2CountryFlag
        });
    } else {
        updateScoringPlayerCard(1);
        updateScoringPlayerCard(2);
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
    if (channel) {
        channel.postMessage({ type: 'state', payload: state });
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
    const player1Select = document.getElementById('player1Select');
    const player2Select = document.getElementById('player2Select');
    const player1Name = player1Select?.value?.trim();
    const player2Name = player2Select?.value?.trim();

    if (!player1Name || !player2Name || player1Name === 'ADD_NEW' || player2Name === 'ADD_NEW') {
        sendStatus('Please select both players before starting the match.');
        return;
    }
    if (timerInterval) {
        sendStatus('Timer is already running.');
        return;
    }

    if (matchSeconds === 0) {
        resetMatchState(false);

        document.getElementById('name1').innerText = player1Name;
        document.getElementById('name2').innerText = player2Name;

        updateDisplay();

        try {
            const rosterData = await apiRequest('/api/players');
            const roster = Array.isArray(rosterData.players) ? rosterData.players : [];
            const player1 = roster.find((entry) => entry.name.toLowerCase() === player1Name.toLowerCase());
            const player2 = roster.find((entry) => entry.name.toLowerCase() === player2Name.toLowerCase());
            if (!player1 || !player2) throw new Error('Could not load the selected players from the database. Reload the player list and try again.');

            const player1Country = player1.country || '';
            const player2Country = player2.country || '';
            const p1Flag = player1.flag || resolveCountryFlag(player1Country);
            const p2Flag = player2.flag || resolveCountryFlag(player2Country);
            currentPlayer1Country = player1Country;
            currentPlayer1CountryFlag = p1Flag;
            currentPlayer2Country = player2Country;
            currentPlayer2CountryFlag = p2Flag;
            updateScoringPlayerCard(1, player1);
            updateScoringPlayerCard(2, player2);
            const resp = await apiRequest('/api/matches', {
                method: 'POST',
                body: JSON.stringify({
                    player1Name,
                    player2Name,
                    player1Country,
                    player2Country,
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
            sendStatus(`Match was not started: ${err.message || 'server request failed'}`);
            return;
        }
    }
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

    if (!currentGameId) {
        sendStatus('No active server game. Start a match first.');
        return;
    }
    try {
        const resp = await apiRequest(`/api/games/${currentGameId}/score`, {
            method: 'PATCH',
            body: JSON.stringify({ player })
        });
        score1 = resp.score1;
        score2 = resp.score2;
    } catch (err) {
        sendStatus(`Score was not saved: ${err.message || 'server request failed'}`);
        return;
    }
    currentServer = player;
    updateDisplay();
    await checkWinner();
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
    stopTimer();
    gameHistory.push({ game: currentGame, score1, score2, winner, durationSeconds });

    if (winner === 1) {
        gameWins1++;
    } else {
        gameWins2++;
    }

    const resultText = `Game ${currentGame} won by ${winnerName}`;

    if (gameWins1 === 2 || gameWins2 === 2 || currentGame === maxGames) {
        matchOver = true;
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

        const shouldContinue = window.confirm(`${resultText}.\n\nContinue to Game ${currentGame}?`);
        if (shouldContinue) {
            startTimer();
            sendStatus(`${resultText}. Game ${currentGame} started.`);
        } else {
            sendStatus(`${resultText}. Match paused before Game ${currentGame}. Click Start Match when ready.`);
        }
    }

    return true;
}

function resetMatch() {
    if (!isCurrentUserAdmin()) {
        sendStatus('Admin access required to reset a match.');
        return;
    }
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
    currentPlayer1Country = '';
    currentPlayer1CountryFlag = '';
    currentPlayer2Country = '';
    currentPlayer2CountryFlag = '';
    resetTimer();

    if (clearNames) {
        document.getElementById('name1').innerText = 'Player 1';
        document.getElementById('name2').innerText = 'Player 2';
    }
}

window.addEventListener('load', init);
