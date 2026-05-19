const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');

function num(v, min = 0) { const n = Number(v); return !isNaN(n) && isFinite(n) && n >= min; }
function str(v, mn, mx)  { return typeof v === 'string' && v.trim().length >= mn && v.trim().length <= mx; }
function isDate(v)        { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

const PAGAMENTOS_VALIDOS = ['Dinheiro','PIX','Cartão de Débito','Cartão de Crédito','Transferência','Cheque','Boleto'];

// GET /api/vendas?mes=5&ano=2026
router.get('/', auth, async (req, res) => {
  const mes = parseInt(req.query.mes);
  const ano = parseInt(req.query.ano);
  let sql = 'SELECT * FROM vendas';
  const params = [];
  if (!isNaN(mes) && !isNaN(ano) && mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100) {
    sql += ' WHERE EXTRACT(MONTH FROM data) = $1 AND EXTRACT(YEAR FROM data) = $2';
    params.push(mes, ano);
  }
  sql += ' ORDER BY data DESC, numero_venda';
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

// GET /api/vendas/resumo?ano=2026  — dados anuais para o gráfico
router.get('/resumo', auth, async (req, res) => {
  const ano = req.query.ano || new Date().getFullYear();
  const { rows } = await db.query(`
    SELECT
      EXTRACT(MONTH FROM data)::int AS mes,
      COALESCE(SUM(receita_total), 0) AS receita,
      COALESCE(SUM(lucro), 0)         AS lucro,
      COALESCE(SUM(peso_vendido), 0)  AS peso,
      COUNT(*)                        AS qtd_vendas
    FROM vendas
    WHERE EXTRACT(YEAR FROM data) = $1
    GROUP BY mes ORDER BY mes
  `, [ano]);
  res.json(rows);
});

// POST /api/vendas
router.post('/', auth, async (req, res) => {
  const { numero_venda, data, codigo_material, nome_material, codigo_lote,
          peso_vendido, valor_venda_kg, custo_kg, pagamento, obs } = req.body;
  if (!isDate(data))                  return res.status(400).json({ erro: 'Data inválida.' });
  if (!str(codigo_material, 1, 20))   return res.status(400).json({ erro: 'Material inválido.' });
  if (!num(peso_vendido, 0.001))      return res.status(400).json({ erro: 'Peso inválido.' });
  if (!num(valor_venda_kg, 0.01))     return res.status(400).json({ erro: 'Valor/kg inválido.' });
  if (pagamento && !PAGAMENTOS_VALIDOS.includes(pagamento))
    return res.status(400).json({ erro: 'Método de pagamento inválido.' });
  try {
    const { rows } = await db.query(
      `INSERT INTO vendas (numero_venda, data, codigo_material, nome_material, codigo_lote,
        peso_vendido, valor_venda_kg, custo_kg, pagamento, obs, registrado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [numero_venda || null, data, codigo_material.trim().toUpperCase(),
       nome_material?.trim() || null, codigo_lote?.trim().toUpperCase() || null,
       Number(peso_vendido), Number(valor_venda_kg), Number(custo_kg) || 0,
       pagamento || null, obs?.trim() || null, req.user.nome]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// PUT /api/vendas/:id
router.put('/:id', auth, async (req, res) => {
  const { numero_venda, data, codigo_material, nome_material, codigo_lote,
          peso_vendido, valor_venda_kg, custo_kg, pagamento, obs } = req.body;
  if (!isDate(data))                  return res.status(400).json({ erro: 'Data inválida.' });
  if (!str(codigo_material, 1, 20))   return res.status(400).json({ erro: 'Material inválido.' });
  if (!num(peso_vendido, 0.001))      return res.status(400).json({ erro: 'Peso inválido.' });
  if (!num(valor_venda_kg, 0.01))     return res.status(400).json({ erro: 'Valor/kg inválido.' });
  if (pagamento && !PAGAMENTOS_VALIDOS.includes(pagamento))
    return res.status(400).json({ erro: 'Método de pagamento inválido.' });
  try {
    const { rows } = await db.query(
      `UPDATE vendas SET numero_venda=$1, data=$2, codigo_material=$3, nome_material=$4,
        codigo_lote=$5, peso_vendido=$6, valor_venda_kg=$7, custo_kg=$8,
        pagamento=$9, obs=$10 WHERE id=$11 RETURNING *`,
      [numero_venda || null, data, codigo_material.trim().toUpperCase(),
       nome_material?.trim() || null, codigo_lote?.trim().toUpperCase() || null,
       Number(peso_vendido), Number(valor_venda_kg), Number(custo_kg) || 0,
       pagamento || null, obs?.trim() || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Venda não encontrada.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// DELETE /api/vendas/:id
router.delete('/:id', auth, async (req, res) => {
  await db.query('DELETE FROM vendas WHERE id = $1', [req.params.id]);
  res.json({ mensagem: 'Venda removida.' });
});

module.exports = router;
