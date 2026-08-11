const express = require('express');
const bcrypt = require('bcryptjs');
const { getCollections } = require('../database/db');

const router = express.Router();

function getEmail(req) {
  return req.query.email || req.body?.email || null;
}

router.get('/users', async (req, res) => {
  const email = getEmail(req);
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const { users } = getCollections();
    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ user: null });
    }
    const { password, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  console.log('Registration request received', {
    usernameProvided: !!username,
    emailProvided: !!email,
    passwordProvided: !!password,
  });

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }

  try {
    const { users } = getCollections();
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      createdAt: new Date(),
    };
    await users.insertOne(user);
    const { password: _, ...safeUser } = user;
    res.json({ success: true, message: 'Registration successful', user: safeUser });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062 || err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }
    console.error('Registration error', {
      code: err.code,
      errno: err.errno,
      sqlMessage: err.sqlMessage,
      message: err.message,
    });
    res.status(500).json({ success: false, message: 'Failed to register user' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const { users } = getCollections();
    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

module.exports = router;
