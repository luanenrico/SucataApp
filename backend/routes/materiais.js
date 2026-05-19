const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');

function num(v, min = 0) { const n = Number(v); return !isNaN(n) && isFinite(n) && n >= min; }
function str(v, mn, mx)  { return typeof v === 'string' && v.trim().length >= mn && v.trim().length <= mx; }

// GET /api/materiais
router.get('/', auth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM materiais ORDER BY tipo');
  res.json(rows);
});

// POST /api/materiais
router.post('/', auth, async (req, res) => {
  const { codigo, tipo, preco_venda, custo_padrao } = req.body;
  if (!str(codigo, 1, 20))   return res.status(400).json({ erro: 'Código inválido (1–20 caracteres).' });
  if (!str(tipo, 2, 80))     return res.status(400).json({ erro: 'Tipo inválido (2–80 caracteres).' });
  if (!num(preco_venda))     return res.status(400).json({ erro: 'Preço de venda inválido.' });
  if (!num(custo_padrao))    return res.status(400).json({ erro: 'Custo padrão inválido.' });
  try {
    const { rows } = await db.query(
      'INSERT INTO materiais (codigo, tipo, preco_venda, custo_padrao) VALUES ($1, $2, $3, $4) RETURNING *',
      [codigo.trim().toUpperCase(), tipo.trim(), Number(preco_venda), Number(custo_padrao)]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Código já existe.' });
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// PUT /api/materiais/:id
router.put('/:id', auth, async (req, res) => {
  const { codigo, tipo, preco_venda, custo_padrao } = req.body;
  if (!str(codigo, 1, 20))   return res.status(400).json({ erro: 'Código inválido (1–20 caracteres).' });
  if (!str(tipo, 2, 80))     return res.status(400).json({ erro: 'Tipo inválido (2–80 caracteres).' });
  if (!num(preco_venda))     return res.status(400).json({ erro: 'Preço de venda inválido.' });
  if (!num(custo_padrao))    return res.status(400).json({ erro: 'Custo padrão inválido.' });
  try {
    const { rows } = await db.query(
      'UPDATE materiais SET codigo=$1, tipo=$2, preco_venda=$3, custo_padrao=$4 WHERE id=$5 RETURNING *',
      [codigo.trim().toUpperCase(), tipo.trim(), Number(preco_venda), Number(custo_padrao), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Material não encontrado.' });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Código já existe.' });
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// DELETE /api/materiais/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM materiais WHERE id = $1', [req.params.id]);
    res.json({ mensagem: 'Material excluído.' });
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ erro: 'Material possui lotes ou vendas vinculados.' });
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;
