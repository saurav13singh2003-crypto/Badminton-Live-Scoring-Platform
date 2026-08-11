function requireEmail(req, res, next) {
  const email = (req.query?.email || req.body?.email || '').toString().trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  req.userEmail = email;
  next();
}

module.exports = {
  requireEmail,
};
