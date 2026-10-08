const jwt = require('jsonwebtoken');
const config = require('../config');

module.exports = function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'please log in again' });
  }
};
