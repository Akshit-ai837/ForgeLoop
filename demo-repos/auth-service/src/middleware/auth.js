// Token verification utility
export function verifyToken(token) {
  // Demo token format: base64(userId:timestampExp)
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const [userId, exp] = raw.split(':');
    return {
      userId: parseInt(userId, 10),
      exp: parseInt(exp, 10)
    };
  } catch (e) {
    return null;
  }
}

// Initial buggy/placeholder middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Invalid or missing Bearer token' });
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.trim() === '') {
    return res.status(401).json({ error: 'Token value missing' });
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded || decoded.exp < Date.now()) {
      return res.status(403).json({ error: 'Token expired or invalid' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token verification failed' });
  }
}
