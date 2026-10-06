const express = require('express');
const { getCollections, getPool } = require('../database/db');

const router = express.Router();
const SYSTEM_DATA_OWNER = '__badminton_system__';

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  // These values are rendered in the browser. Reject markup rather than relying
  // on a client to make unsafe values harmless.
  return text.length <= maxLength && !/[<>]/.test(text) ? text : '';
}

function cleanOptionalText(value, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  return cleanText(value, maxLength) || null;
}

function parseOptionalNumber(value, min, max, integer = false) {
  if (value === undefined || value === null || value === '') return { value: null, valid: true };
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max && (!integer || Number.isInteger(parsed));
  return { value: valid ? parsed : null, valid };
}

function parsePlayerProfileFields(body) {
  const age = parseOptionalNumber(body.age, 1, 120, true);
  const height = parseOptionalNumber(body.height_cm, 1, 300);
  const weight = parseOptionalNumber(body.weight_kg, 1, 500);
  const handValue = typeof body.playing_hand === 'string' ? body.playing_hand.trim().toLowerCase() : '';
  const handValid = !handValue || handValue === 'left' || handValue === 'right';
  const photoInput = body.photo_url == null ? '' : String(body.photo_url).trim();
  let photoUrl = null;
  let photoValid = photoInput.length <= 2048;
  if (photoInput && photoValid) {
    try {
      const parsed = new URL(photoInput);
      photoValid = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      if (photoValid) photoUrl = parsed.toString();
    } catch (err) {
      photoValid = false;
    }
  }

  return {
    valid: age.valid && height.valid && weight.valid && handValid && photoValid,
    age: age.value,
    height_cm: height.value,
    weight_kg: weight.value,
    playing_hand: handValid && handValue ? handValue : null,
    photo_url: photoUrl
  };
}

// Compatibility endpoints (custom countries, match-log, latest-state) backed by JSON tables
router.get('/custom-countries', async (req, res) => {
  try {
    const { customCountries } = getCollections();
    const result = await customCountries.findOne({ email: SYSTEM_DATA_OWNER });
    res.json({ countries: result?.countries || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load custom countries' });
  }
});

router.post('/custom-countries', async (req, res) => {
  const { name, flag } = req.body || {};
  const cleanName = cleanText(name, 80);
  const cleanFlag = cleanText(flag, 500);
  if (!cleanName || cleanName.length > 80 || !cleanFlag || cleanFlag.length > 500) {
    return res.status(400).json({ error: 'name and flag are required' });
  }

  try {
    const { customCountries } = getCollections();
    const update = await customCountries.findOneAndUpdate(
      { email: SYSTEM_DATA_OWNER },
      { $addToSet: { countries: { name: cleanName, flag: cleanFlag } } },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ countries: update.value.countries || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save custom country' });
  }
});

router.delete('/custom-countries', async (req, res) => {
  const { name } = req.body || {};
  const cleanName = cleanText(name, 80);
  if (!cleanName) return res.status(400).json({ error: 'name required' });
  try {
    const { customCountries } = getCollections();
    const doc = await customCountries.findOne({ email: SYSTEM_DATA_OWNER });
    const arr = doc?.countries || [];
    const updated = arr.filter((c) => c.name.toLowerCase() !== cleanName.toLowerCase());
    await customCountries.updateOne({ email: SYSTEM_DATA_OWNER }, { $set: { countries: updated } }, { upsert: true });
    res.json({ countries: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete custom country' });
  }
});

router.get('/match-log', async (req, res) => {
  try {
    const { matchLogs } = getCollections();
    const document = await matchLogs.findOne({ email: SYSTEM_DATA_OWNER });
    res.json({ log: document?.log || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load match log' });
  }
});

router.post('/match-log', async (req, res) => {
  const { log } = req.body || {};
  if (!Array.isArray(log)) {
    return res.status(400).json({ error: 'log array is required' });
  }

  try {
    const { matchLogs } = getCollections();
    await matchLogs.updateOne({ email: SYSTEM_DATA_OWNER }, { $set: { log } }, { upsert: true });
    res.json({ log });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save match log' });
  }
});

router.get('/latest-state', async (req, res) => {
  try {
    const { latestState } = getCollections();
    const doc = await latestState.findOne({ email: SYSTEM_DATA_OWNER });
    res.json({ state: doc?.state || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load latest state' });
  }
});

router.post('/latest-state', async (req, res) => {
  const { state } = req.body || {};
  if (!state) {
    return res.status(400).json({ error: 'state is required' });
  }

  try {
    const { latestState } = getCollections();
    await latestState.updateOne({ email: SYSTEM_DATA_OWNER }, { $set: { state } }, { upsert: true });
    res.json({ state });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save latest state' });
  }
});

// New SQL-backed match/game endpoints
// Helper: find or create player
async function findOrCreatePlayer(pool, name, country, flag, playerId = null) {
  name = cleanText(name, 100);
  if (!name) return null;
  const cleanPlayerId = cleanOptionalText(playerId, 100);
  const [rows] = await pool.execute(
    cleanPlayerId
      ? 'SELECT id, country, flag, player_id FROM players WHERE player_id = ? OR name = ? LIMIT 1'
      : 'SELECT id, country, flag, player_id FROM players WHERE name = ? LIMIT 1',
    cleanPlayerId ? [cleanPlayerId, name] : [name]
  );
  if (rows && rows[0]) {
    const current = rows[0];
    const needsUpdate = (country && current.country !== country) || (flag && current.flag !== flag) || (cleanPlayerId && current.player_id !== cleanPlayerId);
    if (needsUpdate) {
      await pool.execute(
        'UPDATE players SET country = ?, flag = ?, player_id = ? WHERE id = ?',
        [country || current.country || null, flag || current.flag || null, cleanPlayerId || current.player_id || null, current.id]
      );
    }
    return current.id;
  }
  const [result] = await pool.execute(
    'INSERT INTO players (name, player_id, country, flag) VALUES (?, ?, ?, ?)',
    [name, cleanPlayerId || null, country || null, flag || null]
  );
  return result.insertId;
}

router.get('/players', async (req, res) => {
  try {
    const pool = getPool();
    const [players] = await pool.execute('SELECT id, name, player_id, country, flag, age, height_cm, weight_kg, playing_hand, photo_url FROM players ORDER BY name');
    res.json({ players });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load players' });
  }
});

router.post('/players', async (req, res) => {
  const name = cleanText(req.body?.name, 100);
  const playerId = cleanOptionalText(req.body?.player_id, 100);
  const country = cleanOptionalText(req.body?.country, 80);
  const flag = cleanOptionalText(req.body?.flag, 500);
  const profile = parsePlayerProfileFields(req.body || {});
  if (!name) return res.status(400).json({ error: 'valid player name is required' });
  if (!profile.valid) return res.status(400).json({ error: 'age, height, weight, hand, or photo URL is invalid' });
  try {
    const [result] = await getPool().execute(
      'INSERT INTO players (name, player_id, country, flag, age, height_cm, weight_kg, playing_hand, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, playerId, country, flag, profile.age, profile.height_cm, profile.weight_kg, profile.playing_hand, profile.photo_url]
    );
    res.status(201).json({ player: { id: result.insertId, name, player_id: playerId, country, flag, ...profile } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'player already exists or player id is already used' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

router.put('/players/:id', async (req, res) => {
  const id = Number(req.params.id);
  const name = cleanText(req.body?.name, 100);
  const playerId = cleanOptionalText(req.body?.player_id, 100);
  const country = cleanOptionalText(req.body?.country, 80);
  const flag = cleanOptionalText(req.body?.flag, 500);
  const profile = parsePlayerProfileFields(req.body || {});
  if (!Number.isInteger(id) || id < 1 || !name) return res.status(400).json({ error: 'valid player id and name are required' });
  if (!profile.valid) return res.status(400).json({ error: 'age, height, weight, hand, or photo URL is invalid' });
  try {
    const [result] = await getPool().execute(
      'UPDATE players SET name = ?, player_id = ?, country = ?, flag = ?, age = ?, height_cm = ?, weight_kg = ?, playing_hand = ?, photo_url = ? WHERE id = ?',
      [name, playerId, country, flag, profile.age, profile.height_cm, profile.weight_kg, profile.playing_hand, profile.photo_url, id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'player not found' });
    res.json({ player: { id, name, player_id: playerId, country, flag, ...profile } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'player already exists or player id is already used' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

router.delete('/players/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'valid player id is required' });
  try {
    const [result] = await getPool().execute('DELETE FROM players WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'player not found' });
    res.status(204).end();
  } catch (err) {
    // Existing match/game rows may correctly prevent deletion through foreign keys.
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'player is referenced by an existing match' });
    console.error(err);
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

router.post('/matches', async (req, res) => {
  const body = req.body || {};
  const p1Name = cleanText(body.player1Name, 100);
  const p2Name = cleanText(body.player2Name, 100);
  if (!p1Name || !p2Name) return res.status(400).json({ error: 'player1Name and player2Name required' });
  if (p1Name.toLowerCase() === p2Name.toLowerCase()) return res.status(400).json({ error: 'players must be different' });
  const p1Country = cleanOptionalText(body.player1Country, 80);
  const p2Country = cleanOptionalText(body.player2Country, 80);
  const p1Flag = cleanOptionalText(body.player1CountryFlag, 500);
  const p2Flag = cleanOptionalText(body.player2CountryFlag, 500);

  try {
    const pool = getPool();
    const conn = pool;
    const player1Id = await findOrCreatePlayer(conn, p1Name, p1Country, p1Flag);
    const player2Id = await findOrCreatePlayer(conn, p2Name, p2Country, p2Flag);

    const [matchRes] = await conn.execute(
      'INSERT INTO matches (player1_id, player2_id, status, started_at) VALUES (?, ?, "live", NOW())',
      [player1Id, player2Id]
    );
    const matchId = matchRes.insertId;
    // create first game
    const [gameRes] = await conn.execute(
      'INSERT INTO games (match_id, game_number, player1_score, player2_score, status) VALUES (?, 1, 0, 0, "live")',
      [matchId]
    );
    const gameId = gameRes.insertId;
    res.json({ matchId, gameId, player1Id, player2Id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create match' });
  }
});

router.post('/matches/:id/games', async (req, res) => {
  const matchId = Number(req.params.id);
  if (!matchId) return res.status(400).json({ error: 'invalid match id' });
  try {
    const pool = getPool();
    // determine next game number
    const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM games WHERE match_id = ?', [matchId]);
    const next = (rows && rows[0]) ? rows[0].cnt + 1 : 1;
    const [gameRes] = await pool.execute('INSERT INTO games (match_id, game_number, player1_score, player2_score, status) VALUES (?, ?, 0, 0, "live")', [matchId, next]);
    res.json({ gameId: gameRes.insertId, gameNumber: next });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

async function updateGameScore(req, res) {
  const gameId = Number(req.params.id);
  const { player } = req.body || {};
  if (!gameId || (player !== 1 && player !== 2)) return res.status(400).json({ error: 'invalid parameters' });
  try {
    const pool = getPool();
    let update;
    if (player === 1) {
      [update] = await pool.execute('UPDATE games SET player1_score = player1_score + 1 WHERE id = ? AND status = "live"', [gameId]);
    } else {
      [update] = await pool.execute('UPDATE games SET player2_score = player2_score + 1 WHERE id = ? AND status = "live"', [gameId]);
    }
    if (!update.affectedRows) return res.status(409).json({ error: 'game not found or is not live' });
    const [rows] = await pool.execute('SELECT player1_score, player2_score FROM games WHERE id = ?', [gameId]);
    if (!rows[0]) return res.status(404).json({ error: 'game not found' });
    res.json({ score1: rows[0].player1_score, score2: rows[0].player2_score });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update score' });
  }
}
router.patch('/games/:id/score', updateGameScore);
router.post('/games/:id/score', updateGameScore);

async function finishGame(req, res) {
  const gameId = Number(req.params.id);
  const { winner } = req.body || {};
  if (!gameId || (winner !== 1 && winner !== 2)) return res.status(400).json({ error: 'invalid parameters' });
  try {
    const pool = getPool();
    // get match and players
    const [rows] = await pool.execute('SELECT g.match_id, m.player1_id, m.player2_id FROM games g JOIN matches m ON m.id = g.match_id WHERE g.id = ?', [gameId]);
    if (!rows || !rows[0]) return res.status(404).json({ error: 'game not found' });
    const matchId = rows[0].match_id;
    const winnerPlayerId = winner === 1 ? rows[0].player1_id : rows[0].player2_id;
    const [result] = await pool.execute('UPDATE games SET winner_id = ?, status = "completed" WHERE id = ? AND status = "live"', [winnerPlayerId, gameId]);
    if (!result.affectedRows) return res.status(409).json({ error: 'game is already completed' });
    res.json({ gameId, winnerPlayerId, matchId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to finish game' });
  }
}
router.patch('/games/:id/finish', finishGame);
router.post('/games/:id/finish', finishGame);

async function finishMatch(req, res) {
  const matchId = Number(req.params.id);
  const { winnerPlayerId, durationSeconds } = req.body || {};
  if (!Number.isInteger(matchId) || matchId < 1 || !Number.isInteger(Number(winnerPlayerId)) || !Number.isInteger(Number(durationSeconds)) || Number(durationSeconds) < 0) return res.status(400).json({ error: 'invalid parameters' });
  try {
    const pool = getPool();
    const [result] = await pool.execute(
      'UPDATE matches SET winner_id = ?, status = "completed", ended_at = NOW(), duration_seconds = ? WHERE id = ? AND status = "live" AND ? IN (player1_id, player2_id)',
      [winnerPlayerId, durationSeconds, matchId, winnerPlayerId]
    );
    if (!result.affectedRows) return res.status(409).json({ error: 'match not found, already completed, or winner is invalid' });
    res.json({ matchId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to finish match' });
  }
}
router.patch('/matches/:id/finish', finishMatch);
router.post('/matches/:id/finish', finishMatch);

// History endpoint: return completed matches in the format used by the frontend log
router.get('/matches/history', async (req, res) => {
  try {
    const pool = getPool();
    const [matches] = await pool.execute(
      `SELECT m.id AS match_id, m.player1_id, m.player2_id, m.status, m.started_at, m.ended_at, m.duration_seconds, p1.name AS player1, p1.player_id AS player1Id, p1.flag AS player1Flag, p1.country AS player1Country, p2.name AS player2, p2.player_id AS player2Id, p2.flag AS player2Flag, p2.country AS player2Country, mw.name AS winner_name
       FROM matches m
       JOIN players p1 ON p1.id = m.player1_id
       JOIN players p2 ON p2.id = m.player2_id
       LEFT JOIN players mw ON mw.id = m.winner_id
       ORDER BY m.ended_at DESC`);

    const result = [];
    for (const row of matches) {
      const [games] = await pool.execute('SELECT game_number, player1_score, player2_score, winner_id FROM games WHERE match_id = ? ORDER BY game_number', [row.match_id]);
      const gameHistory = games.map((g) => ({ game: g.game_number, score1: g.player1_score, score2: g.player2_score, winner: g.winner_id === null ? null : (g.winner_id === row.player1_id ? 1 : 2), durationSeconds: null }));
      const winnerIsPlayer1 = row.winner_name === row.player1;
      result.push({
        timestamp: new Date(row.ended_at || row.started_at).getTime(),
        date: new Date(row.ended_at || row.started_at).toLocaleString(),
        status: row.status,
        player1: row.player1,
        player1Id: row.player1Id,
        player2: row.player2,
        player2Id: row.player2Id,
        player1Country: row.player1Country,
        player1CountryFlag: row.player1Flag,
        player2Country: row.player2Country,
        player2CountryFlag: row.player2Flag,
        winner: row.winner_name || '',
        loser: winnerIsPlayer1 ? row.player2 : row.player1,
        finalScore1: games.length ? games[games.length - 1].player1_score : 0,
        finalScore2: games.length ? games[games.length - 1].player2_score : 0,
        gameHistory,
        gameWins1: 0,
        gameWins2: 0,
        durationSeconds: row.duration_seconds || 0
      });
    }
    res.json({ log: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

module.exports = router;
