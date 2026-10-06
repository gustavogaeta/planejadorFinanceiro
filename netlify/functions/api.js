import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export const handler = async (event) => {
  const method = event.httpMethod
  const rawPath = event.path.replace(/^\/.netlify\/functions\/api/, '') || '/'
  const body = event.body ? JSON.parse(event.body) : {}

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  }

  if (method === 'OPTIONS') return { statusCode: 204, headers, body: '' }

  try {
    // GET /meses
    if (method === 'GET' && rawPath === '/meses') {
      const meses = await prisma.mes.findMany({ orderBy: [{ ano: 'desc' }, { mes: 'desc' }] })
      return ok(meses, headers)
    }

    // POST /meses
    if (method === 'POST' && rawPath === '/meses') {
      const { mes, ano, renda, metaEconomia } = body
      if (!mes || !ano) return err('Mes e ano sao obrigatorios.', 400, headers)
      if (renda < 0)    return err('Renda nao pode ser negativa.', 400, headers)
      const existente = await prisma.mes.findUnique({ where: { mes_ano: { mes, ano } } })
      if (existente) return err('Mes ja cadastrado.', 409, headers)
      const novoMes = await prisma.mes.create({ data: { mes, ano, renda: renda || 0, metaEconomia: metaEconomia || 0 } })
      return ok(novoMes, headers, 201)
    }

    // GET /meses/:id
    const getMesMatch = rawPath.match(/^\/meses\/(\d+)$/)
    if (method === 'GET' && getMesMatch) {
      const id = parseInt(getMesMatch[1])
      const mesData = await prisma.mes.findUnique({ where: { id }, include: { gastos: { orderBy: { data: 'desc' } } } })
      if (!mesData) return err('Mes nao encontrado.', 404, headers)
      const startDate = new Date(mesData.ano, mesData.mes - 1, 1)
      const endDate   = new Date(mesData.ano, mesData.mes, 1)
      const movimentacoes = await prisma.movimentacaoCaixinha.findMany({ where: { data: { gte: startDate, lt: endDate } } })
      return ok({ ...mesData, movimentacoes }, headers)
    }

    // PUT /meses/:id
    const putMesMatch = rawPath.match(/^\/meses\/(\d+)$/)
    if (method === 'PUT' && putMesMatch) {
      const id = parseInt(putMesMatch[1])
      const { renda, metaEconomia } = body
      if (renda !== undefined && renda < 0) return err('Renda nao pode ser negativa.', 400, headers)
      const mesAtualizado = await prisma.mes.update({ where: { id }, data: { renda, metaEconomia } })
      return ok(mesAtualizado, headers)
    }

    // GET /gastos/:mesId
    const getGastosMatch = rawPath.match(/^\/gastos\/(\d+)$/)
    if (method === 'GET' && getGastosMatch) {
      const mesId = parseInt(getGastosMatch[1])
      const gastos = await prisma.gasto.findMany({ where: { mesId }, orderBy: { data: 'desc' } })
      return ok(gastos, headers)
    }

    // POST /gastos
    if (method === 'POST' && rawPath === '/gastos') {
      const { descricao, valor, categoria, data, mesId } = body
      if (!descricao)          return err('Descricao e obrigatoria.', 400, headers)
      if (!valor || valor <= 0) return err('Valor deve ser maior que zero.', 400, headers)
      if (!categoria)          return err('Categoria e obrigatoria.', 400, headers)
      if (!mesId)              return err('Mes e obrigatorio.', 400, headers)
      const gasto = await prisma.gasto.create({
        data: { descricao, valor, categoria, data: data ? new Date(data) : new Date(), mesId }
      })
      return ok(gasto, headers, 201)
    }

    // DELETE /gastos/:id
    const delGastoMatch = rawPath.match(/^\/gastos\/(\d+)$/)
    if (method === 'DELETE' && delGastoMatch) {
      const id = parseInt(delGastoMatch[1])
      await prisma.gasto.delete({ where: { id } })
      return ok({ ok: true }, headers)
    }

    // GET /caixinhas
    if (method === 'GET' && rawPath === '/caixinhas') {
      const caixinhas = await prisma.caixinha.findMany({ orderBy: { criadoEm: 'asc' } })
      return ok(caixinhas, headers)
    }

    // POST /caixinhas
    if (method === 'POST' && rawPath === '/caixinhas') {
      const { nome, objetivo, metaValor } = body
      if (!nome) return err('Nome e obrigatorio.', 400, headers)
      const caixinha = await prisma.caixinha.create({
        data: { nome, objetivo: objetivo || null, metaValor: metaValor || null }
      })
      return ok(caixinha, headers, 201)
    }

    // DELETE /caixinhas/:id
    const delCaixinhaMatch = rawPath.match(/^\/caixinhas\/(\d+)$/)
    if (method === 'DELETE' && delCaixinhaMatch) {
      const id = parseInt(delCaixinhaMatch[1])
      await prisma.movimentacaoCaixinha.deleteMany({ where: { caixinhaId: id } })
      await prisma.caixinha.delete({ where: { id } })
      return ok({ ok: true }, headers)
    }

    // GET /caixinhas/:id/movimentacoes
    const getMovMatch = rawPath.match(/^\/caixinhas\/(\d+)\/movimentacoes$/)
    if (method === 'GET' && getMovMatch) {
      const caixinhaId = parseInt(getMovMatch[1])
      const movimentacoes = await prisma.movimentacaoCaixinha.findMany({ where: { caixinhaId }, orderBy: { data: 'desc' } })
      return ok(movimentacoes, headers)
    }

    // POST /caixinhas/:id/movimentacoes
    const postMovMatch = rawPath.match(/^\/caixinhas\/(\d+)\/movimentacoes$/)
    if (method === 'POST' && postMovMatch) {
      const caixinhaId = parseInt(postMovMatch[1])
      const { tipo, valor, descricao } = body
      if (!tipo || !['entrada', 'saida'].includes(tipo)) return err('Tipo deve ser "entrada" ou "saida".', 400, headers)
      if (!valor || valor <= 0) return err('Valor deve ser maior que zero.', 400, headers)
      const caixinha = await prisma.caixinha.findUnique({ where: { id: caixinhaId } })
      if (!caixinha) return err('Caixinha nao encontrada.', 404, headers)
      if (tipo === 'saida' && valor > caixinha.valorAtual) return err('Saldo insuficiente.', 400, headers)
      const novoValor = tipo === 'entrada' ? caixinha.valorAtual + valor : caixinha.valorAtual - valor
      await prisma.caixinha.update({ where: { id: caixinhaId }, data: { valorAtual: novoValor } })
      const mov = await prisma.movimentacaoCaixinha.create({ data: { caixinhaId, tipo, valor, descricao: descricao || null } })
      return ok({ ...mov, valorAtualCaixinha: novoValor }, headers, 201)
    }

    // GET /movimentacoes
    if (method === 'GET' && rawPath === '/movimentacoes') {
      const movimentacoes = await prisma.movimentacaoCaixinha.findMany({
        include: { caixinha: { select: { nome: true } } },
        orderBy: { data: 'desc' },
        take: 50
      })
      return ok(movimentacoes, headers)
    }

    return err('Rota nao encontrada: ' + method + ' ' + rawPath, 404, headers)
  } catch (e) {
    console.error('Erro Interno:', e)
    return err('Erro interno no servidor.', 500, headers)
  }
}

function ok(data, headers, status = 200) {
  return { statusCode: status, headers, body: JSON.stringify(data) }
}

function err(message, status, headers) {
  return { statusCode: status, headers, body: JSON.stringify({ erro: message }) }
}
