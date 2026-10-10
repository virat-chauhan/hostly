const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { HttpError, bad, wrap } = require('../utils/http');

const sign = user => jwt.sign({ id: user.id, email: user.email }, config.jwtSecret, { expiresIn: '7d' });

router.post('/signup', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw bad('enter a valid email');
  if (password.length < 6) throw bad('password needs at least 6 characters');

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hash]
    );
    res.status(201).json({ token: sign(rows[0]), user: rows[0] });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'that email is already registered');
    throw err;
  }
}));

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { rows } = await query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
    throw new HttpError(401, 'wrong email or password');
  }
  res.json({ token: sign(user), user: { id: user.id, email: user.email } });
}));

router.get('/me', auth, (req, res) => res.json({ user: req.user }));

module.exports = router;
