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

  await pool.execute(createCustomCountries);
  await pool.execute(createMatchLogs);
  await pool.execute(createLatestState);
}

async function connectDatabase() {
  console.log('DB_HOST=', process.env.DB_HOST ? 'true' : 'false');
  console.log('DB_PORT=', process.env.DB_PORT ? 'true' : 'false');
  console.log('DB_USER=', process.env.DB_USER ? 'true' : 'false');
  console.log('DB_PASSWORD configured=', process.env.DB_PASSWORD ? 'true' : 'false');
  console.log('DB_NAME=', process.env.DB_NAME ? 'true' : 'false');
  console.log('effective poolConfig: host=', poolConfig.host, 'port=', poolConfig.port, 'user=', poolConfig.user, 'database=', poolConfig.database);

  pool = mysql.createPool(poolConfig);
  // test connection
  try {
    const [rows] = await pool.execute('SELECT 1 as ok');
    await ensureTables();
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
      return {
        username: r.name,
        email: r.email,
        password: r.password_hash,
        role: r.role,
        createdAt: r.created_at
      };
    },
    async insertOne(user) {
      const name = user.username || user.name || null;
      const email = (user.email || '').toString().toLowerCase();
      const password = user.password || user.password_hash || null;
      const role = user.role || 'viewer';
      await pool.execute(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [name, email, password, role]
      );
      return { insertedId: null, ops: [user] };
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
