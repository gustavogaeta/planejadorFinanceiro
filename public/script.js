// ─── ESTADO GLOBAL ──────────────────────────────────────────────────────────
const state = {
  meses: [],
  mesAtualId: null,
  mesAtual: null,
  gastos: [],
  caixinhas: [],
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d) => new Date(d).toLocaleDateString('pt-BR')
const clamp = (v, min = 0, max = 100) => Math.min(Math.max(v, min), max)

const MESES_NOMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function nomeMes(m, a) { return `${MESES_NOMES[m]} ${a}` }

function badgeClass(cat) {
  const map = {
    'alimentação': 'badge-alimentacao',
    'transporte':  'badge-transporte',
    'lazer':       'badge-lazer',
    'compras':     'badge-compras',
    'educação':    'badge-educacao',
    'academia':    'badge-academia',
  }
  return 'badge ' + (map[cat.toLowerCase()] || 'badge-outros')
}

function toast(msg, tipo = 'success') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = `show ${tipo}`
  clearTimeout(toast._t)
  toast._t = setTimeout(() => { el.className = '' }, 3200)
}

// ─── TEMA E RESPONSIVO ────────────────────────────────────────────────────────
const currentTheme = localStorage.getItem('theme') || 'light'
if (currentTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')

document.getElementById('btn-theme-toggle').addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  if (isDark) {
    document.documentElement.removeAttribute('data-theme')
    localStorage.setItem('theme', 'light')
  } else {
    document.documentElement.setAttribute('data-theme', 'dark')
    localStorage.setItem('theme', 'dark')
  }
})

const btnHamburger = document.getElementById('btn-hamburger')
const sidebar = document.getElementById('sidebar')
const sidebarOverlay = document.getElementById('sidebar-overlay')

function toggleSidebar() {
  sidebar.classList.toggle('open')
  sidebarOverlay.classList.toggle('open')
}

if (btnHamburger) btnHamburger.addEventListener('click', toggleSidebar)
if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar)

// ─── NAVEGAÇÃO ────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.dataset.section) return // Ignora botões sem seção (ex: theme-toggle)
    
    document.querySelectorAll('.nav-btn:not(.theme-toggle)').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById('section-' + btn.dataset.section).classList.add('active')
    
    if (window.innerWidth <= 700) {
      sidebar.classList.remove('open')
      sidebarOverlay.classList.remove('open')
    }

    if (btn.dataset.section === 'historico')     renderHistorico()
    if (btn.dataset.section === 'caixinhas')     renderCaixinhasPage()
    if (btn.dataset.section === 'configuracoes') renderConfiguracoes()
  })
})

// ─── API ──────────────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.erro || 'Erro na requisição')
  return data
}

// ─── CARREGAR MESES ───────────────────────────────────────────────────────────
async function carregarMeses() {
  state.meses = await api('GET', '/api/meses')
  sincronizarSelects()
  if (state.meses.length > 0) {
    if (!state.mesAtualId) state.mesAtualId = state.meses[0].id
    await selecionarMes(state.mesAtualId)
  }
}

function sincronizarSelects() {
  const opts = state.meses.length === 0
    ? '<option value="">Nenhum mês</option>'
    : state.meses.map(m => `<option value="${m.id}">${nomeMes(m.mes, m.ano)}</option>`).join('')

  document.getElementById('mes-select').innerHTML = opts
  document.getElementById('mes-select-gastos').innerHTML = opts
  if (state.mesAtualId) {
    document.getElementById('mes-select').value = state.mesAtualId
    document.getElementById('mes-select-gastos').value = state.mesAtualId
  }
}

document.getElementById('mes-select').addEventListener('change', async (e) => {
  if (e.target.value) await selecionarMes(parseInt(e.target.value))
})

document.getElementById('mes-select-gastos').addEventListener('change', async (e) => {
  if (e.target.value) {
    state.mesAtualId = parseInt(e.target.value)
    await selecionarMes(state.mesAtualId)
  }
})

async function selecionarMes(id) {
  state.mesAtualId = id
  state.mesAtual = await api('GET', `/api/meses/${id}`)
  state.gastos = state.mesAtual.gastos || []
  renderDashboard()
  renderTabelaGastos()
  sincronizarSelects()
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function renderDashboard() {
  if (!state.mesAtual) return

  const { renda, metaEconomia, mes, ano } = state.mesAtual
  const totalGastos = state.gastos.reduce((s, g) => s + g.valor, 0)
  const guardado    = (state.mesAtual.movimentacoes || []).reduce((s, m) => m.tipo === 'entrada' ? s + m.valor : s - m.valor, 0)
  const disponivel  = renda - totalGastos - guardado
  const pctGasto    = renda > 0 ? (totalGastos / renda * 100) : 0
  const pctMeta     = metaEconomia > 0 ? (guardado / metaEconomia * 100) : 0

  // Título da página
  document.getElementById('dashboard-titulo').textContent = nomeMes(mes, ano)
  document.getElementById('dashboard-subtitulo').textContent = 'Resumo financeiro do mês'

  // Guardado
  const elGuardado = document.getElementById('card-guardado')
  elGuardado.textContent = fmt(guardado)
  elGuardado.className = 'overview-value ' + (guardado < 0 ? 'negative' : 'positive')

  document.getElementById('overview-guardado-note').textContent =
    renda > 0 ? `${(guardado / renda * 100).toFixed(0)}% da renda` : '—'

  document.getElementById('sub-meta').textContent =
    metaEconomia > 0 ? `Meta: ${fmt(metaEconomia)}` : 'Sem meta definida'

  const pctLabel = metaEconomia > 0 ? `${clamp(pctMeta).toFixed(0)}%` : '—'
  document.getElementById('meta-pct-label').textContent = pctLabel

  const prog = document.getElementById('progress-guardado')
  prog.style.width = clamp(pctMeta) + '%'
  prog.className = 'progress-fill' + (pctMeta > 100 ? '' : pctMeta < 50 ? ' mid' : '')

  // Renda
  document.getElementById('card-renda').textContent = fmt(renda)

  // Gastos
  const elGastos = document.getElementById('card-gastos')
  elGastos.textContent = fmt(totalGastos)
  elGastos.className = 'overview-value ' + (totalGastos > renda ? 'negative' : '')
  document.getElementById('sub-pct-gasto').textContent =
    renda > 0 ? `${pctGasto.toFixed(1)}% da renda` : '—'

  // Disponível
  const elDisp = document.getElementById('card-disponivel')
  elDisp.textContent = fmt(disponivel)
  elDisp.className = 'overview-value ' + (disponivel < 0 ? 'negative' : disponivel === 0 ? 'muted' : '')

  // Mensagem contextual
  renderInsight(guardado, metaEconomia, pctMeta)

  // Gráfico categorias
  renderGraficoCategorias()

  // Caixinhas
  carregarCaixinhasDashboard()
}

function renderInsight(guardado, meta, pctMeta) {
  const box = document.getElementById('mensagem-financeira')
  if (!state.mesAtual) { box.style.display = 'none'; return }

  const partes = []

  if (guardado < 0) {
    box.className = 'insight-box danger'
    partes.push(`Orçamento ultrapassado em <strong>${fmt(Math.abs(guardado))}</strong>. Seus gastos estão acima da renda do mês.`)
  } else {
    box.className = 'insight-box'
    partes.push(`Você guardou <strong>${fmt(guardado)}</strong> este mês.`)
  }

  if (meta > 0) {
    if (pctMeta >= 100) partes.push(`Meta atingida. Bom trabalho.`)
    else if (guardado >= 0) partes.push(`Faltam <strong>${fmt(meta - guardado)}</strong> para atingir a meta.`)
  }

  const porCat = {}
  state.gastos.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + g.valor })
  const top = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 2)
  if (top.length) {
    partes.push(`Maiores gastos: <strong>${top.map(t => t[0]).join('</strong> e <strong>')}</strong>.`)
  }

  box.innerHTML = partes.join(' ')
  box.style.display = 'block'
}

function renderGraficoCategorias() {
  const el = document.getElementById('grafico-categorias')
  if (!state.gastos.length) { el.innerHTML = '<div class="empty">Sem gastos no mês</div>'; return }

  const porCat = {}
  state.gastos.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + g.valor })
  const sorted = Object.entries(porCat).sort((a, b) => b[1] - a[1])
  const max = sorted[0][1]

  el.innerHTML = sorted.map(([cat, val]) => `
    <div class="bar-item">
      <span class="bar-label">${cat}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(val / max * 100).toFixed(1)}%"></div></div>
      <span class="bar-value">${fmt(val)}</span>
    </div>`).join('')
}

async function carregarCaixinhasDashboard() {
  const caixinhas = await api('GET', '/api/caixinhas')
  state.caixinhas = caixinhas
  const el = document.getElementById('caixinhas-dashboard')
  const totalCaixinhas = caixinhas.reduce((s, c) => s + c.valorAtual, 0)
  const guardado = state.mesAtual ? (state.mesAtual.movimentacoes || []).reduce((s, m) => m.tipo === 'entrada' ? s + m.valor : s - m.valor, 0) : 0
  const disponivel = state.mesAtual
    ? state.mesAtual.renda - state.gastos.reduce((s, g) => s + g.valor, 0) - guardado
    : 0

  document.getElementById('card-total-caixinhas').textContent = fmt(totalCaixinhas)
  document.getElementById('card-total-organizado').textContent = fmt(disponivel + totalCaixinhas)
  document.getElementById('card-disponivel-livre').textContent = fmt(disponivel)

  if (!caixinhas.length) {
    el.innerHTML = '<div class="empty" style="padding:20px">Nenhuma caixinha criada ainda.</div>'
    return
  }

  el.innerHTML = caixinhas.map(c => {
    const pct = c.metaValor ? clamp(c.valorAtual / c.metaValor * 100) : null
    return `
    <div class="caixinha-row">
      <div class="caixinha-info">
        <div class="caixinha-nome">${c.nome}</div>
        ${c.objetivo ? `<div class="caixinha-objetivo-text">${c.objetivo}</div>` : ''}
        ${pct !== null ? `
        <div class="caixinha-progress-row">
          <div class="caixinha-progress-bar"><div class="caixinha-progress-fill" style="width:${pct}%"></div></div>
          <span class="caixinha-pct">${pct.toFixed(0)}%</span>
        </div>` : ''}
      </div>
      <div class="caixinha-valor-wrap">
        <div class="caixinha-valor-atual">${fmt(c.valorAtual)}</div>
        ${c.metaValor ? `<div class="caixinha-valor-meta">de ${fmt(c.metaValor)}</div>` : ''}
      </div>
    </div>`
  }).join('')
}

// ─── GASTOS ───────────────────────────────────────────────────────────────────
document.getElementById('gasto-data').value = new Date().toISOString().split('T')[0]

document.getElementById('btn-add-gasto').addEventListener('click', async () => {
  const descricao  = document.getElementById('gasto-descricao').value.trim()
  const valor      = parseFloat(document.getElementById('gasto-valor').value)
  const categoria  = document.getElementById('gasto-categoria').value
  const data       = document.getElementById('gasto-data').value

  if (!state.mesAtualId) return toast('Selecione um mês primeiro.', 'error')
  if (!descricao)          return toast('Informe a descrição.', 'error')
  if (!valor || valor <= 0) return toast('Valor deve ser maior que zero.', 'error')

  try {
    const gasto = await api('POST', '/api/gastos', { descricao, valor, categoria, data, mesId: state.mesAtualId })
    state.gastos.unshift(gasto)
    renderTabelaGastos()
    renderDashboard()
    document.getElementById('gasto-descricao').value = ''
    document.getElementById('gasto-valor').value = ''
    toast('Gasto adicionado.')
  } catch (e) { toast(e.message, 'error') }
})

function renderTabelaGastos() {
  const tbody = document.getElementById('tabela-gastos')
  if (!state.gastos.length) {
    tbody.innerHTML = `<tr><td colspan="5">
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <p class="empty-state-title">Sem gastos no mês</p>
        <p class="empty-state-desc">Adicione seu primeiro gasto para começar a acompanhar seu orçamento.</p>
      </div>
    </td></tr>`
    return
  }
  tbody.innerHTML = state.gastos.map(g => `
    <tr>
      <td class="td-muted">${fmtData(g.data)}</td>
      <td>${g.descricao}</td>
      <td><span class="${badgeClass(g.categoria)}">${g.categoria}</span></td>
      <td class="td-value">${fmt(g.valor)}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="excluirGasto(${g.id})" title="Excluir">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>
    </tr>`).join('')
}

async function excluirGasto(id) {
  if (!confirm('Excluir este gasto?')) return
  try {
    await api('DELETE', `/api/gastos/${id}`)
    state.gastos = state.gastos.filter(g => g.id !== id)
    renderTabelaGastos()
    renderDashboard()
    toast('Gasto excluído.')
  } catch (e) { toast(e.message, 'error') }
}

// ─── MODAL NOVO MÊS ───────────────────────────────────────────────────────────
document.getElementById('btn-novo-mes').addEventListener('click', () => {
  const agora = new Date()
  document.getElementById('nm-mes').value = agora.getMonth() + 1
  document.getElementById('nm-ano').value = agora.getFullYear()
  document.getElementById('nm-renda').value = ''
  document.getElementById('nm-meta').value = ''
  document.getElementById('modal-novo-mes').classList.add('open')
})

document.getElementById('btn-cancelar-mes').addEventListener('click', () => {
  document.getElementById('modal-novo-mes').classList.remove('open')
})

document.getElementById('btn-confirmar-mes').addEventListener('click', async () => {
  const mes  = parseInt(document.getElementById('nm-mes').value)
  const ano  = parseInt(document.getElementById('nm-ano').value)
  const renda = parseFloat(document.getElementById('nm-renda').value) || 0
  const metaEconomia = parseFloat(document.getElementById('nm-meta').value) || 0
  try {
    const novoMes = await api('POST', '/api/meses', { mes, ano, renda, metaEconomia })
    state.meses.unshift(novoMes)
    state.mesAtualId = novoMes.id
    await selecionarMes(novoMes.id)
    document.getElementById('modal-novo-mes').classList.remove('open')
    toast(`${nomeMes(mes, ano)} criado.`)
  } catch (e) { toast(e.message, 'error') }
})

// ─── CAIXINHAS ────────────────────────────────────────────────────────────────
document.getElementById('btn-nova-caixinha').addEventListener('click', () => {
  document.getElementById('nc-nome').value = ''
  document.getElementById('nc-objetivo').value = ''
  document.getElementById('nc-meta').value = ''
  document.getElementById('modal-nova-caixinha').classList.add('open')
})

document.getElementById('btn-cancelar-caixinha').addEventListener('click', () => {
  document.getElementById('modal-nova-caixinha').classList.remove('open')
})

document.querySelectorAll('.sugestao-btn').forEach(btn => {
  btn.addEventListener('click', () => { document.getElementById('nc-nome').value = btn.dataset.val })
})

document.getElementById('btn-confirmar-caixinha').addEventListener('click', async () => {
  const nome     = document.getElementById('nc-nome').value.trim()
  const objetivo = document.getElementById('nc-objetivo').value.trim()
  const metaValor = parseFloat(document.getElementById('nc-meta').value) || null
  if (!nome) return toast('Informe o nome da caixinha.', 'error')
  try {
    await api('POST', '/api/caixinhas', { nome, objetivo, metaValor })
    document.getElementById('modal-nova-caixinha').classList.remove('open')
    await renderCaixinhasPage()
    toast(`Caixinha "${nome}" criada.`)
  } catch (e) { toast(e.message, 'error') }
})

async function renderCaixinhasPage() {
  const caixinhas = await api('GET', '/api/caixinhas')
  state.caixinhas = caixinhas
  const el = document.getElementById('caixinhas-lista')

  if (!caixinhas.length) {
    el.innerHTML = `<div class="empty-state" style="padding:48px">
      <div class="empty-state-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/></svg>
      </div>
      <p class="empty-state-title">Nenhuma caixinha ainda</p>
      <p class="empty-state-desc">Crie caixinhas para organizar seu dinheiro por objetivo.</p>
    </div>`
  } else {
    el.innerHTML = caixinhas.map(c => {
      const pct = c.metaValor ? clamp(c.valorAtual / c.metaValor * 100) : null
      return `
      <div class="caixinha-full-row">
        <div class="caixinha-full-info">
          <div class="caixinha-full-nome">${c.nome}</div>
          ${c.objetivo ? `<div class="caixinha-full-obj">${c.objetivo}</div>` : ''}
          ${pct !== null ? `
          <div class="caixinha-full-progress">
            <div class="caixinha-full-bar-track"><div class="caixinha-full-bar-fill" style="width:${pct}%"></div></div>
            <span class="caixinha-full-pct">${pct.toFixed(0)}%</span>
          </div>` : ''}
        </div>
        <div class="caixinha-full-saldo">
          <div class="caixinha-full-saldo-val">${fmt(c.valorAtual)}</div>
          ${c.metaValor ? `<div class="caixinha-full-saldo-meta">de ${fmt(c.metaValor)}</div>` : ''}
        </div>
        <div class="caixinha-full-actions">
          <button class="btn btn-secondary btn-sm" onclick="abrirMovimentacao(${c.id},'entrada','${c.nome.replace(/'/g,"\\'")}')">Adicionar</button>
          <button class="btn btn-ghost btn-sm" onclick="abrirMovimentacao(${c.id},'saida','${c.nome.replace(/'/g,"\\'")}')">Retirar</button>
          <button class="btn btn-danger btn-sm" onclick="excluirCaixinha(${c.id})" title="Excluir">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>`
    }).join('')
  }

  await carregarMovimentacoes()
}

function abrirMovimentacao(id, tipo, nome) {
  document.getElementById('mov-caixinha-id').value = id
  document.getElementById('mov-tipo').value = tipo
  document.getElementById('mov-valor').value = ''
  document.getElementById('mov-descricao').value = ''
  document.getElementById('modal-mov-title').textContent = tipo === 'entrada'
    ? `Adicionar em ${nome}`
    : `Retirar de ${nome}`
  document.getElementById('modal-movimentar').classList.add('open')
}

document.getElementById('btn-cancelar-mov').addEventListener('click', () => {
  document.getElementById('modal-movimentar').classList.remove('open')
})

document.getElementById('btn-confirmar-mov').addEventListener('click', async () => {
  const caixinhaId = parseInt(document.getElementById('mov-caixinha-id').value)
  const tipo       = document.getElementById('mov-tipo').value
  const valor      = parseFloat(document.getElementById('mov-valor').value)
  const descricao  = document.getElementById('mov-descricao').value.trim()
  if (!valor || valor <= 0) return toast('Informe um valor válido.', 'error')
  try {
    await api('POST', `/api/caixinhas/${caixinhaId}/movimentacoes`, { tipo, valor, descricao })
    document.getElementById('modal-movimentar').classList.remove('open')
    await renderCaixinhasPage()
    await selecionarMes(state.mesAtualId)
    toast(tipo === 'entrada' ? 'Valor adicionado.' : 'Valor retirado.')
  } catch (e) { toast(e.message, 'error') }
})

async function excluirCaixinha(id) {
  if (!confirm('Excluir esta caixinha e seu histórico?')) return
  try {
    await api('DELETE', `/api/caixinhas/${id}`)
    await renderCaixinhasPage()
    carregarCaixinhasDashboard()
    toast('Caixinha excluída.')
  } catch (e) { toast(e.message, 'error') }
}

async function carregarMovimentacoes() {
  const movs = await api('GET', '/api/movimentacoes')
  const tbody = document.getElementById('tabela-movimentacoes')
  if (!movs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Sem movimentações</td></tr>'
    return
  }
  tbody.innerHTML = movs.map(m => `
    <tr>
      <td class="td-muted">${fmtData(m.data)}</td>
      <td>${m.caixinha?.nome || '—'}</td>
      <td class="${m.tipo === 'entrada' ? 'td-pos' : 'td-neg'}">${m.tipo === 'entrada' ? '+ Entrada' : '− Saída'}</td>
      <td class="td-value">${fmt(m.valor)}</td>
      <td class="td-muted">${m.descricao || '—'}</td>
    </tr>`).join('')
}

// ─── HISTÓRICO ────────────────────────────────────────────────────────────────
async function renderHistorico() {
  const meses = await api('GET', '/api/meses')
  const tbody  = document.getElementById('tabela-historico')
  const grafico = document.getElementById('grafico-historico')

  if (!meses.length) {
    tbody.innerHTML  = '<tr><td colspan="6" class="empty">Nenhum mês registrado</td></tr>'
    grafico.innerHTML = '<div class="empty">Sem dados</div>'
    return
  }

  const dados = await Promise.all(meses.map(m => api('GET', `/api/meses/${m.id}`)))
  dados.reverse() // cronológico

  tbody.innerHTML = dados.map(m => {
    const totalGastos = (m.gastos || []).reduce((s, g) => s + g.valor, 0)
    const guardado    = (m.movimentacoes || []).reduce((s, mov) => mov.tipo === 'entrada' ? s + mov.valor : s - mov.valor, 0)
    const ok = m.metaEconomia > 0 && guardado >= m.metaEconomia
    const parcial = m.metaEconomia > 0 && guardado > 0 && guardado < m.metaEconomia
    const pct = m.metaEconomia > 0 ? (guardado / m.metaEconomia * 100).toFixed(0) : null
    const pillClass = ok ? 'pill pill-ok' : parcial ? 'pill pill-warn' : 'pill pill-miss'
    const pillText  = ok ? `Atingida` : pct !== null ? `${pct}%` : '—'
    return `<tr>
      <td style="font-weight:500">${nomeMes(m.mes, m.ano)}</td>
      <td class="td-muted">${fmt(m.renda)}</td>
      <td>${fmt(totalGastos)}</td>
      <td class="${guardado < 0 ? 'td-neg' : 'td-pos'} td-value">${fmt(guardado)}</td>
      <td class="td-muted">${m.metaEconomia > 0 ? fmt(m.metaEconomia) : '—'}</td>
      <td><span class="${pillClass}">${pillText}</span></td>
    </tr>`
  }).join('')

  // Gráfico evolução
  const maxGuardado = Math.max(...dados.map(m => {
    return (m.movimentacoes || []).reduce((s, mov) => mov.tipo === 'entrada' ? s + mov.valor : s - mov.valor, 0)
  }), 1)

  grafico.innerHTML = dados.map(m => {
    const guardado = (m.movimentacoes || []).reduce((s, mov) => mov.tipo === 'entrada' ? s + mov.valor : s - mov.valor, 0)
    const pct = Math.max((guardado / maxGuardado * 100), 0).toFixed(1)
    return `<div class="bar-item">
      <span class="bar-label">${MESES_NOMES[m.mes].slice(0, 3)} ${m.ano}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-value">${fmt(guardado)}</span>
    </div>`
  }).join('')
}

// ─── CONFIGURAÇÕES ────────────────────────────────────────────────────────────
function renderConfiguracoes() {
  const el = document.getElementById('cfg-mes-info')
  if (state.mesAtual) {
    el.innerHTML = `Editando <strong>${nomeMes(state.mesAtual.mes, state.mesAtual.ano)}</strong>`
    document.getElementById('cfg-renda').value = state.mesAtual.renda
    document.getElementById('cfg-meta').value  = state.mesAtual.metaEconomia
  } else {
    el.textContent = 'Nenhum mês selecionado. Crie um mês primeiro.'
  }
}

document.getElementById('btn-salvar-cfg').addEventListener('click', async () => {
  if (!state.mesAtualId) return toast('Nenhum mês selecionado.', 'error')
  const renda = parseFloat(document.getElementById('cfg-renda').value)
  const metaEconomia = parseFloat(document.getElementById('cfg-meta').value)
  if (isNaN(renda) || renda < 0) return toast('Renda inválida.', 'error')
  if (isNaN(metaEconomia) || metaEconomia < 0) return toast('Meta inválida.', 'error')

  const totalGastos = state.gastos.reduce((s, g) => s + g.valor, 0)
  if (totalGastos + metaEconomia > renda && renda > 0) {
    const ok = confirm(
      `Atenção: gastos (${fmt(totalGastos)}) + meta (${fmt(metaEconomia)}) = ${fmt(totalGastos + metaEconomia)}, acima da renda (${fmt(renda)}). Deseja salvar mesmo assim?`
    )
    if (!ok) return
  }

  try {
    const atualizado = await api('PUT', `/api/meses/${state.mesAtualId}`, { renda, metaEconomia })
    state.mesAtual = { ...state.mesAtual, ...atualizado }
    renderDashboard()
    toast('Configurações salvas.')
  } catch (e) { toast(e.message, 'error') }
})

// ─── INICIALIZAR ──────────────────────────────────────────────────────────────
carregarMeses()
