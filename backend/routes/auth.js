const router    = require('express').Router();
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');
const db        = require('../db');
const { enviarResetSenha } = require('../email');

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
  const { nome, usuario, senha, email } = req.body;

  if (!validarString(nome, 2, 80))
    return res.status(400).json({ erro: 'Nome inválido (2–80 caracteres).' });
  if (!validarString(usuario, 2, 30) || /\s/.test(usuario))
    return res.status(400).json({ erro: 'Usuário inválido (2–30 chars, sem espaços).' });
  if (!validarString(senha, 4, 128))
    return res.status(400).json({ erro: 'Senha mínima de 4 caracteres.' });
  if (email && (!validarString(email, 5, 150) || !email.includes('@')))
    return res.status(400).json({ erro: 'E-mail inválido.' });

  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE usuario = $1', [usuario.trim()]);
    if (existe.rows.length) return res.status(409).json({ erro: 'Usuário já existe.' });
    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await db.query(
      'INSERT INTO usuarios (nome, usuario, senha_hash, email) VALUES ($1, $2, $3, $4) RETURNING id, nome, usuario, criado_em',
      [nome.trim(), usuario.trim().toLowerCase(), hash, email?.trim().toLowerCase() || null]
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

// POST /api/auth/esqueci-senha
router.post('/esqueci-senha', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!validarString(email, 5, 150) || !email.includes('@'))
    return res.status(400).json({ erro: 'E-mail inválido.' });

  try {
    const { rows } = await db.query('SELECT id, nome, usuario FROM usuarios WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    // Sempre retorna sucesso para não revelar se o e-mail existe
    if (!rows.length) return res.json({ mensagem: 'Se este e-mail estiver cadastrado, você receberá as instruções.' });

    const user  = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await db.query('UPDATE usuarios SET reset_token=$1, reset_expires=$2 WHERE id=$3', [token, expira, user.id]);

    const appUrl = process.env.ALLOWED_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
    await enviarResetSenha({ destinatario: email.trim(), nomeUsuario: user.nome, token, appUrl });

    res.json({ mensagem: 'Se este e-mail estiver cadastrado, você receberá as instruções.' });
  } catch (e) {
    console.error('Erro ao enviar e-mail:', e.message);
    res.status(500).json({ erro: 'Erro ao enviar e-mail. Verifique as configurações de e-mail.' });
  }
});

// POST /api/auth/reset-senha
router.post('/reset-senha', authLimiter, async (req, res) => {
  const { token, novaSenha } = req.body;
  if (!validarString(token, 10, 200)) return res.status(400).json({ erro: 'Token inválido.' });
  if (!validarString(novaSenha, 4, 128)) return res.status(400).json({ erro: 'Senha mínima de 4 caracteres.' });

  try {
    const { rows } = await db.query(
      'SELECT id, nome FROM usuarios WHERE reset_token=$1 AND reset_expires > NOW()',
      [token]
    );
    if (!rows.length) return res.status(400).json({ erro: 'Link inválido ou expirado. Solicite um novo.' });

    const hash = await bcrypt.hash(novaSenha, 10);
    await db.query('UPDATE usuarios SET senha_hash=$1, reset_token=NULL, reset_expires=NULL WHERE id=$2', [hash, rows[0].id]);

    res.json({ mensagem: 'Senha redefinida com sucesso! Faça login.' });
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;
