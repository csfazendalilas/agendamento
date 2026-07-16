// ============================================
// RENDERIZADOR COMPARTILHADO DA TELA INICIAL
// Usado pelo site (main.js) e pelo painel de administração (admin.js).
// Monta os boxes/avisos a partir da configuração salva na aba "Config".
// Todo texto vem de configuração editável — por isso é SEMPRE inserido com
// textContent (nunca innerHTML), e links passam por linkSeguro().
// ============================================

// Configuração padrão = conteúdo atual do site.
// Usada quando ainda não existe nada salvo na planilha.
const CONFIG_PADRAO = {
  versao: 1,
  cabecalho: {
    titulo: 'Como podemos ajudar?',
    descricao: 'Atendendo temporariamente no Centro de Saúde Alto Ribeirão. Escolha uma das opções abaixo.'
  },
  avisoInicial: {
    ativo: false,
    bloqueante: false,
    titulo: '⚠️ Aviso importante',
    texto: '',
    botao: 'Entendi'
  },
  // Encaminhamento da triagem do pueripre:
  // 'auto' = a triagem decide (comportamento padrão)
  // 'enfermagem' / 'medico' = ignora as respostas e manda sempre para lá
  roteamento: {
    prenatal: 'auto',
    puericultura: 'auto',
    preventivo: 'auto'
  },
  boxes: [
    {
      id: 'saude-mulher', tipo: 'botoes', estilo: 'destaque', visivel: true,
      titulo: 'Saúde da Mulher e da Criança',
      texto: 'Acompanhamento de gestantes, crianças e exames preventivos.',
      botoes: [
        { icone: '🤰', titulo: 'Pré-natal', subtitulo: 'Acompanhamento de gestantes', link: 'https://csfazendalilas.github.io/pueripre/' },
        { icone: '👶', titulo: 'Puericultura', subtitulo: 'Rotina de crianças até 2 anos', link: 'https://csfazendalilas.github.io/pueripre/' },
        { icone: '🩷', titulo: 'Preventivo', subtitulo: 'Exame preventivo do colo do útero', link: 'https://csfazendalilas.github.io/pueripre/' },
        { icone: 'T', titulo: 'DIU', subtitulo: 'Inserção ou troca do dispositivo', link: 'https://forms.gle/9Kkq8irMLtpYLUUM9' }
      ]
    },
    {
      id: 'receitas', tipo: 'simples', visivel: true, icone: '💊', corIcone: '',
      titulo: 'Renovação de medicamentos',
      texto: 'Solicite a renovação das suas receitas de uso contínuo.',
      acao: 'link', link: 'https://forms.gle/hSNekJWonoEqcntFA', textoLink: 'Acessar formulário'
    },
    {
      id: 'agendar', tipo: 'simples', visivel: true, icone: '📅', corIcone: '', destaque: true,
      titulo: 'Outras consultas',
      texto: 'Agende consultas que não sejam de agendamento específico ou urgentes através do nosso formulário online.',
      acao: 'agendar', link: '', textoLink: 'Agendar consulta'
    },
    {
      id: 'alo-saude', tipo: 'simples', visivel: true, icone: '📞', corIcone: 'green',
      titulo: 'Alô Saúde Floripa',
      texto: 'Orientação médica 24h por telefone, vídeo ou chat. Gratuito e ilimitado. **Ligue antes de ir ao posto ou UPA!**',
      acao: 'link', link: 'tel:08003333233', textoLink: '📱 0800 333 3233'
    },
    {
      id: 'fila', tipo: 'botoes', estilo: 'compacto', visivel: true, icone: '📋', corIcone: 'blue',
      titulo: 'Fila de espera',
      texto: 'Acompanhe sua posição na fila de espera de requisições, encaminhamentos e exames.',
      botoes: [
        { icone: '🏛️', titulo: 'Fila Municipal', link: 'https://florianopolis.celk.com.br/lista-publica', cor: 'municipal' },
        { icone: '🏢', titulo: 'Fila Estadual', link: 'https://listadeespera.saude.sc.gov.br/', cor: 'estadual' }
      ]
    }
  ],
  alertas: [
    {
      id: 'fichas', visivel: true, cor: 'default',
      titulo: '📍 Ou procure o Centro de Saúde Alto Ribeirão',
      texto: 'às 07h, quando são entregues as fichas para atendimento do dia.',
      link: '', textoLink: ''
    },
    {
      id: 'urgencias', visivel: true, cor: 'danger',
      titulo: '🚨 Urgências e Emergências',
      texto: 'Ligue SAMU 192 ou procure a UPA Sul, HU ou Hospital Celso Ramos.',
      link: '', textoLink: ''
    },
    {
      id: 'odonto', visivel: true, cor: 'success',
      titulo: '🦷 Atendimento odontológico',
      texto: '**Presencial:** Centro de Saúde do Campeche a partir das 7h (Dra. Júlia).\nAtendimentos por ordem de chegada (3 a 4 fichas diárias).\n\n**Agendamento via WhatsApp:** Crianças até 10 anos, gestantes e idosos (+60)',
      link: 'https://wa.me/554892187877', textoLink: '📱 48 9218-7877 →'
    }
  ]
};

// ---------- utilidades seguras ----------

/** Só aceita links http(s), tel: ou mailto: — qualquer outra coisa vira '#'. */
function linkSeguro(url) {
  const texto = (url || '').toString().trim();
  if (/^https?:\/\//i.test(texto) || /^tel:/i.test(texto) || /^mailto:/i.test(texto)) {
    return texto;
  }
  return '#';
}

/** Cria elemento com classe e filhos (texto sempre via textContent). */
function el(tag, className, filhos) {
  const nodo = document.createElement(tag);
  if (className) nodo.className = className;
  (filhos || []).forEach(f => {
    if (f === null || f === undefined) return;
    nodo.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
  });
  return nodo;
}

/**
 * Converte texto simples em nós seguros:
 * - **trecho** vira negrito
 * - quebras de linha viram <br> (linha em branco = espaço maior)
 */
function textoFormatado(texto) {
  const frag = document.createDocumentFragment();
  const linhas = (texto || '').toString().split('\n');
  linhas.forEach((linha, li) => {
    if (li > 0) frag.appendChild(document.createElement('br'));
    const partes = linha.split('**');
    partes.forEach((parte, pi) => {
      if (!parte) return;
      if (pi % 2 === 1) {
        frag.appendChild(el('strong', '', [parte]));
      } else {
        frag.appendChild(document.createTextNode(parte));
      }
    });
  });
  return frag;
}

// ---------- boxes ----------

function construirIconeTitulo(box) {
  const filhos = [];
  if (box.icone) {
    const cor = box.corIcone === 'green' ? ' icon-green' : box.corIcone === 'blue' ? ' icon-blue' : '';
    filhos.push(el('span', 'icon' + cor, [box.icone]));
    filhos.push(' ');
  }
  filhos.push(box.titulo || '');
  return el('h3', '', filhos);
}

function construirBoxSimples(box) {
  const clicavel = box.acao === 'agendar' || (box.link || '').trim() !== '';
  let card;

  if (box.acao === 'agendar') {
    card = el('div', 'intro-card-item intro-card-clickable' + (box.destaque ? ' highlight' : ''));
    card.setAttribute('data-action', 'agendar');
  } else if (clicavel) {
    card = el('a', 'intro-card-item intro-card-clickable' + (box.destaque ? ' highlight' : ''));
    card.href = linkSeguro(box.link);
    if (/^https?:/i.test(card.getAttribute('href'))) {
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
    }
  } else {
    card = el('div', 'intro-card-item' + (box.destaque ? ' highlight' : ''));
  }

  card.appendChild(construirIconeTitulo(box));
  if (box.texto) card.appendChild(el('p', '', [textoFormatado(box.texto)]));
  if (box.textoLink && clicavel) card.appendChild(el('span', 'intro-link', [box.textoLink]));
  return card;
}

function construirBoxBotoes(box) {
  const destaque = box.estilo !== 'compacto';
  const card = el('div', destaque ? 'intro-card-item intro-card-featured' : 'intro-card-item');

  card.appendChild(construirIconeTitulo(box));
  if (box.texto) card.appendChild(el('p', '', [textoFormatado(box.texto)]));

  const lista = el('div', destaque ? 'featured-buttons' : 'fila-buttons');
  (box.botoes || []).forEach(botao => {
    const a = el('a', destaque ? 'featured-btn' : 'fila-btn' + (botao.cor ? ' fila-btn-' + botao.cor : ''));
    a.href = linkSeguro(botao.link);
    if (/^https?:/i.test(a.getAttribute('href'))) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    if (destaque) {
      a.appendChild(el('span', 'featured-btn-icon', [botao.icone || '']));
      a.appendChild(el('div', 'featured-btn-content', [
        el('strong', '', [botao.titulo || '']),
        botao.subtitulo ? el('span', '', [botao.subtitulo]) : null
      ]));
      a.appendChild(el('span', 'featured-btn-arrow', ['→']));
    } else {
      a.appendChild(el('span', 'fila-btn-icon', [botao.icone || '']));
      a.appendChild(el('span', 'fila-btn-text', [botao.titulo || '']));
      a.appendChild(el('span', 'fila-btn-arrow', ['→']));
    }
    lista.appendChild(a);
  });
  card.appendChild(lista);
  return card;
}

/** Monta o elemento de UM box (usado no site e nos previews do painel). */
function construirBox(box) {
  if (box.tipo === 'aviso') return construirAlerta(box); // aviso colorido posicionado entre os boxes
  return box.tipo === 'botoes' ? construirBoxBotoes(box) : construirBoxSimples(box);
}

// ---------- alertas ----------

function construirAlerta(alerta) {
  const cores = { default: 'alert-default', danger: 'alert-danger', success: 'alert-success' };
  const classeCor = cores[alerta.cor] || 'alert-default';
  const temLink = (alerta.link || '').trim() !== '';

  let nodo;
  if (temLink) {
    nodo = el('a', 'alert ' + classeCor + ' alert-clickable');
    nodo.href = linkSeguro(alerta.link);
    if (/^https?:/i.test(nodo.getAttribute('href'))) {
      nodo.target = '_blank';
      nodo.rel = 'noopener noreferrer';
    }
  } else {
    nodo = el('div', 'alert ' + classeCor);
  }

  if (alerta.titulo) {
    nodo.appendChild(el('strong', '', [alerta.titulo]));
    nodo.appendChild(document.createTextNode(' '));
  }
  if (alerta.texto) nodo.appendChild(el('p', '', [textoFormatado(alerta.texto)]));
  if (alerta.textoLink && temLink) {
    nodo.appendChild(el('p', '', [el('span', 'alert-link', [alerta.textoLink])]));
  }
  return nodo;
}

// ---------- aplicação no site ----------

/** Reconstrói a tela inicial inteira a partir da configuração. */
function aplicarConfigNaPagina(cfg) {
  if (!cfg) return;

  const h1 = document.querySelector('#intro-card .card-header h1');
  const descricao = document.querySelector('#intro-card .card-header .description');
  if (cfg.cabecalho) {
    if (h1 && cfg.cabecalho.titulo) h1.textContent = cfg.cabecalho.titulo;
    if (descricao && cfg.cabecalho.descricao) descricao.textContent = cfg.cabecalho.descricao;
  }

  const grid = document.querySelector('#intro-card .intro-grid');
  if (grid && Array.isArray(cfg.boxes)) {
    grid.innerHTML = '';
    cfg.boxes.filter(b => b.visivel !== false).forEach(box => grid.appendChild(construirBox(box)));
  }

  const alertas = document.querySelector('#intro-card .intro-alerts');
  if (alertas && Array.isArray(cfg.alertas)) {
    alertas.innerHTML = '';
    cfg.alertas.filter(a => a.visivel !== false).forEach(a => alertas.appendChild(construirAlerta(a)));
  }

  mostrarAvisoInicial(cfg.avisoInicial);
}

/**
 * Aviso inicial (modal antes da página).
 * - ativo: mostra o aviso ao abrir o site
 * - bloqueante: sem botão de fechar e esconde a página (suspende agendamentos)
 */
function mostrarAvisoInicial(aviso) {
  const existente = document.getElementById('modal-aviso-admin');
  if (existente) existente.remove();

  const pageWrapper = document.querySelector('.page-wrapper');

  if (!aviso || !aviso.ativo) {
    // Aviso desligado: garante que nada ficou travado (ex.: o cache mostrou
    // um aviso bloqueante que acabou de ser desativado no servidor)
    document.body.style.overflow = '';
    if (pageWrapper && pageWrapper.style.display === 'none') pageWrapper.style.display = '';
    return;
  }

  // A configuração é aplicada duas vezes (cache instantâneo e depois a versão
  // do servidor). Se a pessoa já fechou o aviso nesta visita, não reabre.
  if (!aviso.bloqueante && window.__avisoInicialFechado) return;

  // Aviso não-bloqueante substituindo um bloqueante do cache: devolve a página
  if (!aviso.bloqueante && pageWrapper && pageWrapper.style.display === 'none') {
    pageWrapper.style.display = '';
  }

  garantirEstiloAviso();

  const overlay = el('div', 'aviso-ini-overlay' + (aviso.bloqueante ? ' aviso-ini-bloqueante' : ''));
  overlay.id = 'modal-aviso-admin';

  const caixa = el('div', 'aviso-ini-card');
  caixa.setAttribute('role', 'alertdialog');
  caixa.setAttribute('aria-live', 'assertive');

  // Detalhes decorativos (brilho no topo + bolha suave atrás do ícone)
  caixa.appendChild(el('div', 'aviso-ini-brilho'));
  caixa.appendChild(el('div', 'aviso-ini-blob'));

  // Se o título começa com emoji, ele vira o ícone em destaque
  const { emoji, resto } = separarEmojiDoTitulo(aviso.titulo);
  caixa.appendChild(el('div', 'aviso-ini-icone', [emoji]));
  caixa.appendChild(el('div', 'aviso-ini-pill', ['Aviso · Equipe Lilás']));
  caixa.appendChild(el('h2', 'aviso-ini-titulo', [resto]));

  const texto = el('div', 'aviso-ini-texto', [textoFormatado(aviso.texto || '')]);
  caixa.appendChild(texto);

  if (aviso.bloqueante) {
    document.body.style.overflow = 'hidden';
    if (pageWrapper) pageWrapper.style.display = 'none';
  } else {
    const botao = el('button', 'aviso-ini-botao', [aviso.botao || 'Entendi']);
    botao.type = 'button';
    botao.addEventListener('click', () => {
      window.__avisoInicialFechado = true; // lembra o fechamento nesta visita
      overlay.classList.add('aviso-ini-saindo');
      setTimeout(() => overlay.remove(), 180);
      document.body.style.overflow = '';
    });
    caixa.appendChild(botao);
    document.body.style.overflow = 'hidden';
  }

  overlay.appendChild(caixa);
  document.body.appendChild(overlay);
}

/**
 * Extrai o emoji inicial do título para usá-lo como ícone em destaque.
 * (RegExp construída em tempo de execução para não quebrar navegadores
 * antigos que não entendem \p{...} — nesses, cai no padrão 📣.)
 */
function separarEmojiDoTitulo(titulo) {
  const textoTitulo = (titulo || '').toString().trim();
  try {
    const re = new RegExp('^([\\p{Extended_Pictographic}\\u200d\\ufe0f]+)\\s*', 'u');
    const m = textoTitulo.match(re);
    if (m) {
      return { emoji: m[1], resto: textoTitulo.slice(m[0].length) || 'Aviso' };
    }
  } catch (ignorado) {}
  return { emoji: '📣', resto: textoTitulo || 'Aviso' };
}

/** Injeta (uma vez) o estilo do aviso inicial. */
function garantirEstiloAviso() {
  if (document.getElementById('estilo-aviso-inicial')) return;
  const estilo = document.createElement('style');
  estilo.id = 'estilo-aviso-inicial';
  estilo.textContent = `
    .aviso-ini-overlay {
      position: fixed; inset: 0; z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      background: rgba(49, 38, 92, 0.42);
      -webkit-backdrop-filter: blur(12px) saturate(1.15);
      backdrop-filter: blur(12px) saturate(1.15);
      animation: avisoIniFade .25s ease-out;
    }
    /* Navegadores sem desfoque: fundo mais fechado para manter a leitura */
    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .aviso-ini-overlay { background: rgba(49, 38, 92, 0.82); }
    }
    .aviso-ini-bloqueante {
      background: linear-gradient(150deg, rgba(88, 73, 160, .55) 0%, rgba(49, 38, 92, .62) 100%);
    }
    .aviso-ini-card {
      position: relative; overflow: hidden;
      max-width: 420px; width: 100%;
      padding: 30px 26px 26px;
      text-align: center;
      background: rgba(255, 255, 255, 0.94);
      -webkit-backdrop-filter: blur(20px);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.75);
      border-radius: 24px;
      box-shadow: 0 24px 70px rgba(49, 38, 92, 0.45), 0 2px 10px rgba(49, 38, 92, 0.18);
      animation: avisoIniPop .38s cubic-bezier(.2, 1.1, .3, 1);
    }
    .aviso-ini-brilho {
      position: absolute; top: 0; left: 24px; right: 24px; height: 3px;
      border-radius: 0 0 6px 6px;
      background: linear-gradient(90deg, transparent, #9381ff 30%, #f9a8d4 70%, transparent);
    }
    .aviso-ini-blob {
      position: absolute; top: -70px; left: 50%; transform: translateX(-50%);
      width: 220px; height: 190px; border-radius: 50%;
      background: radial-gradient(circle, rgba(147, 129, 255, .18) 0%, transparent 70%);
      pointer-events: none;
    }
    .aviso-ini-icone {
      position: relative;
      width: 64px; height: 64px; margin: 0 auto 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 30px; line-height: 1;
      background: linear-gradient(135deg, #f6f5fc 0%, #e8e5f8 100%);
      border: 1px solid rgba(147, 129, 255, .35);
      border-radius: 20px;
      box-shadow: 0 8px 22px rgba(147, 129, 255, .28);
    }
    .aviso-ini-pill {
      display: inline-block; margin-bottom: 10px;
      padding: 4px 12px;
      font-size: .68em; font-weight: 700; letter-spacing: .8px; text-transform: uppercase;
      color: #7b6cce; background: rgba(147, 129, 255, .12);
      border: 1px solid rgba(147, 129, 255, .25);
      border-radius: 999px;
    }
    .aviso-ini-titulo {
      margin: 0 0 12px; font-size: 1.35em; font-weight: 700; color: #1e293b;
      line-height: 1.3;
    }
    .aviso-ini-texto {
      color: #475569; line-height: 1.65; text-align: left;
      font-size: .97em;
    }
    .aviso-ini-texto strong { color: #37306b; }
    .aviso-ini-botao {
      margin-top: 20px; width: 100%;
      padding: 14px 32px;
      border: none; border-radius: 14px; cursor: pointer;
      font-family: inherit; font-size: 1em; font-weight: 700; color: #fff;
      background: linear-gradient(135deg, #9381ff 0%, #7b6cce 100%);
      box-shadow: 0 10px 24px rgba(147, 129, 255, .45);
      transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
    }
    .aviso-ini-botao:hover { filter: brightness(1.06); transform: translateY(-1px); box-shadow: 0 14px 28px rgba(147, 129, 255, .5); }
    .aviso-ini-botao:active { transform: scale(.98); }
    .aviso-ini-saindo { animation: avisoIniFadeOut .18s ease-in forwards; }
    @keyframes avisoIniFade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes avisoIniFadeOut { to { opacity: 0; } }
    @keyframes avisoIniPop {
      from { opacity: 0; transform: translateY(18px) scale(.94); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .aviso-ini-overlay, .aviso-ini-card, .aviso-ini-saindo { animation: none; }
      .aviso-ini-botao { transition: none; }
    }
  `;
  document.head.appendChild(estilo);
}
