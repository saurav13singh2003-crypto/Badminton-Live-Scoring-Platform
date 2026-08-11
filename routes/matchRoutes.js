const express = require('express');
const { requireEmail } = require('../middleware/authMiddleware');
const { getCollections, getPool } = require('../database/db');

const router = express.Router();

// Compatibility endpoints (custom countries, match-log, latest-state) backed by JSON tables
router.get('/custom-countries', requireEmail, async (req, res) => {
  const email = req.userEmail;
  try {
    const { customCountries } = getCollections();
    const result = await customCountries.findOne({ email });
    res.json({ countries: result?.countries || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load custom countries' });
  }
});

router.post('/custom-countries', requireEmail, async (req, res) => {
  const email = req.userEmail;
  const { name, flag } = req.body || {};
  if (!name || !flag) {
    return res.status(400).json({ error: 'name and flag are required' });
  }

  try {
    const { customCountries } = getCollections();
    const update = await customCountries.findOneAndUpdate(
      { email },
      { $addToSet: { countries: { name, flag } } },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ countries: update.value.countries || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save custom country' });
  }
});

router.delete('/custom-countries', requireEmail, async (req, res) => {
  const email = req.userEmail;
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { customCountries } = getCollections();
    // emulated delete by replacing array without the named country
    const doc = await customCountries.findOne({ email });
    const arr = doc?.countries || [];
    const updated = arr.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
    await customCountries.updateOne({ email }, { $set: { countries: updated } }, { upsert: true });
    res.json({ countries: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete custom country' });
  }
});

router.get('/match-log', requireEmail, async (req, res) => {
  const email = req.userEmail;
  try {
    const { matchLogs } = getCollections();
    const document = await matchLogs.findOne({ email });
    res.json({ log: document?.log || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load match log' });
  }
});

router.post('/match-log', requireEmail, async (req, res) => {
  const email = req.userEmail;
  const { log } = req.body || {};
  if (!Array.isArray(log)) {
    return res.status(400).json({ error: 'log array is required' });
  }

  try {
    const { matchLogs } = getCollections();
    await matchLogs.updateOne({ email }, { $set: { log } }, { upsert: true });
    res.json({ log });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save match log' });
  }
});

router.get('/latest-state', requireEmail, async (req, res) => {
  const email = req.userEmail;
  try {
    const { latestState } = getCollections();
    const doc = await latestState.findOne({ email });
    res.json({ state: doc?.state || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load latest state' });
  }
});

router.post('/latest-state', requireEmail, async (req, res) => {
  const email = req.userEmail;
  const { state } = req.body || {};
  if (!state) {
    return res.status(400).json({ error: 'state is required' });
  }

  try {
    const { latestState } = getCollections();
    await latestState.updateOne({ email }, { $set: { state } }, { upsert: true });
    res.json({ state });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save latest state' });
  }
});

// New SQL-backed match/game endpoints
// Helper: find or create player
async function findOrCreatePlayer(pool, name, country, flag) {
  name = (name || '').toString().trim();
  if (!name) return null;
  const [rows] = await pool.execute('SELECT id FROM players WHERE name = ? LIMIT 1', [name]);
  if (rows && rows[0]) return rows[0].id;
  const [result] = await pool.execute('INSERT INTO players (name, country, flag) VALUES (?, ?, ?)', [name, country || null, flag || null]);
  return result.insertId;
}

router.post('/matches', async (req, res) => {
  const body = req.body || {};
  const p1Name = (body.player1Name || '').toString().trim();
  const p2Name = (body.player2Name || '').toString().trim();
  if (!p1Name || !p2Name) return res.status(400).json({ error: 'player1Name and player2Name required' });
  const p1Country = body.player1Country || null;
  const p2Country = body.player2Country || null;
  const p1Flag = body.player1CountryFlag || null;
  const p2Flag = body.player2CountryFlag || null;

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

router.patch('/games/:id/score', async (req, res) => {
  const gameId = Number(req.params.id);
  const { player } = req.body || {};
  if (!gameId || (player !== 1 && player !== 2)) return res.status(400).json({ error: 'invalid parameters' });
  try {
    const pool = getPool();
    if (player === 1) {
      await pool.execute('UPDATE games SET player1_score = player1_score + 1 WHERE id = ? AND status = "live"', [gameId]);
    } else {
      await pool.execute('UPDATE games SET player2_score = player2_score + 1 WHERE id = ? AND status = "live"', [gameId]);
    }
    const [rows] = await pool.execute('SELECT player1_score, player2_score FROM games WHERE id = ?', [gameId]);
    res.json({ score1: rows[0].player1_score, score2: rows[0].player2_score });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update score' });
  }
});

router.patch('/games/:id/finish', async (req, res) => {
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
    await pool.execute('UPDATE games SET winner_id = ?, status = "completed" WHERE id = ?', [winnerPlayerId, gameId]);
    res.json({ gameId, winnerPlayerId, matchId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to finish game' });
  }
});

router.patch('/matches/:id/finish', async (req, res) => {
  const matchId = Number(req.params.id);
  const { winnerPlayerId, durationSeconds } = req.body || {};
  if (!matchId || !winnerPlayerId) return res.status(400).json({ error: 'invalid parameters' });
  try {
    const pool = getPool();
    await pool.execute('UPDATE matches SET winner_id = ?, status = "completed", ended_at = NOW(), duration_seconds = ? WHERE id = ?', [winnerPlayerId, durationSeconds || null, matchId]);
    res.json({ matchId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to finish match' });
  }
});

// History endpoint: return completed matches in the format used by the frontend log
router.get('/matches/history', async (req, res) => {
  try {
    const pool = getPool();
    const [matches] = await pool.execute(
      `SELECT m.id AS match_id, m.started_at, m.ended_at, m.duration_seconds, p1.name AS player1, p1.flag AS player1Flag, p1.country AS player1Country, p2.name AS player2, p2.flag AS player2Flag, p2.country AS player2Country, mw.name AS winner_name
       FROM matches m
       JOIN players p1 ON p1.id = m.player1_id
       JOIN players p2 ON p2.id = m.player2_id
       LEFT JOIN players mw ON mw.id = m.winner_id
       WHERE m.status = 'completed'
       ORDER BY m.ended_at DESC`);

    const result = [];
    for (const row of matches) {
      const [games] = await pool.execute('SELECT game_number, player1_score, player2_score, winner_id FROM games WHERE match_id = ? ORDER BY game_number', [row.match_id]);
      const gameHistory = games.map((g) => ({ game: g.game_number, score1: g.player1_score, score2: g.player2_score, winner: g.winner_id === null ? null : (g.winner_id === row.player1 ? 1 : 2), durationSeconds: null }));
      result.push({
        timestamp: new Date(row.ended_at || row.started_at).getTime(),
        date: new Date(row.ended_at || row.started_at).toLocaleString(),
        player1: row.player1,
        player2: row.player2,
        player1Country: row.player1Country,
        player1CountryFlag: row.player1Flag,
        player2Country: row.player2Country,
        player2CountryFlag: row.player2Flag,
        winner: row.winner_name || '',
        loser: '',
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
