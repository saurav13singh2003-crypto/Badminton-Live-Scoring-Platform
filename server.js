const path = require('path');
const dotenvResult = require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
console.log('dotenv loaded:', dotenvResult.error ? 'false' : 'true', 'path:', path.resolve(__dirname, '.env'));
console.log('dotenv parsed keys:', dotenvResult.parsed ? Object.keys(dotenvResult.parsed) : []);
console.log('process.env DB_PASSWORD undefined?', process.env.DB_PASSWORD === undefined);
console.log('process.env DB_PASSWORD empty string?', process.env.DB_PASSWORD === '');
const express = require('express');
const cors = require('cors');
const { connectDatabase } = require('./database/db');
const authRoutes = require('./routes/authRoutes');
const matchRoutes = require('./routes/matchRoutes');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', authRoutes);
app.use('/api', matchRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

connectDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
