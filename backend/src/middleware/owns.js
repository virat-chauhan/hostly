const { query } = require('../db');
const { HttpError, wrap } = require('../utils/http');

module.exports = wrap(async (req, res, next) => {
  const id = Number(req.params.id);
  const { rows } = Number.isInteger(id)
    ? await query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, req.user.id])
    : { rows: [] };
  if (!rows[0]) throw new HttpError(404, 'project not found');
  req.project = rows[0];
  next();
});
