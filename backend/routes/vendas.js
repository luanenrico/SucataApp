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
  let sql = 'SELECT * FROM vendas WHERE usuario_id = $1';
  const params = [req.user.id];
  if (!isNaN(mes) && !isNaN(ano) && mes >= 1 && mes <= 12 && ano >= 2000 && ano <= 2100) {
    sql += ' AND EXTRACT(MONTH FROM data) = $2 AND EXTRACT(YEAR FROM data) = $3';
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
    WHERE EXTRACT(YEAR FROM data) = $1 AND usuario_id = $2
    GROUP BY mes ORDER BY mes
  `, [ano, req.user.id]);
  res.json(rows);
});

// Helper: verifica saldo do lote do usuário
async function verificaSaldoLote(codigo_lote, usuario_id, excluirVendaId = null) {
  if (!codigo_lote) return null;
  const { rows } = await db.query(`
    SELECT
      l.peso_comprado,
      COALESCE(SUM(v.peso_vendido), 0) AS peso_vendido_total
    FROM lotes l
    LEFT JOIN vendas v ON v.codigo_lote = l.codigo AND v.usuario_id = l.usuario_id
      ${excluirVendaId ? 'AND v.id != $3' : ''}
    WHERE l.codigo = $1 AND l.usuario_id = $2
    GROUP BY l.peso_comprado
  `, excluirVendaId ? [codigo_lote, usuario_id, excluirVendaId] : [codigo_lote, usuario_id]);

  if (!rows.length) return null;
  const saldo = Number(rows[0].peso_comprado) - Number(rows[0].peso_vendido_total);
  return saldo;
}

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
    if (codigo_lote) {
      const saldo = await verificaSaldoLote(codigo_lote.trim().toUpperCase(), req.user.id);
      if (saldo !== null && Number(peso_vendido) > saldo) {
        return res.status(400).json({
          erro: `Estoque insuficiente. Saldo disponível no lote: ${saldo.toFixed(2)} kg.`
        });
      }
    }
    const { rows } = await db.query(
      `INSERT INTO vendas (numero_venda, data, codigo_material, nome_material, codigo_lote,
        peso_vendido, valor_venda_kg, custo_kg, pagamento, obs, registrado_por, usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [numero_venda || null, data, codigo_material.trim().toUpperCase(),
       nome_material?.trim() || null, codigo_lote?.trim().toUpperCase() || null,
       Number(peso_vendido), Number(valor_venda_kg), Number(custo_kg) || 0,
       pagamento || null, obs?.trim() || null, req.user.nome, req.user.id]
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
    if (codigo_lote) {
      const saldo = await verificaSaldoLote(codigo_lote.trim().toUpperCase(), req.user.id, req.params.id);
      if (saldo !== null && Number(peso_vendido) > saldo) {
        return res.status(400).json({
          erro: `Estoque insuficiente. Saldo disponível no lote: ${saldo.toFixed(2)} kg.`
        });
      }
    }
    const { rows } = await db.query(
      `UPDATE vendas SET numero_venda=$1, data=$2, codigo_material=$3, nome_material=$4,
        codigo_lote=$5, peso_vendido=$6, valor_venda_kg=$7, custo_kg=$8,
        pagamento=$9, obs=$10 WHERE id=$11 AND usuario_id=$12 RETURNING *`,
      [numero_venda || null, data, codigo_material.trim().toUpperCase(),
       nome_material?.trim() || null, codigo_lote?.trim().toUpperCase() || null,
       Number(peso_vendido), Number(valor_venda_kg), Number(custo_kg) || 0,
       pagamento || null, obs?.trim() || null, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Venda não encontrada.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ erro: 'Erro interno.' });
  }
});

// DELETE /api/vendas/:id
router.delete('/:id', auth, async (req, res) => {
  await db.query('DELETE FROM vendas WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
  res.json({ mensagem: 'Venda removida.' });
});

module.exports = router;
