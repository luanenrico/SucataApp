const router    = require('express').Router();
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db        = require('../db');

// Rate limit restrito só para login/register: 10 tentativas por 15 min por IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});

// Helper de validação básica
function validarString(val, min = 1, max = 100) {
  return typeof val === 'string' && val.trim().length >= min && val.trim().length <= max;
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  const { nome, usuario, senha } = req.body;

  if (!validarString(nome, 2, 80))
    return res.status(400).json({ erro: 'Nome inválido (2–80 caracteres).' });
  if (!validarString(usuario, 2, 30) || /\s/.test(usuario))
    return res.status(400).json({ erro: 'Usuário inválido (2–30 chars, sem espaços).' });
  if (!validarString(senha, 4, 128))
    return res.status(400).json({ erro: 'Senha mínima de 4 caracteres.' });

  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE usuario = $1', [usuario.trim()]);
    if (existe.rows.length) return res.status(409).json({ erro: 'Usuário já existe.' });
    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await db.query(
      'INSERT INTO usuarios (nome, usuario, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, usuario, criado_em',
      [nome.trim(), usuario.trim().toLowerCase(), hash]
    );
    const user  = rows[0];
    const token = jwt.sign(
      { id: user.id, nome: user.nome, usuario: user.usuario },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.status(201).json({ token, user: { id: user.id, nome: user.nome, usuario: user.usuario } });
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const { usuario, senha } = req.body;

  if (!validarString(usuario, 1, 30) || !validarString(senha, 1, 128))
    return res.status(400).json({ erro: 'Preencha usuário e senha.' });

  try {
    const { rows } = await db.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario.trim().toLowerCase()]);
    // Sempre compara o hash para evitar timing attacks (não revela se usuário existe)
    const hash = rows[0]?.senha_hash || '$2a$10$invalidhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const ok   = await bcrypt.compare(senha, hash);
    if (!rows.length || !ok)
      return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });

    const user  = rows[0];
    const token = jwt.sign(
      { id: user.id, nome: user.nome, usuario: user.usuario },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, user: { id: user.id, nome: user.nome, usuario: user.usuario } });
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;
