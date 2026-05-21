-- ============================================================
-- SucataApp — Schema PostgreSQL
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(100) NOT NULL,
  usuario     VARCHAR(50)  NOT NULL UNIQUE,
  senha_hash  TEXT         NOT NULL,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Materiais de sucata
CREATE TABLE IF NOT EXISTS materiais (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        VARCHAR(20)    NOT NULL UNIQUE,
  tipo          VARCHAR(100)   NOT NULL,
  preco_venda   NUMERIC(10,2)  NOT NULL DEFAULT 0,
  custo_padrao  NUMERIC(10,2)  NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Lotes de compra
CREATE TABLE IF NOT EXISTS lotes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           VARCHAR(20)   NOT NULL UNIQUE,
  data_compra      DATE          NOT NULL,
  codigo_material  VARCHAR(20)   NOT NULL REFERENCES materiais(codigo) ON UPDATE CASCADE,
  peso_comprado    NUMERIC(10,2) NOT NULL,
  custo_total      NUMERIC(10,2) NOT NULL,
  custo_por_kg     NUMERIC(10,4) GENERATED ALWAYS AS (
                     CASE WHEN peso_comprado > 0 THEN custo_total / peso_comprado ELSE 0 END
                   ) STORED,
  observacao       TEXT,
  criado_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Vendas
CREATE TABLE IF NOT EXISTS vendas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_venda    INTEGER       NOT NULL,
  data            DATE          NOT NULL,
  codigo_material VARCHAR(20)   NOT NULL REFERENCES materiais(codigo) ON UPDATE CASCADE,
  nome_material   VARCHAR(100)  NOT NULL,
  codigo_lote     VARCHAR(20)   REFERENCES lotes(codigo) ON UPDATE CASCADE,
  peso_vendido    NUMERIC(10,2) NOT NULL,
  valor_venda_kg  NUMERIC(10,4) NOT NULL,
  custo_kg        NUMERIC(10,4) NOT NULL DEFAULT 0,
  receita_total   NUMERIC(10,2) GENERATED ALWAYS AS (peso_vendido * valor_venda_kg) STORED,
  custo_total     NUMERIC(10,2) GENERATED ALWAYS AS (peso_vendido * custo_kg) STORED,
  lucro           NUMERIC(10,2) GENERATED ALWAYS AS (
                    (peso_vendido * valor_venda_kg) - (peso_vendido * custo_kg)
                  ) STORED,
  margem          NUMERIC(6,2)  GENERATED ALWAYS AS (
                    CASE WHEN (peso_vendido * valor_venda_kg) > 0
                    THEN ROUND(((peso_vendido * valor_venda_kg - peso_vendido * custo_kg)
                         / (peso_vendido * valor_venda_kg)) * 100, 2)
                    ELSE 0 END
                  ) STORED,
  pagamento       VARCHAR(50),
  obs             TEXT,
  registrado_por  VARCHAR(100),
  criado_em       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Colunas adicionadas após v1 (seguras para rodar em banco existente)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email             VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token       VARCHAR(64);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_expires     TIMESTAMPTZ;

-- ============================================================
-- v2: isolamento por usuário — cada conta vê apenas seus dados
-- ============================================================

-- Adicionar usuario_id nas tabelas de negócio
ALTER TABLE materiais ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE lotes     ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE vendas    ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE;

-- Remover FKs que referenciam colunas que deixarão de ser globalmente únicas
ALTER TABLE lotes  DROP CONSTRAINT IF EXISTS lotes_codigo_material_fkey;
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS vendas_codigo_lote_fkey;

-- Remover unique constraints de coluna única (agora unique por usuário)
ALTER TABLE materiais DROP CONSTRAINT IF EXISTS materiais_codigo_key;
ALTER TABLE lotes     DROP CONSTRAINT IF EXISTS lotes_codigo_key;

-- Recriar como unique composto (codigo + usuario_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materiais_codigo_usuario_uq') THEN
    ALTER TABLE materiais ADD CONSTRAINT materiais_codigo_usuario_uq UNIQUE (codigo, usuario_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lotes_codigo_usuario_uq') THEN
    ALTER TABLE lotes ADD CONSTRAINT lotes_codigo_usuario_uq UNIQUE (codigo, usuario_id);
  END IF;
END $$;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_vendas_data       ON vendas(data);
CREATE INDEX IF NOT EXISTS idx_vendas_material   ON vendas(codigo_material);
CREATE INDEX IF NOT EXISTS idx_lotes_material    ON lotes(codigo_material);
CREATE INDEX IF NOT EXISTS idx_materiais_usuario ON materiais(usuario_id);
CREATE INDEX IF NOT EXISTS idx_lotes_usuario     ON lotes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_vendas_usuario    ON vendas(usuario_id);
