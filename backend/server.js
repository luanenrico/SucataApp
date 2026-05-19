require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const fs        = require('fs');
const db        = require('./db');

// ── Valida variáveis obrigatórias ────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('❌ JWT_SECRET não definido ou muito curto (mínimo 16 chars). Configure o .env');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não definida. Configure o .env');
  process.exit(1);
}

const app    = express();
const PORT   = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Segurança: headers HTTP ──────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ─────────────────────────────────────────────────────
// Em produção: só aceita a própria origem (defina ALLOWED_ORIGIN no .env)
// Em dev: libera localhost
const allowedOrigins = isProd
  ? [process.env.ALLOWED_ORIGIN].filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || !isProd) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origem não permitida'));
  },
  credentials: true,
}));

// ── Rate limit geral: 300 req/min por IP ─────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Tente novamente em instantes.' },
}));

// Limita tamanho do body a 50kb
app.use(express.json({ limit: '50kb' }));

// Serve o frontend (index.html, manifest, sw.js, icons)
app.use(express.static(path.join(__dirname, '..')));

// ── Rotas da API ─────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/usuarios',  require('./routes/usuarios'));
app.use('/api/materiais', require('./routes/materiais'));
app.use('/api/lotes',     require('./routes/lotes'));
app.use('/api/vendas',    require('./routes/vendas'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── Inicializa o banco e sobe o servidor ─────────────────────
async function start() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    await db.query(schema);
    console.log('✅ Banco de dados pronto.');
  } catch (e) {
    console.error('Erro ao inicializar banco:', e.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 SucataApp rodando na porta ${PORT}`);
    console.log(`   http://localhost:${PORT}`);
  });
}

start();
