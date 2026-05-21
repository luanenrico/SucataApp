const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');

function num(v, min = 0) { const n = Number(v); return !isNaN(n) && isFinite(n) && n >= min; }
function str(v, mn, mx)  { return typeof v === 'string' && v.trim().length >= mn && v.trim().length <= mx; }
function isDate(v)        { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

// GET /api/lotes — inclui saldo de estoque, só do usuário logado
router.get('/', auth, async (req, res) => {
  const { rows } = await db.query(`
    SELECT
      l.*,
      m.tipo AS nome_material,
      COALESCE(SUM(v.peso_vendido), 0)                        AS peso_vendido_total,
      l.peso_comprado - COALESCE(SUM(v.peso_vendido), 0)      AS peso_saldo,
      ROUND(
        CASE WHEN l.peso_comprado > 0
        THEN (COALESCE(SUM(v.peso_vendido), 0) / l.peso_comprado) * 100
        ELSE 0 END
      , 1) AS pct_vendido
    FROM lotes l
    LEFT JOIN materiais m ON m.codigo = l.codigo_material AND m.usuario_id = l.usuario_id
    LEFT JOIN vendas v ON v.codigo_lote = l.codigo AND v.usuario_id = l.usuario_id
    WHERE l.usuario_id = $1
    GROUP BY l.id, m.tipo
    ORDER BY l.data_compra DESC
  `, [req.user.id]);
  res.json(rows);
});

// POST /api/lotes
router.post('/', auth, async (req, res) => {
  const { codigo, data_compra, codigo_material, peso_comprado, custo_total, observacao } = req.body;
  if (!str(codigo, 1, 30))          return res.status(400).json({ erro: 'Código inválido.' });
  if (!isDate(data_compra))         return res.status(400).json({ erro: 'Data inválida (YYYY-MM-DD).' });
  if (!str(codigo_material, 1, 20)) return res.status(400).json({ erro: 'Material inválido.' });
  if (!num(peso_comprado, 0.001))   return res.status(400).json({ erro: 'Peso inválido.' });
  if (!num(custo_total, 0))         return res.status(400).json({ erro: 'Custo total inválido.' });
  try {
    const { rows } = await db.query(
      `INSERT INTO lotes (codigo, data_compra, codigo_material, peso_comprado, custo_total, observacao, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [codigo.trim().toUpperCase(), data_compra, codigo_material.trim().toUpperCase(),
       Number(peso_comprado), Number(custo_total), observacao?.trim() || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Código de lote já existe.' });
    if (e.code === '23503') return res.status(400).json({ erro: 'Material não encontrado.' });
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// PUT /api/lotes/:id
router.put('/:id', auth, async (req, res) => {
  const { codigo, data_compra, codigo_material, peso_comprado, custo_total, observacao } = req.body;
  if (!str(codigo, 1, 30))          return res.status(400).json({ erro: 'Código inválido.' });
  if (!isDate(data_compra))         return res.status(400).json({ erro: 'Data inválida (YYYY-MM-DD).' });
  if (!str(codigo_material, 1, 20)) return res.status(400).json({ erro: 'Material inválido.' });
  if (!num(peso_comprado, 0.001))   return res.status(400).json({ erro: 'Peso inválido.' });
  if (!num(custo_total, 0))         return res.status(400).json({ erro: 'Custo total inválido.' });
  try {
    const { rows } = await db.query(
      `UPDATE lotes SET codigo=$1, data_compra=$2, codigo_material=$3,
       peso_comprado=$4, custo_total=$5, observacao=$6 WHERE id=$7 AND usuario_id=$8 RETURNING *`,
      [codigo.trim().toUpperCase(), data_compra, codigo_material.trim().toUpperCase(),
       Number(peso_comprado), Number(custo_total), observacao?.trim() || null, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Lote não encontrado.' });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ erro: 'Código de lote já existe.' });
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// DELETE /api/lotes/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM lotes WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
    res.json({ mensagem: 'Lote excluído.' });
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ erro: 'Lote possui vendas vinculadas.' });
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;
