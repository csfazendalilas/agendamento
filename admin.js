// ============================================
// PAINEL DE ADMINISTRAÇÃO DA TELA INICIAL
// Edita a configuração (boxes, avisos, cabeçalho, aviso inicial) e publica
// na aba "Config" da planilha via o backend (Code.gs).
// Depende de site-render.js (construirBox, construirAlerta, CONFIG_PADRAO…).
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbzSnLgusejiDF9oCtL-xjY54TybLn91HyX3NTofToGRs9rqREqg136D2czCsSLhNrti/exec';

let cfg = null;          // configuração em edição
let senhaAtual = '';     // senha validada (fica só na memória da aba)
let sujo = false;        // há alterações não publicadas?
const editoresAbertos = new Set(); // ids com o formulário de edição aberto

// ---------- utilidades ----------

const $ = (id) => document.getElementById(id);
const clonar = (x) => JSON.parse(JSON.stringify(x));
const novoId = (prefixo) => prefixo + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1000);

function definirStatus(texto, classe) {
  const s = $('status');
  s.textContent = texto;
  s.className = 'adm-status' + (classe ? ' ' + classe : '');
}

function marcarSujo() {
  sujo = true;
  definirStatus('● Alterações não publicadas — clique em "Salvar e publicar".', 'sujo');
}

window.addEventListener('beforeunload', (e) => {
  if (sujo) {
    e.preventDefault();
    e.returnValue = '';
  }
});

async function chamarApi(corpo) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(corpo)
  });
  if (!resp.ok) throw new Error('Falha de conexão (HTTP ' + resp.status + ')');
  return resp.json();
}

// ---------- construtores de campos ----------

function campoTexto(rotulo, valor, aoMudar, dica) {
  const wrap = el('div', 'adm-campo');
  const label = el('label', '', [rotulo]);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = valor || '';
  input.addEventListener('input', () => { aoMudar(input.value); });
  wrap.appendChild(label);
  wrap.appendChild(input);
  if (dica) wrap.appendChild(el('div', 'adm-dica', [dica]));
  return wrap;
}

function campoTextarea(rotulo, valor, aoMudar, dica) {
  const wrap = el('div', 'adm-campo');
  wrap.appendChild(el('label', '', [rotulo]));
  const area = document.createElement('textarea');
  area.value = valor || '';
  area.addEventListener('input', () => { aoMudar(area.value); });
  wrap.appendChild(area);
  wrap.appendChild(el('div', 'adm-dica', [dica || 'Dica: **palavra** deixa em negrito; Enter quebra a linha.']));
  return wrap;
}

function campoSelect(rotulo, valor, opcoes, aoMudar) {
  const wrap = el('div', 'adm-campo');
  wrap.appendChild(el('label', '', [rotulo]));
  const select = document.createElement('select');
  opcoes.forEach(([v, nome]) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = nome;
    if (v === (valor || '')) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => { aoMudar(select.value); });
  wrap.appendChild(select);
  return wrap;
}

function campoToggle(titulo, descricao, valor, aoMudar) {
  const label = el('label', 'adm-toggle' + (valor ? ' ligado' : ''));
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!valor;
  input.addEventListener('change', () => {
    label.classList.toggle('ligado', input.checked);
    aoMudar(input.checked);
  });
  label.appendChild(input);
  label.appendChild(el('div', '', [el('strong', '', [titulo]), el('span', '', [descricao])]));
  return label;
}

// ---------- login ----------

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-entrar');
  const erro = $('login-erro');
  erro.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Verificando…';
  try {
    const res = await chamarApi({ action: 'verificarSenha', senha: $('senha').value });
    if (res && res.sucesso) {
      senhaAtual = $('senha').value;
      $('tela-login').style.display = 'none';
      $('tela-painel').style.display = 'block';
      await carregar();
    } else {
      erro.textContent = (res && res.mensagem) || 'Senha incorreta.';
    }
  } catch (err) {
    erro.textContent = 'Não foi possível verificar: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

// ---------- carregar / salvar ----------

async function carregar() {
  definirStatus('Carregando configuração…');
  try {
    const resp = await fetch(API_URL + '?action=getConfig', { cache: 'no-cache' });
    const dados = resp.ok ? await resp.json() : null;
    cfg = (dados && Array.isArray(dados.boxes)) ? dados : clonar(CONFIG_PADRAO);
    // Garante os blocos mínimos mesmo em configurações antigas
    cfg.cabecalho = cfg.cabecalho || clonar(CONFIG_PADRAO.cabecalho);
    cfg.avisoInicial = cfg.avisoInicial || clonar(CONFIG_PADRAO.avisoInicial);
    cfg.alertas = cfg.alertas || [];
    cfg.roteamento = cfg.roteamento || clonar(CONFIG_PADRAO.roteamento);
    sujo = false;
    renderTudo();
    definirStatus(dados && dados.boxes
      ? 'Configuração publicada carregada. Edite à vontade e publique.'
      : 'Ainda não há configuração publicada — mostrando o conteúdo padrão do site.');
  } catch (err) {
    cfg = clonar(CONFIG_PADRAO);
    renderTudo();
    definirStatus('Não consegui carregar do servidor (' + err.message + '); mostrando o padrão.', 'erro');
  }
}

$('btn-salvar').addEventListener('click', async () => {
  const btn = $('btn-salvar');
  btn.disabled = true;
  definirStatus('Publicando…');
  try {
    const res = await chamarApi({ action: 'saveConfig', senha: senhaAtual, config: cfg });
    if (res && res.sucesso) {
      sujo = false;
      const agora = new Date();
      definirStatus('✅ Publicado às ' + agora.toLocaleTimeString('pt-BR').slice(0, 5) +
        ' — já está no ar para os pacientes.', 'ok');
    } else {
      definirStatus('❌ ' + ((res && res.mensagem) || 'Não foi possível publicar.'), 'erro');
    }
  } catch (err) {
    definirStatus('❌ Erro ao publicar: ' + err.message, 'erro');
  } finally {
    btn.disabled = false;
  }
});

$('btn-descartar').addEventListener('click', () => {
  if (!sujo || confirm('Descartar as alterações não publicadas e recarregar o que está no ar?')) {
    editoresAbertos.clear();
    carregar();
  }
});

// ---------- render geral ----------

function renderTudo() {
  renderAvisoInicial();
  renderCabecalho();
  renderRoteamento();
  renderLista('boxes', $('lista-boxes'));
  renderLista('alertas', $('lista-alertas'));
}

// ----- encaminhamento da triagem (pueripre) -----

function renderRoteamento() {
  const alvo = $('roteamento-campos');
  alvo.innerHTML = '';
  const rot = cfg.roteamento;

  const servicos = [
    ['prenatal', '🤰 Pré-natal', 'Automático: 1ª consulta vai para a enfermagem; depois alterna com base no último profissional.'],
    ['puericultura', '👶 Puericultura', 'Automático: alterna com base no último profissional.'],
    ['preventivo', '🩷 Preventivo', 'Automático: vai para a enfermagem.']
  ];

  servicos.forEach(([chave, nome, dica]) => {
    const campo = campoSelect(nome, rot[chave] || 'auto', [
      ['auto', 'Automático (triagem decide)'],
      ['enfermagem', 'Sempre ENFERMAGEM'],
      ['medico', 'Sempre MÉDICO']
    ], (v) => { rot[chave] = v; marcarSujo(); });
    campo.appendChild(el('div', 'adm-dica', [dica]));
    alvo.appendChild(campo);
  });
}

// ----- aviso inicial -----

function renderAvisoInicial() {
  const alvo = $('aviso-campos');
  alvo.innerHTML = '';
  const aviso = cfg.avisoInicial;

  alvo.appendChild(campoToggle(
    'Mostrar aviso ao abrir o site',
    'A pessoa vê o aviso antes de qualquer coisa.',
    aviso.ativo,
    (v) => { aviso.ativo = v; marcarSujo(); }
  ));

  alvo.appendChild(campoToggle(
    'Aviso permanente (BLOQUEIA o site)',
    'Sem botão de fechar: ninguém consegue agendar enquanto estiver ligado. Use para suspender os agendamentos.',
    aviso.bloqueante,
    (v) => { aviso.bloqueante = v; marcarSujo(); }
  ));

  alvo.appendChild(campoTexto('Título do aviso', aviso.titulo, (v) => { aviso.titulo = v; marcarSujo(); }));
  alvo.appendChild(campoTextarea('Texto do aviso', aviso.texto, (v) => { aviso.texto = v; marcarSujo(); }));
  alvo.appendChild(campoTexto('Texto do botão de fechar', aviso.botao, (v) => { aviso.botao = v; marcarSujo(); },
    'Só aparece quando o aviso NÃO é bloqueante.'));

  const btnVer = el('button', 'adm-btn', ['👁 Visualizar o aviso']);
  btnVer.type = 'button';
  btnVer.addEventListener('click', () => {
    mostrarAvisoInicial({
      ativo: true,
      bloqueante: false,
      titulo: aviso.titulo,
      texto: aviso.texto + (aviso.bloqueante ? '\n\n(No site, este aviso será PERMANENTE, sem botão de fechar.)' : ''),
      botao: 'Fechar visualização'
    });
  });
  alvo.appendChild(btnVer);
}

// ----- cabeçalho -----

function renderCabecalho() {
  const alvo = $('cabecalho-campos');
  alvo.innerHTML = '';
  alvo.appendChild(campoTexto('Título', cfg.cabecalho.titulo, (v) => { cfg.cabecalho.titulo = v; marcarSujo(); }));
  alvo.appendChild(campoTextarea('Descrição', cfg.cabecalho.descricao, (v) => { cfg.cabecalho.descricao = v; marcarSujo(); },
    'Texto curto abaixo do título.'));
}

// ----- listas (boxes e alertas) -----

function mover(lista, de, para) {
  if (para < 0 || para >= lista.length) return;
  const [item] = lista.splice(de, 1);
  lista.splice(para, 0, item);
  marcarSujo();
}

function renderLista(tipoLista, container) {
  container.innerHTML = '';
  const itens = cfg[tipoLista];

  itens.forEach((item, indice) => {
    container.appendChild(construirCartaoItem(tipoLista, item, indice));
  });

  if (!itens.length) {
    container.appendChild(el('p', 'adm-sub', ['(vazio — use o botão abaixo para adicionar)']));
  }
}

function nomeDoItem(tipoLista, item) {
  if (tipoLista === 'alertas' || item.tipo === 'aviso') {
    const cores = { default: '⬜', danger: '🟥', success: '🟩' };
    return (cores[item.cor] || '⬜') + ' ' + (item.titulo || '(sem título)');
  }
  const tipo = item.tipo === 'botoes' ? '🔘' : (item.acao === 'agendar' ? '📅' : '🧩');
  return tipo + ' ' + (item.titulo || '(sem título)');
}

/**
 * Move um item entre as duas áreas:
 * - aviso colorido sobe para a área dos boxes (vira box tipo 'aviso', mesmo visual)
 * - box tipo 'aviso' desce de volta para os avisos de baixo
 */
function cruzarDeArea(deLista, indice, indiceDestino) {
  if (deLista === 'alertas') {
    const [item] = cfg.alertas.splice(indice, 1);
    item.tipo = 'aviso';
    const destino = (indiceDestino === undefined) ? 0 : indiceDestino;
    cfg.boxes.splice(destino, 0, item);
  } else {
    const [item] = cfg.boxes.splice(indice, 1);
    delete item.tipo;
    const destino = (indiceDestino === undefined) ? 0 : indiceDestino;
    cfg.alertas.splice(destino, 0, item);
  }
  marcarSujo();
  renderLista('boxes', $('lista-boxes'));
  renderLista('alertas', $('lista-alertas'));
}

function construirCartaoItem(tipoLista, item, indice) {
  const lista = cfg[tipoLista];
  const card = el('div', 'adm-item' + (item.visivel === false ? ' oculto' : ''));
  card.dataset.indice = indice;

  // --- cabeçalho do cartão ---
  const head = el('div', 'adm-item-head');

  const handle = el('span', 'adm-handle', ['☰']);
  handle.title = 'Arraste para reordenar';
  handle.draggable = true;
  head.appendChild(handle);

  head.appendChild(el('span', 'adm-item-nome', [nomeDoItem(tipoLista, item)]));

  if (item.visivel === false) head.appendChild(el('span', 'adm-badge-oculto', ['OCULTO']));

  const btnSubir = el('button', 'adm-mini', ['↑']);
  btnSubir.title = 'Mover para cima';
  btnSubir.addEventListener('click', () => { mover(lista, indice, indice - 1); renderLista(tipoLista, card.parentElement); });

  const btnDescer = el('button', 'adm-mini', ['↓']);
  btnDescer.title = 'Mover para baixo';
  btnDescer.addEventListener('click', () => { mover(lista, indice, indice + 1); renderLista(tipoLista, card.parentElement); });

  // Botão ⇄ para cruzar de área (só para avisos coloridos)
  let btnCruzar = null;
  if (tipoLista === 'alertas') {
    btnCruzar = el('button', 'adm-mini', ['⬆📦']);
    btnCruzar.title = 'Subir para a área dos boxes (aí dá para pôr em qualquer posição, inclusive em primeiro)';
    btnCruzar.addEventListener('click', () => cruzarDeArea('alertas', indice));
  } else if (item.tipo === 'aviso') {
    btnCruzar = el('button', 'adm-mini', ['⬇📢']);
    btnCruzar.title = 'Devolver para a área dos avisos de baixo';
    btnCruzar.addEventListener('click', () => cruzarDeArea('boxes', indice));
  }

  const btnOlho = el('button', 'adm-mini' + (item.visivel === false ? '' : ' ativo'), [item.visivel === false ? '🚫' : '👁']);
  btnOlho.title = item.visivel === false ? 'Está oculto — clique para mostrar' : 'Está visível — clique para ocultar';
  btnOlho.addEventListener('click', () => {
    item.visivel = item.visivel === false;
    marcarSujo();
    renderLista(tipoLista, card.parentElement);
  });

  const btnEditar = el('button', 'adm-mini' + (editoresAbertos.has(item.id) ? ' ativo' : ''), ['✏️']);
  btnEditar.title = 'Editar';
  btnEditar.addEventListener('click', () => {
    if (editoresAbertos.has(item.id)) editoresAbertos.delete(item.id);
    else editoresAbertos.add(item.id);
    renderLista(tipoLista, card.parentElement);
  });

  const btnExcluir = el('button', 'adm-mini', ['🗑']);
  btnExcluir.title = 'Excluir';
  btnExcluir.addEventListener('click', () => {
    if (confirm('Excluir "' + (item.titulo || 'este item') + '"? (Para sumir temporariamente, prefira o 👁)')) {
      lista.splice(indice, 1);
      marcarSujo();
      renderLista(tipoLista, card.parentElement);
    }
  });

  [btnSubir, btnDescer, btnCruzar, btnOlho, btnEditar, btnExcluir].forEach(b => {
    if (!b) return;
    b.type = 'button';
    head.appendChild(b);
  });
  card.appendChild(head);

  // --- preview com a cara real do site ---
  const preview = el('div', 'adm-preview');
  preview.appendChild(tipoLista === 'alertas' ? construirAlerta(item) : construirBox(item));
  card.appendChild(preview);

  const atualizarPreview = () => {
    preview.innerHTML = '';
    preview.appendChild(tipoLista === 'alertas' ? construirAlerta(item) : construirBox(item));
    head.querySelector('.adm-item-nome').textContent = nomeDoItem(tipoLista, item);
  };

  // --- editor ---
  if (editoresAbertos.has(item.id)) {
    const editor = el('div', 'adm-editor');
    if (tipoLista === 'alertas' || item.tipo === 'aviso') {
      construirEditorAlerta(editor, item, atualizarPreview);
    } else if (item.tipo === 'botoes') {
      construirEditorBoxBotoes(editor, item, atualizarPreview);
    } else {
      construirEditorBoxSimples(editor, item, atualizarPreview);
    }
    card.appendChild(editor);
  }

  // --- arrastar e soltar ---
  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ tipoLista, indice }));
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('arrastando');
  });
  handle.addEventListener('dragend', () => card.classList.remove('arrastando'));

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    card.classList.add('alvo-drop');
  });
  card.addEventListener('dragleave', () => card.classList.remove('alvo-drop'));
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('alvo-drop');
    try {
      const origem = JSON.parse(e.dataTransfer.getData('text/plain'));

      // Arrastar entre as áreas: só avisos coloridos podem cruzar
      if (origem.tipoLista !== tipoLista) {
        const itemOrigem = cfg[origem.tipoLista][origem.indice];
        const podeCruzar =
          (origem.tipoLista === 'alertas' && tipoLista === 'boxes') ||
          (origem.tipoLista === 'boxes' && tipoLista === 'alertas' && itemOrigem.tipo === 'aviso');
        if (podeCruzar) cruzarDeArea(origem.tipoLista, origem.indice, indice);
        return;
      }

      if (origem.indice === indice) return;
      mover(lista, origem.indice, indice);
      renderLista(tipoLista, card.parentElement);
    } catch (ignorado) {}
  });

  return card;
}

// ----- editores por tipo -----

const mudou = (atualizarPreview) => (aplicar) => (valor) => {
  aplicar(valor);
  marcarSujo();
  atualizarPreview();
};

function construirEditorBoxSimples(editor, box, atualizarPreview) {
  const m = mudou(atualizarPreview);

  const duasCol = el('div', 'adm-linha-2col');
  duasCol.appendChild(campoTexto('Ícone (emoji)', box.icone, m(v => { box.icone = v; })));
  duasCol.appendChild(campoSelect('Cor do ícone', box.corIcone || '', [
    ['', 'Roxo (padrão)'], ['green', 'Verde'], ['blue', 'Azul']
  ], m(v => { box.corIcone = v; })));
  editor.appendChild(duasCol);

  editor.appendChild(campoTexto('Título', box.titulo, m(v => { box.titulo = v; })));
  editor.appendChild(campoTextarea('Texto', box.texto, m(v => { box.texto = v; })));

  editor.appendChild(campoToggle('Destacar em roxo', 'Realce visual do box (como o de agendar).',
    !!box.destaque, m(v => { box.destaque = v; })));

  editor.appendChild(campoSelect('Ao clicar no box…', box.acao === 'agendar' ? 'agendar' : 'link', [
    ['link', 'Abrir um link'],
    ['agendar', 'Abrir o formulário de agendamento do site']
  ], (v) => { box.acao = v; marcarSujo(); atualizarPreview(); renderCampoLink(); }));

  const areaLink = el('div', '');
  editor.appendChild(areaLink);

  function renderCampoLink() {
    areaLink.innerHTML = '';
    if (box.acao !== 'agendar') {
      areaLink.appendChild(campoTexto('Link', box.link, m(v => { box.link = v; }),
        'Aceita https://…, tel:0800… ou mailto:… (vazio = box sem clique)'));
    }
    areaLink.appendChild(campoTexto('Texto do link (rodapé do box)', box.textoLink, m(v => { box.textoLink = v; })));
  }
  renderCampoLink();
}

function construirEditorBoxBotoes(editor, box, atualizarPreview) {
  const m = mudou(atualizarPreview);

  editor.appendChild(campoSelect('Estilo dos botões', box.estilo === 'compacto' ? 'compacto' : 'destaque', [
    ['destaque', 'Grandes (como Saúde da Mulher)'],
    ['compacto', 'Compactos (como Fila de espera)']
  ], m(v => { box.estilo = v; })));

  const duasCol = el('div', 'adm-linha-2col');
  duasCol.appendChild(campoTexto('Ícone do box (emoji, opcional)', box.icone, m(v => { box.icone = v; })));
  duasCol.appendChild(campoSelect('Cor do ícone', box.corIcone || '', [
    ['', 'Roxo (padrão)'], ['green', 'Verde'], ['blue', 'Azul']
  ], m(v => { box.corIcone = v; })));
  editor.appendChild(duasCol);

  editor.appendChild(campoTexto('Título', box.titulo, m(v => { box.titulo = v; })));
  editor.appendChild(campoTextarea('Texto', box.texto, m(v => { box.texto = v; })));

  const areaBotoes = el('div', '');
  editor.appendChild(el('div', 'adm-campo', [el('label', '', ['Botões'])]));
  editor.appendChild(areaBotoes);

  function renderBotoes() {
    areaBotoes.innerHTML = '';
    (box.botoes || []).forEach((botao, i) => {
      const sub = el('div', 'adm-sub-item');
      const subHead = el('div', 'adm-sub-item-head');
      subHead.appendChild(el('span', '', ['Botão ' + (i + 1) + ': ' + (botao.titulo || '')]));

      const bSubir = el('button', 'adm-mini', ['↑']);
      bSubir.addEventListener('click', () => { mover(box.botoes, i, i - 1); atualizarPreview(); renderBotoes(); });
      const bDescer = el('button', 'adm-mini', ['↓']);
      bDescer.addEventListener('click', () => { mover(box.botoes, i, i + 1); atualizarPreview(); renderBotoes(); });
      const bTirar = el('button', 'adm-mini', ['🗑']);
      bTirar.addEventListener('click', () => {
        if (confirm('Excluir o botão "' + (botao.titulo || '') + '"?')) {
          box.botoes.splice(i, 1);
          marcarSujo(); atualizarPreview(); renderBotoes();
        }
      });
      [bSubir, bDescer, bTirar].forEach(b => { b.type = 'button'; subHead.appendChild(b); });
      sub.appendChild(subHead);

      const cols = el('div', 'adm-linha-2col');
      cols.appendChild(campoTexto('Ícone (emoji)', botao.icone, m(v => { botao.icone = v; })));
      cols.appendChild(campoTexto('Título', botao.titulo, (v) => { botao.titulo = v; marcarSujo(); atualizarPreview(); }));
      sub.appendChild(cols);

      if (box.estilo !== 'compacto') {
        sub.appendChild(campoTexto('Subtítulo', botao.subtitulo, m(v => { botao.subtitulo = v; })));
      } else {
        sub.appendChild(campoSelect('Cor do botão', botao.cor || '', [
          ['', 'Padrão'], ['municipal', 'Roxo (municipal)'], ['estadual', 'Azul (estadual)']
        ], m(v => { botao.cor = v; })));
      }
      sub.appendChild(campoTexto('Link', botao.link, m(v => { botao.link = v; }), 'https://…, tel:… ou mailto:…'));

      areaBotoes.appendChild(sub);
    });

    const bAdd = el('button', 'adm-btn', ['+ Adicionar botão']);
    bAdd.type = 'button';
    bAdd.addEventListener('click', () => {
      box.botoes = box.botoes || [];
      box.botoes.push({ icone: '🔗', titulo: 'Novo botão', subtitulo: '', link: '', cor: '' });
      marcarSujo(); atualizarPreview(); renderBotoes();
    });
    areaBotoes.appendChild(bAdd);
  }
  renderBotoes();
}

function construirEditorAlerta(editor, alerta, atualizarPreview) {
  const m = mudou(atualizarPreview);

  editor.appendChild(campoSelect('Cor do aviso', alerta.cor || 'default', [
    ['default', 'Cinza (informação)'],
    ['danger', 'Vermelho (urgência)'],
    ['success', 'Verde (positivo)']
  ], m(v => { alerta.cor = v; })));

  editor.appendChild(campoTexto('Título', alerta.titulo, m(v => { alerta.titulo = v; })));
  editor.appendChild(campoTextarea('Texto', alerta.texto, m(v => { alerta.texto = v; })));
  editor.appendChild(campoTexto('Link (opcional)', alerta.link, m(v => { alerta.link = v; }),
    'Se preencher, o aviso inteiro vira clicável.'));
  editor.appendChild(campoTexto('Texto do link', alerta.textoLink, m(v => { alerta.textoLink = v; })));
}

// ----- adicionar itens -----

$('btn-add-simples').addEventListener('click', () => {
  const novo = {
    id: novoId('box'), tipo: 'simples', visivel: true, icone: '🆕', corIcone: '',
    titulo: 'Novo box', texto: 'Descreva aqui…', acao: 'link', link: '', textoLink: 'Saiba mais'
  };
  cfg.boxes.push(novo);
  editoresAbertos.add(novo.id);
  marcarSujo();
  renderLista('boxes', $('lista-boxes'));
});

$('btn-add-botoes').addEventListener('click', () => {
  const novo = {
    id: novoId('box'), tipo: 'botoes', estilo: 'destaque', visivel: true, icone: '', corIcone: '',
    titulo: 'Novo box com botões', texto: '',
    botoes: [{ icone: '🔗', titulo: 'Botão 1', subtitulo: '', link: '', cor: '' }]
  };
  cfg.boxes.push(novo);
  editoresAbertos.add(novo.id);
  marcarSujo();
  renderLista('boxes', $('lista-boxes'));
});

$('btn-add-alerta').addEventListener('click', () => {
  const novo = {
    id: novoId('alerta'), visivel: true, cor: 'default',
    titulo: '📢 Novo aviso', texto: 'Texto do aviso…', link: '', textoLink: ''
  };
  cfg.alertas.push(novo);
  editoresAbertos.add(novo.id);
  marcarSujo();
  renderLista('alertas', $('lista-alertas'));
});
