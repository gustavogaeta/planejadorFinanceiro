import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'public')))

// ─── MESES ───────────────────────────────────────────────────────────────────

// Lista todos os meses existentes
app.get('/api/meses', async (req, res) => {
  const meses = await prisma.mes.findMany({ orderBy: [{ ano: 'desc' }, { mes: 'desc' }] })
  res.json(meses)
})

// Cria ou retorna o mês atual
app.post('/api/meses', async (req, res) => {
  const { mes, ano, renda, metaEconomia } = req.body
  if (!mes || !ano) return res.status(400).json({ erro: 'Mês e ano são obrigatórios.' })
  if (renda < 0) return res.status(400).json({ erro: 'Renda não pode ser negativa.' })

  const existente = await prisma.mes.findUnique({ where: { mes_ano: { mes, ano } } })
  if (existente) return res.status(409).json({ erro: 'Mês já cadastrado.', mes: existente })

  const novoMes = await prisma.mes.create({ data: { mes, ano, renda: renda || 0, metaEconomia: metaEconomia || 0 } })
  res.status(201).json(novoMes)
})

// Busca um mês específico com seus gastos e movimentações de caixinha
app.get('/api/meses/:id', async (req, res) => {
  const id = parseInt(req.params.id)
  const mesData = await prisma.mes.findUnique({ where: { id }, include: { gastos: { orderBy: { data: 'desc' } } } })
  if (!mesData) return res.status(404).json({ erro: 'Mês não encontrado.' })
  
  // Buscar movimentações dentro deste mês
  const startDate = new Date(mesData.ano, mesData.mes - 1, 1)
  const endDate = new Date(mesData.ano, mesData.mes, 1)
  const movimentacoes = await prisma.movimentacaoCaixinha.findMany({
    where: { data: { gte: startDate, lt: endDate } }
  })
  
  res.json({ ...mesData, movimentacoes })
})

// Atualiza renda e/ou meta de economia de um mês
app.put('/api/meses/:id', async (req, res) => {
  const id = parseInt(req.params.id)
  const { renda, metaEconomia } = req.body
  if (renda !== undefined && renda < 0) return res.status(400).json({ erro: 'Renda não pode ser negativa.' })

  const mesAtualizado = await prisma.mes.update({ where: { id }, data: { renda, metaEconomia } })
  res.json(mesAtualizado)
})

// ─── GASTOS ──────────────────────────────────────────────────────────────────

// Lista gastos de um mês
app.get('/api/gastos/:mesId', async (req, res) => {
  const mesId = parseInt(req.params.mesId)
  const gastos = await prisma.gasto.findMany({ where: { mesId }, orderBy: { data: 'desc' } })
  res.json(gastos)
})

// Cria um gasto
app.post('/api/gastos', async (req, res) => {
  const { descricao, valor, categoria, data, mesId } = req.body
  if (!descricao) return res.status(400).json({ erro: 'Descrição é obrigatória.' })
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'Valor deve ser maior que zero.' })
  if (!categoria) return res.status(400).json({ erro: 'Categoria é obrigatória.' })
  if (!mesId) return res.status(400).json({ erro: 'Mês é obrigatório.' })

  const gasto = await prisma.gasto.create({
    data: { descricao, valor, categoria, data: data ? new Date(data) : new Date(), mesId }
  })
  res.status(201).json(gasto)
})

// Remove um gasto
app.delete('/api/gastos/:id', async (req, res) => {
  const id = parseInt(req.params.id)
  await prisma.gasto.delete({ where: { id } })
  res.json({ ok: true })
})

// ─── CAIXINHAS ───────────────────────────────────────────────────────────────

// Lista todas as caixinhas
app.get('/api/caixinhas', async (req, res) => {
  const caixinhas = await prisma.caixinha.findMany({ orderBy: { criadoEm: 'asc' } })
  res.json(caixinhas)
})

// Cria uma caixinha
app.post('/api/caixinhas', async (req, res) => {
  const { nome, objetivo, metaValor } = req.body
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' })

  const caixinha = await prisma.caixinha.create({
    data: { nome, objetivo: objetivo || null, metaValor: metaValor || null }
  })
  res.status(201).json(caixinha)
})

// Remove uma caixinha
app.delete('/api/caixinhas/:id', async (req, res) => {
  const id = parseInt(req.params.id)
  await prisma.movimentacaoCaixinha.deleteMany({ where: { caixinhaId: id } })
  await prisma.caixinha.delete({ where: { id } })
  res.json({ ok: true })
})

// ─── MOVIMENTAÇÕES DE CAIXINHAS ──────────────────────────────────────────────

// Lista movimentações de uma caixinha
app.get('/api/caixinhas/:id/movimentacoes', async (req, res) => {
  const caixinhaId = parseInt(req.params.id)
  const movimentacoes = await prisma.movimentacaoCaixinha.findMany({
    where: { caixinhaId },
    orderBy: { data: 'desc' }
  })
  res.json(movimentacoes)
})

// Adiciona ou retira dinheiro de uma caixinha
app.post('/api/caixinhas/:id/movimentacoes', async (req, res) => {
  const caixinhaId = parseInt(req.params.id)
  const { tipo, valor, descricao } = req.body

  if (!tipo || !['entrada', 'saida'].includes(tipo)) return res.status(400).json({ erro: 'Tipo deve ser "entrada" ou "saida".' })
  if (!valor || valor <= 0) return res.status(400).json({ erro: 'Valor deve ser maior que zero.' })

  const caixinha = await prisma.caixinha.findUnique({ where: { id: caixinhaId } })
  if (!caixinha) return res.status(404).json({ erro: 'Caixinha não encontrada.' })

  if (tipo === 'saida' && valor > caixinha.valorAtual) {
    return res.status(400).json({ erro: 'Saldo insuficiente na caixinha.' })
  }

  const novoValor = tipo === 'entrada' ? caixinha.valorAtual + valor : caixinha.valorAtual - valor

  await prisma.caixinha.update({ where: { id: caixinhaId }, data: { valorAtual: novoValor } })
  const mov = await prisma.movimentacaoCaixinha.create({
    data: { caixinhaId, tipo, valor, descricao: descricao || null }
  })
  res.status(201).json({ ...mov, valorAtualCaixinha: novoValor })
})

// Lista todas as movimentações (histórico geral)
app.get('/api/movimentacoes', async (req, res) => {
  const movimentacoes = await prisma.movimentacaoCaixinha.findMany({
    include: { caixinha: { select: { nome: true } } },
    orderBy: { data: 'desc' },
    take: 50
  })
  res.json(movimentacoes)
})

// ─── INICIAR SERVIDOR ────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`)
})
