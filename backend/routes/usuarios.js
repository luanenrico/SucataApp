const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');
const auth   = require('../middleware/auth');

// GET /api/usuarios
router.get('/', auth, async (req, res) => {
  const { rows } = await db.query('SELECT id, nome, usuario, criado_em FROM usuarios ORDER BY criado_em');
  res.json(rows);
});

// POST /api/usuarios
router.post('/', auth, async (req, res) => {
  const { nome, usuario, senha } = req.body;
  if (!nome || !usuario || !senha) return res.status(400).json({ erro: 'Preencha todos os campos.' });
  if (senha.length < 4) return res.status(400).json({ erro: 'Senha mínima de 4 caracteres.' });
  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE usuario = $1', [usuario]);
    if (existe.rows.length) return res.status(409).json({ erro: 'Usuário já existe.' });
    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await db.query(
      'INSERT INTO usuarios (nome, usuario, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, usuario, criado_em',
      [nome, usuario, hash]
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

// DELETE /api/usuarios/:id
router.delete('/:id', auth, async (req, res) => {
  if (String(req.user.id) === String(req.params.id)) return res.status(400).json({ erro: 'Não é possível excluir seu próprio usuário.' });
  await db.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
  res.json({ mensagem: 'Usuário removido.' });
});

module.exports = router;
