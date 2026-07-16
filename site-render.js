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
  if (!aviso || !aviso.ativo) return;

  const overlay = el('div', '');
  overlay.id = 'modal-aviso-admin';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;' +
    'justify-content:center;padding:20px;background:linear-gradient(135deg, rgba(88,73,160,.96) 0%, rgba(60,45,120,.98) 100%);';

  const caixa = el('div', '');
  caixa.style.cssText = 'background:#fff;border-radius:16px;max-width:440px;width:100%;' +
    'padding:28px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35);';

  const titulo = el('div', '', [aviso.titulo || '⚠️ Aviso']);
  titulo.style.cssText = 'font-size:1.3em;font-weight:700;margin-bottom:12px;color:#1e293b;';
  caixa.appendChild(titulo);

  const texto = el('div', '', [textoFormatado(aviso.texto || '')]);
  texto.style.cssText = 'color:#475569;line-height:1.6;margin-bottom:8px;text-align:left;';
  caixa.appendChild(texto);

  if (aviso.bloqueante) {
    document.body.style.overflow = 'hidden';
    const pageWrapper = document.querySelector('.page-wrapper');
    if (pageWrapper) pageWrapper.style.display = 'none';
  } else {
    const botao = el('button', '', [aviso.botao || 'Entendi']);
    botao.style.cssText = 'margin-top:16px;padding:12px 32px;border:none;border-radius:10px;' +
      'background:#5849a0;color:#fff;font-size:1em;font-weight:600;cursor:pointer;';
    botao.addEventListener('click', () => {
      overlay.remove();
      document.body.style.overflow = '';
    });
    caixa.appendChild(botao);
    document.body.style.overflow = 'hidden';
  }

  overlay.appendChild(caixa);
  document.body.appendChild(overlay);
}
