const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');
const auth   = require('../middleware/auth');

// Middleware: só admin acessa rotas de gestão
function soAdmin(req, res, next) {
  if (!req.user.admin) return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  next();
}

// GET /api/usuarios
router.get('/', auth, soAdmin, async (req, res) => {
  const { rows } = await db.query('SELECT id, nome, usuario, email, ativo, admin, criado_em FROM usuarios ORDER BY criado_em');
  res.json(rows);
});

// POST /api/usuarios
router.post('/', auth, soAdmin, async (req, res) => {
  const { nome, usuario, senha, email } = req.body;
  if (!nome || !usuario || !senha) return res.status(400).json({ erro: 'Preencha todos os campos.' });
  if (senha.length < 4) return res.status(400).json({ erro: 'Senha mínima de 4 caracteres.' });
  if (email && !email.includes('@')) return res.status(400).json({ erro: 'E-mail inválido.' });
  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE usuario = $1', [usuario]);
    if (existe.rows.length) return res.status(409).json({ erro: 'Usuário já existe.' });
    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await db.query(
      'INSERT INTO usuarios (nome, usuario, senha_hash, email) VALUES ($1, $2, $3, $4) RETURNING id, nome, usuario, email, criado_em',
      [nome, usuario, hash, email?.trim().toLowerCase() || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// PUT /api/usuarios/:id/senha
router.put('/:id/senha', auth, async (req, res) => {
  const { senhaAtual, novaSenha } = req.body;
  if (String(req.user.id) !== String(req.params.id)) return res.status(403).json({ erro: 'Sem permissão.' });
  if (!senhaAtual || !novaSenha) return res.status(400).json({ erro: 'Preencha todos os campos.' });
  if (novaSenha.length < 4) return res.status(400).json({ erro: 'Senha mínima de 4 caracteres.' });
  try {
    const { rows } = await db.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    const ok = await bcrypt.compare(senhaAtual, rows[0].senha_hash);
    if (!ok) return res.status(401).json({ erro: 'Senha atual incorreta.' });
    const hash = await bcrypt.hash(novaSenha, 10);
    await db.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ mensagem: 'Senha atualizada.' });
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/usuarios/:id/reset-senha  — gera senha temporária (só admin)
router.post('/:id/reset-senha', auth, soAdmin, async (req, res) => {
  // Não pode resetar a própria senha por aqui (use /senha)
  if (String(req.user.id) === String(req.params.id))
    return res.status(400).json({ erro: 'Use "Alterar Senha" para trocar sua própria senha.' });
  try {
    const { rows } = await db.query('SELECT id, nome, usuario FROM usuarios WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    // Gera senha temporária: 3 letras maiúsculas + 3 números + 2 caracteres especiais
    const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const nums   = '23456789';
    const temp   = [
      chars[Math.floor(Math.random() * chars.length)],
      chars[Math.floor(Math.random() * chars.length)],
      chars[Math.floor(Math.random() * chars.length)],
      nums[Math.floor(Math.random() * nums.length)],
      nums[Math.floor(Math.random() * nums.length)],
      nums[Math.floor(Math.random() * nums.length)],
    ].sort(() => Math.random() - 0.5).join('');
    const hash = await bcrypt.hash(temp, 10);
    await db.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ senhaTemproraria: temp, usuario: rows[0].usuario, nome: rows[0].nome });
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// PATCH /api/usuarios/:id/ativo — ativa ou desativa um usuário (só admin)
router.patch('/:id/ativo', auth, soAdmin, async (req, res) => {
  if (String(req.user.id) === String(req.params.id))
    return res.status(400).json({ erro: 'Não é possível desativar seu próprio usuário.' });
  const { ativo } = req.body;
  if (typeof ativo !== 'boolean') return res.status(400).json({ erro: 'Campo ativo deve ser true ou false.' });
  try {
    const { rows } = await db.query(
      'UPDATE usuarios SET ativo = $1 WHERE id = $2 RETURNING id, nome, usuario, email, ativo, criado_em',
      [ativo, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// DELETE /api/usuarios/:id (só admin)
router.delete('/:id', auth, soAdmin, async (req, res) => {
  if (String(req.user.id) === String(req.params.id)) return res.status(400).json({ erro: 'Não é possível excluir seu próprio usuário.' });
  await db.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
  res.json({ mensagem: 'Usuário removido.' });
});

module.exports = router;
