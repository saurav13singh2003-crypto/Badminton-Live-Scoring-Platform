const mysql = require('mysql2/promise');

const poolConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3307,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'badminton_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool = null;

async function ensureTables() {
  const createUsers = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin','viewer') NOT NULL DEFAULT 'viewer',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  const createPlayers = `
    CREATE TABLE IF NOT EXISTS players (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      player_id VARCHAR(100) NULL,
      country VARCHAR(80) NULL,
      flag VARCHAR(1000) NULL,
      UNIQUE KEY uq_players_name (name),
      UNIQUE KEY uq_players_player_id (player_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  const ensurePlayerColumns = `
    ALTER TABLE players
      MODIFY COLUMN country VARCHAR(80) NULL,
      MODIFY COLUMN flag VARCHAR(1000) NULL;
  `;

  const ensurePlayerIdColumn = `
    ALTER TABLE players
      ADD COLUMN player_id VARCHAR(100) NULL AFTER name;
  `;

  const createMatches = `
    CREATE TABLE IF NOT EXISTS matches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player1_id INT NOT NULL,
      player2_id INT NOT NULL,
      winner_id INT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'live',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME NULL,
      duration_seconds INT NOT NULL DEFAULT 0,
      CONSTRAINT fk_matches_player1 FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE CASCADE,
      CONSTRAINT fk_matches_player2 FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE CASCADE,
      CONSTRAINT fk_matches_winner FOREIGN KEY (winner_id) REFERENCES players(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  const createGames = `
    CREATE TABLE IF NOT EXISTS games (
      id INT AUTO_INCREMENT PRIMARY KEY,
      match_id INT NOT NULL,
      game_number INT NOT NULL,
      player1_score INT NOT NULL DEFAULT 0,
      player2_score INT NOT NULL DEFAULT 0,
      winner_id INT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'live',
      CONSTRAINT fk_games_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      CONSTRAINT fk_games_winner FOREIGN KEY (winner_id) REFERENCES players(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  // minimal support tables to store per-user JSON documents used by the frontend
  const createCustomCountries = `
    CREATE TABLE IF NOT EXISTS custom_countries (
      email VARCHAR(150) PRIMARY KEY,
      countries JSON,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  const createMatchLogs = `
    CREATE TABLE IF NOT EXISTS match_logs (
      email VARCHAR(150) PRIMARY KEY,
      log JSON,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  const createLatestState = `
    CREATE TABLE IF NOT EXISTS latest_state (
      email VARCHAR(150) PRIMARY KEY,
      state JSON,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  await pool.execute(createUsers);
  await pool.execute(createPlayers);
  await pool.execute(ensurePlayerIdColumn).catch(() => {});
  await pool.execute(ensurePlayerColumns).catch(() => {});
  await pool.execute('ALTER TABLE players ADD UNIQUE INDEX uq_players_player_id (player_id)').catch(() => {});
  await pool.execute(createMatches);
  await pool.execute(createGames);
  await pool.execute(createCustomCountries);
  await pool.execute(createMatchLogs);
  await pool.execute(createLatestState);
}

async function ensurePlayerDeleteCascades() {
  const dropStatements = [
    'ALTER TABLE matches DROP FOREIGN KEY fk_matches_player1',
    'ALTER TABLE matches DROP FOREIGN KEY fk_matches_player2',
    'ALTER TABLE matches DROP FOREIGN KEY fk_matches_winner',
    'ALTER TABLE games DROP FOREIGN KEY fk_games_winner'
  ];

  for (const sql of dropStatements) {
    await pool.execute(sql).catch(() => {});
  }

  await pool.execute(`
    ALTER TABLE matches
      ADD CONSTRAINT fk_matches_player1 FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE CASCADE,
      ADD CONSTRAINT fk_matches_player2 FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE CASCADE,
      ADD CONSTRAINT fk_matches_winner FOREIGN KEY (winner_id) REFERENCES players(id) ON DELETE SET NULL
  `).catch(() => {});

  await pool.execute(`
    ALTER TABLE games
      ADD CONSTRAINT fk_games_winner FOREIGN KEY (winner_id) REFERENCES players(id) ON DELETE SET NULL
  `).catch(() => {});
}

async function ensureUserRoleSchema() {
  const [cols] = await pool.execute("SHOW COLUMNS FROM users LIKE 'role'");
  if (!cols || !cols[0]) throw new Error('users.role column is required');

  // Preserve every account while reducing the application role model to admin/viewer.
  // The temporary enum permits legacy values while they are converted safely.
  const type = cols[0].Type || '';
  if (!type.includes("'user'")) {
    await pool.execute("ALTER TABLE users MODIFY COLUMN role ENUM('admin','scorer','viewer','user') NOT NULL DEFAULT 'viewer'");
  }
  await pool.execute("UPDATE users SET role = 'viewer' WHERE role IS NULL OR role NOT IN ('admin', 'viewer')");
  await pool.execute("ALTER TABLE users MODIFY COLUMN role ENUM('admin','viewer') NOT NULL DEFAULT 'viewer'");
}

async function connectDatabase() {
  pool = mysql.createPool(poolConfig);
  // test connection
  try {
    const [rows] = await pool.execute('SELECT 1 as ok');
    await ensureTables();
    await ensurePlayerDeleteCascades();
    await ensureUserRoleSchema();
    console.log(`Connected to MySQL at ${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`);
    return pool;
  } catch (err) {
    console.error('MySQL connection failed', err);
    throw err;
  }
}

function getPool() {
  if (!pool) throw new Error('Database not connected. Call connectDatabase() first.');
  return pool;
}

// Compatibility shim: provide a getCollections() interface similar to previous Mongo implementation
function getCollections() {
  if (!pool) throw new Error('Database not connected. Call connectDatabase() first.');

  return {
    users: createUsersAdapter(pool),
    customCountries: createJsonAdapter(pool, 'custom_countries', 'countries'),
    matchLogs: createJsonAdapter(pool, 'match_logs', 'log'),
    latestState: createJsonAdapter(pool, 'latest_state', 'state')
  };
}

function createUsersAdapter(pool) {
  return {
    async findOne(filter) {
      const email = (filter.email || '').toString().toLowerCase();
      const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
      if (!rows || !rows[0]) return null;
      const r = rows[0];
      const normalizedRole = r.role === 'admin' ? 'admin' : 'viewer';
      return {
        id: r.id,
        name: r.name,
        username: r.name,
        email: r.email,
        password: r.password_hash,
        role: normalizedRole,
        createdAt: r.created_at
      };
    },
    async insertOne(user) {
      const name = user.username || user.name || null;
      const email = (user.email || '').toString().toLowerCase();
      const password = user.password || user.password_hash || null;
      const roleInput = (user.role || 'viewer').toString().toLowerCase();
      const role = roleInput === 'admin' ? 'admin' : 'viewer';
      const [result] = await pool.execute(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [name, email, password, role]
      );
      return { insertedId: result.insertId, ops: [user] };
    }
  };
}

function createJsonAdapter(pool, table, column) {
  return {
    async findOne(filter) {
      const email = (filter.email || '').toString().toLowerCase();
      const [rows] = await pool.execute(`SELECT ${column} FROM ${table} WHERE email = ?`, [email]);
      if (!rows || !rows[0]) return null;
      const rawValue = rows[0][column];
      if (rawValue === null || rawValue === undefined) {
        return { [column]: null };
      }
      if (typeof rawValue === 'string') {
        try {
          return { [column]: JSON.parse(rawValue) };
        } catch (err) {
          return { [column]: null };
        }
      }
      return { [column]: rawValue };
    },
    async updateOne(filter, update, options = {}) {
      const email = (filter.email || '').toString().toLowerCase();
      // support $set and $addToSet semantics used in the app
      if (update.$set && typeof update.$set === 'object') {
        const value = update.$set[Object.keys(update.$set)[0]] || update.$set;
        const data = JSON.stringify(value);
        await pool.execute(
          `INSERT INTO ${table} (email, ${column}) VALUES (?, ?) ON DUPLICATE KEY UPDATE ${column} = ?`,
          [email, data, data]
        );
        return { acknowledged: true };
      }
      if (update.$addToSet && typeof update.$addToSet === 'object') {
        const key = Object.keys(update.$addToSet)[0];
        const value = update.$addToSet[key];
        // load existing
        const [rows] = await pool.execute(`SELECT ${column} FROM ${table} WHERE email = ?`, [email]);
        let arr = [];
        if (rows && rows[0] && rows[0][column]) {
          const rawValue = rows[0][column];
          if (typeof rawValue === 'string') {
            try { arr = JSON.parse(rawValue); } catch (e) { arr = []; }
          } else if (Array.isArray(rawValue)) {
            arr = rawValue;
          }
        }
        const exists = arr.some((it) => (it.name || '').toString().toLowerCase() === (value.name || '').toString().toLowerCase());
        if (!exists) arr.push(value);
        const data = JSON.stringify(arr);
        await pool.execute(
          `INSERT INTO ${table} (email, ${column}) VALUES (?, ?) ON DUPLICATE KEY UPDATE ${column} = ?`,
          [email, data, data]
        );
        return { value: { [column]: arr } };
      }
      throw new Error('Unsupported update operation');
    },
    async findOneAndUpdate(filter, update, options = {}) {
      await this.updateOne(filter, update, options);
      const doc = await this.findOne(filter);
      return { value: doc };
    }
  };
}

module.exports = {
  connectDatabase,
  getPool,
  getCollections
};
