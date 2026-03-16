// ============================================
// CONFIGURAÇÕES
// ============================================
const API_URL = 'https://script.google.com/macros/s/AKfycbzSnLgusejiDF9oCtL-xjY54TybLn91HyX3NTofToGRs9rqREqg136D2czCsSLhNrti/exec';
const WHATSAPP_DESTINO = '5548920039171';

// Estado global
let slotsGlobais = [];
let currentStep = 1;
let horariosCarregados = false; // Flag para saber se já carregou

// ============================================
// MODAL DE BLOQUEIO CARNAVAL
// ============================================
function verificarModalCarnaval() {
  const hoje = new Date();
  
  const dataLimite = new Date(2026, 1, 18, 14, 0, 0, 0); // 18 de fevereiro de 2026 às 14h (mês é 0-indexed)

  console.log('🎭 Verificando modal carnaval:', {
    hoje: hoje.toLocaleString('pt-BR'),
    dataLimite: dataLimite.toLocaleString('pt-BR'),
    deveMostrar: hoje < dataLimite
  });

  // Mostra o modal se ainda não passou da data limite (antes das 14h do dia 18/02/2026)
  if (hoje < dataLimite) {
    const modal = document.getElementById('modal-carnaval');
    const pageWrapper = document.querySelector('.page-wrapper');
    
    if (modal) {
      modal.style.display = 'flex';
      // Garantir que o overlay está visível
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.right = '0';
      modal.style.bottom = '0';
      modal.style.zIndex = '10000';
      modal.style.background = 'linear-gradient(135deg, rgba(139, 69, 139, 0.95) 0%, rgba(75, 0, 130, 0.98) 100%)';
      // Bloquear scroll do body
      document.body.style.overflow = 'hidden';
      // Esconder conteúdo da página
      if (pageWrapper) {
        pageWrapper.style.display = 'none';
      }
      console.log('✅ Modal carnaval exibido');
    } else {
      console.error('❌ Modal carnaval não encontrado no DOM');
    }
  } else {
    // Se passou da data, garantir que o modal está escondido
    const modal = document.getElementById('modal-carnaval');
    const pageWrapper = document.querySelector('.page-wrapper');
    
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      // Mostrar conteúdo da página
      if (pageWrapper) {
        pageWrapper.style.display = '';
      }
      console.log('✅ Modal carnaval escondido (data passou)');
    }
  }
}

// ============================================
// MODAL DE RECESSO (AVISO FIM DE ANO)
// ============================================
function verificarModalRecesso() {
  const hoje = new Date();
  const inicioRecesso = new Date(2025, 11, 19); // 19 de dezembro de 2025 (mês é 0-indexed)
  const fimRecesso = new Date(2026, 0, 2);      // 02 de janeiro de 2026

  // Mostra o modal se estiver dentro do período
  if (hoje >= inicioRecesso && hoje < fimRecesso) {
    const modal = document.getElementById('modal-recesso');
    if (modal) {
      modal.style.display = 'flex';
    }
  }
}

function fecharModalRecesso() {
  const modal = document.getElementById('modal-recesso');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Fecha o modal ao clicar em qualquer lugar
document.addEventListener('click', function(e) {
  const modal = document.getElementById('modal-recesso');
  if (modal && modal.style.display !== 'none' && modal.contains(e.target)) {
    fecharModalRecesso();
  }
});

// ============================================
// VALIDAÇÃO INICIAL
// ============================================
(function () {
  console.log('🔧 API_URL configurada:', API_URL);
  if (!API_URL || API_URL.includes('SEU_ID_AQUI') || !API_URL.includes('script.google.com')) {
    console.error('❌ ERRO: API_URL não configurada corretamente!', API_URL);
    alert('ERRO: URL do Google Apps Script não configurada. Verifique o código.');
  }
})();

// ============================================
// PROGRESS STEPS
// ============================================
function updateProgressSteps(step) {
  currentStep = step;
  const steps = document.querySelectorAll('.step');
  const lines = document.querySelectorAll('.step-line');

  steps.forEach((stepEl, index) => {
    const stepNum = index + 1;
    stepEl.classList.remove('active', 'completed');
    
    if (stepNum < step) {
      stepEl.classList.add('completed');
    } else if (stepNum === step) {
      stepEl.classList.add('active');
    }
  });

  lines.forEach((line, index) => {
    line.classList.remove('completed');
    if (index < step - 1) {
      line.classList.add('completed');
    }
  });
}

// ============================================
// NAVEGAÇÃO ENTRE TELAS
// ============================================
function mostrarFormulario(scrollIntoView = false) {
  const introCard = document.getElementById('intro-card');
  const agendamentoCard = document.getElementById('agendamento-card');

  if (introCard) {
    introCard.classList.add('hidden');
  }

  if (agendamentoCard) {
    agendamentoCard.classList.remove('hidden');

    if (scrollIntoView) {
      setTimeout(() => {
        agendamentoCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }

  // Carregar horários ao mostrar o formulário
  carregarHorarios();
}

function voltarParaIntro() {
  const introCard = document.getElementById('intro-card');
  const agendamentoCard = document.getElementById('agendamento-card');

  if (agendamentoCard) {
    agendamentoCard.classList.add('hidden');
  }

  if (introCard) {
    introCard.classList.remove('hidden');
  }
}

// ============================================
// CARREGAMENTO DE HORÁRIOS (EM BACKGROUND)
// ============================================

/**
 * Converte data no formato DD/MM/YYYY para objeto Date
 */
function parseDataBR(dataStr) {
  const partes = dataStr.split('/');
  if (partes.length !== 3) return new Date(0);
  const dia = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10) - 1; // Mês começa em 0
  const ano = parseInt(partes[2], 10);
  return new Date(ano, mes, dia);
}

/**
 * Converte hora no formato HH:MM para minutos (para ordenação)
 */
function parseHora(horaStr) {
  const partes = horaStr.split(':');
  if (partes.length !== 2) return 0;
  return parseInt(partes[0], 10) * 60 + parseInt(partes[1], 10);
}

/**
 * Ordena os slots por data e hora crescente
 */
function ordenarSlots(slots) {
  return slots.sort((a, b) => {
    const dataA = parseDataBR(a.data);
    const dataB = parseDataBR(b.data);
    
    // Primeiro compara por data
    if (dataA.getTime() !== dataB.getTime()) {
      return dataA.getTime() - dataB.getTime();
    }
    
    // Se mesma data, compara por hora
    return parseHora(a.hora) - parseHora(b.hora);
  });
}

/**
 * Carrega os horários em background (chamado quando o site abre)
 */
async function preCarregarHorarios() {
  if (horariosCarregados) return; // Já carregou, não precisa carregar de novo
  
  try {
    if (!API_URL || API_URL.includes('SEU_ID_AQUI')) {
      console.error('❌ API_URL não configurada');
      return;
    }

    const url = API_URL + '?action=getSlots';
    console.log('🔄 Pré-carregando horários em background...');

    const resp = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });

    if (!resp.ok) {
      throw new Error('Erro ao carregar horários (HTTP ' + resp.status + ')');
    }

    const slots = await resp.json();
    slotsGlobais = ordenarSlots(slots || []);
    horariosCarregados = true;
    console.log('✅ Horários pré-carregados:', slotsGlobais.length, 'disponíveis');
  } catch (err) {
    console.error('❌ Erro no pré-carregamento:', err);
  }
}

/**
 * Exibe os horários na tela (usa dados já carregados se disponíveis)
 */
async function carregarHorarios() {
  const loading = document.getElementById('loading');
  const formContainer = document.getElementById('form-container');
  const select = document.getElementById('slotSelect');

  loading.style.display = 'block';
  formContainer.style.display = 'none';

  try {
    // Se ainda não carregou, carrega agora
    if (!horariosCarregados) {
      if (!API_URL || API_URL.includes('SEU_ID_AQUI')) {
        throw new Error('URL do Google Apps Script não configurada. Verifique a constante API_URL no código.');
      }

      const url = API_URL + '?action=getSlots';
      console.log('🔍 Fazendo requisição para:', url);

      const resp = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache'
      });

      console.log('📡 Status da resposta:', resp.status, resp.statusText);

      if (!resp.ok) {
        if (resp.status === 404) {
          throw new Error('Script não encontrado. Verifique se o Google Apps Script está publicado corretamente.');
        }
        throw new Error('Erro ao carregar horários (HTTP ' + resp.status + ')');
      }

      const slots = await resp.json();
      console.log('Slots recebidos do servidor:', slots);
      slotsGlobais = ordenarSlots(slots || []);
      horariosCarregados = true;
    } else {
      console.log('✅ Usando horários já carregados');
    }

    if (!slotsGlobais.length) {
      loading.innerHTML = `
        <div class="loading-card">
          <div class="loading-icon" style="background: #fef3c7; color: #d97706;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p class="loading-text" style="color: #92400e;">Não há consultas disponíveis no momento, orientamos procurar o Centro de Saúde Alto Ribeirão às 7h, quando são distribuídas as fichas para atendimento no mesmo dia.</p>
        </div>
      `;
      return;
    }

    select.innerHTML = '<option value="">Escolha um horário</option>';
    slotsGlobais.forEach((slot, index) => {
      const option = document.createElement('option');
      option.value = index;

      const diaSemanaLabel = slot.diaSemana
        ? slot.diaSemana.replace('-feira', '')
        : '';

      const dataComDia = diaSemanaLabel
        ? diaSemanaLabel + ', ' + slot.data
        : slot.data;

      // Define o tipo de profissional baseado na origem (F=médico, O=enfermeira, vazio=médico)
      const origem = (slot.origem || 'F').toUpperCase();
      const tipoProfissional = origem === 'O' ? '(enfermeira)' : '(médico)';

      option.text = dataComDia + ' às ' + slot.hora + ' ' + tipoProfissional;
      select.appendChild(option);
    });

    loading.style.display = 'none';
    formContainer.style.display = 'block';
  } catch (err) {
    console.error(err);
    loading.innerHTML = `
      <div class="loading-card">
        <div class="loading-icon" style="background: #fee2e2; color: #dc2626;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <p class="loading-text" style="color: #991b1b; margin-bottom: 16px;">
          ${err.message || 'Não foi possível carregar os horários'}
        </p>
        <button type="button" class="btn btn-primary" onclick="carregarHorarios()" style="max-width: 200px;">
          Tentar novamente
        </button>
      </div>
    `;
  }
}

// ============================================
// VALIDAÇÕES
// ============================================
function validarTelefone(telefone) {
  const apenasNumeros = telefone.replace(/\D/g, '');
  return apenasNumeros.length >= 10 && apenasNumeros.length <= 11;
}

function validarDataNascimento(data) {
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  if (!regex.test(data)) {
    return { valido: false, mensagem: 'Use o formato DD/MM/AAAA' };
  }

  const partes = data.split('/');
  const dia = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10);
  const ano = parseInt(partes[2], 10);

  if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 1900 || ano > new Date().getFullYear()) {
    return { valido: false, mensagem: 'Data inválida. Verifique dia, mês e ano.' };
  }

  return { valido: true };
}

// ============================================
// GERENCIAMENTO DE ERROS
// ============================================
function mostrarErroCampo(campoId, mensagem) {
  const campo = document.getElementById(campoId);
  const errorSpan = document.getElementById(campoId + '-error');

  if (campo) {
    campo.setAttribute('aria-invalid', 'true');
    campo.classList.add('error');
  }

  if (errorSpan) {
    errorSpan.textContent = mensagem;
  }
}

function limparErroCampo(campoId) {
  const campo = document.getElementById(campoId);
  const errorSpan = document.getElementById(campoId + '-error');

  if (campo) {
    campo.removeAttribute('aria-invalid');
    campo.classList.remove('error');
  }

  if (errorSpan) {
    errorSpan.textContent = '';
  }
}

function limparTodosErros() {
  ['slotSelect', 'nome', 'dataNascimento', 'telefone', 'observacoes'].forEach(limparErroCampo);
}

// ============================================
// VALIDAÇÃO DO FORMULÁRIO
// ============================================
function validarFormulario() {
  limparTodosErros();

  const select = document.getElementById('slotSelect');
  const nome = document.getElementById('nome').value.trim();
  const telefone = document.getElementById('telefone').value.trim();
  const dataNascimento = document.getElementById('dataNascimento').value.trim();
  const observacoes = document.getElementById('observacoes').value.trim();

  let valido = true;
  let primeiroCampoComErro = null;

  if (!select.value) {
    mostrarErroCampo('slotSelect', 'Selecione um horário');
    valido = false;
    if (!primeiroCampoComErro) primeiroCampoComErro = select;
  }

  if (!nome || nome.length < 3) {
    mostrarErroCampo('nome', 'Informe seu nome completo');
    valido = false;
    if (!primeiroCampoComErro) primeiroCampoComErro = document.getElementById('nome');
  }

  if (!dataNascimento) {
    mostrarErroCampo('dataNascimento', 'Informe sua data de nascimento');
    valido = false;
    if (!primeiroCampoComErro) primeiroCampoComErro = document.getElementById('dataNascimento');
  } else {
    const validacaoData = validarDataNascimento(dataNascimento);
    if (!validacaoData.valido) {
      mostrarErroCampo('dataNascimento', validacaoData.mensagem);
      valido = false;
      if (!primeiroCampoComErro) primeiroCampoComErro = document.getElementById('dataNascimento');
    }
  }

  if (!telefone) {
    mostrarErroCampo('telefone', 'Informe seu telefone');
    valido = false;
    if (!primeiroCampoComErro) primeiroCampoComErro = document.getElementById('telefone');
  } else if (!validarTelefone(telefone)) {
    mostrarErroCampo('telefone', 'Telefone inválido');
    valido = false;
    if (!primeiroCampoComErro) primeiroCampoComErro = document.getElementById('telefone');
  }

  if (!observacoes || observacoes.length < 5) {
    mostrarErroCampo('observacoes', 'Descreva o motivo da consulta');
    valido = false;
    if (!primeiroCampoComErro) primeiroCampoComErro = document.getElementById('observacoes');
  }

  if (!valido && primeiroCampoComErro) {
    primeiroCampoComErro.focus();
  }

  return valido;
}

// ============================================
// SANITIZAÇÃO DE HTML
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// CONSTRUÇÃO DO RESUMO
// ============================================
function construirResumoAgendamento(slot, nome, telefone, dataNascimento, observacoes) {
  const diaSemana = slot.diaSemana ? slot.diaSemana.replace('-feira', '') : '';
  const dataFormatada = diaSemana ? `${diaSemana}, ${slot.data}` : slot.data;

  // Define o tipo de profissional baseado na origem (F=médico, O=enfermeira, vazio=médico)
  const origem = (slot.origem || 'F').toUpperCase();
  const tipoProfissional = origem === 'O' ? 'Enfermeira' : 'Médico';
  const iconeProfissional = origem === 'O' ? '👩‍⚕️' : '👨‍⚕️';

  // Escape user-provided data to prevent XSS
  const nomeEscaped = escapeHtml(nome);
  const telefoneEscaped = escapeHtml(telefone);
  const dataNascimentoEscaped = escapeHtml(dataNascimento);
  const observacoesEscaped = escapeHtml(observacoes);

  return `
    <div class="resumo-header">
      <div class="icon-ok" aria-hidden="true">✓</div>
      <div>
        <div class="resumo-titulo">Agendamento realizado!</div>
        <div class="resumo-subtitulo">Confira os dados e confirme no WhatsApp</div>
      </div>
    </div>
    
    <ul class="resumo-lista">
      <li>
        <strong>Data</strong>
        <span>${dataFormatada}</span>
      </li>
      <li>
        <strong>Horário</strong>
        <span class="resumo-chip">🕐 ${slot.hora}</span>
      </li>
      <li>
        <strong>Profissional</strong>
        <span class="resumo-chip">${iconeProfissional} ${tipoProfissional}</span>
      </li>
      <li>
        <strong>Paciente</strong>
        <span>${nomeEscaped}</span>
      </li>
      <li>
        <strong>Telefone</strong>
        <span>${telefoneEscaped}</span>
      </li>
      <li>
        <strong>Nascimento</strong>
        <span>${dataNascimentoEscaped}</span>
      </li>
      <li>
        <strong>Motivo</strong>
        <span>${observacoesEscaped}</span>
      </li>
    </ul>

    <p class="resumo-footer">
      <strong>Importante:</strong> Para confirmar seu agendamento, clique no botão abaixo 
      e envie a mensagem pelo WhatsApp. Sem essa confirmação, o horário poderá não ser reservado.
    </p>
  `;
}

// ============================================
// CONSTRUÇÃO DA URL DO WHATSAPP
// ============================================
function construirUrlWhatsApp(slot, nome) {
  const diaSemana = slot.diaSemana ? slot.diaSemana.replace('-feira', '') : '';
  const dataFormatada = diaSemana ? `${diaSemana}, ${slot.data}` : slot.data;
  const origem = (slot.origem || 'F').toUpperCase();
  const tipoProfissional = origem === 'O' ? 'enfermeira' : 'médico';

  const texto = `Olá! Aqui é ${nome}. Acabei de solicitar um agendamento com ${tipoProfissional} para ${dataFormatada} às ${slot.hora}. Poderia confirmar, por favor?`;

  return `https://wa.me/${WHATSAPP_DESTINO}?text=${encodeURIComponent(texto)}`;
}

// ============================================
// ENVIO DO AGENDAMENTO
// ============================================
async function enviarAgendamento(event) {
  if (event) event.preventDefault();

  if (!validarFormulario()) return;

  const select = document.getElementById('slotSelect');
  const idx = parseInt(select.value, 10);
  const slot = slotsGlobais[idx];

  if (!slot) {
    mostrarErroCampo('slotSelect', 'Horário inválido');
    return;
  }

  const nome = document.getElementById('nome').value.trim();
  const telefone = document.getElementById('telefone').value.trim();
  const dataNascimento = document.getElementById('dataNascimento').value.trim();
  const observacoes = document.getElementById('observacoes').value.trim();

  const msgDiv = document.getElementById('mensagem');
  const waDiv = document.getElementById('whatsapp-container');
  const waLink = document.getElementById('whatsapp-link');
  const formFields = document.getElementById('form-fields');
  const submitBtn = document.getElementById('submit-btn');

  waDiv.style.display = 'none';

  // Estado de loading
  submitBtn.disabled = true;
  submitBtn.classList.add('btn-loading');

  msgDiv.className = 'msg';
  msgDiv.style.display = 'block';
  msgDiv.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 12px; padding: 20px 0;">
      <div style="width: 24px; height: 24px; border: 2.5px solid #e2e8f0; border-top-color: #9381ff; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
      <span style="color: #64748b; font-weight: 500;">Processando agendamento...</span>
    </div>
  `;

  const dados = {
    rowIndex: slot.rowIndex,
    nome: nome,
    telefone: telefone,
    dataNascimento: dataNascimento,
    observacoes: observacoes
  };

  console.log('Enviando para API:', dados);

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(dados)
    });

    if (!resp.ok) {
      throw new Error('Erro ao agendar (HTTP ' + resp.status + ')');
    }

    const res = await resp.json();
    console.log('Resposta da API:', res);

    msgDiv.className = 'msg sucesso';
    msgDiv.innerHTML = construirResumoAgendamento(slot, nome, telefone, dataNascimento, observacoes);

    waLink.href = construirUrlWhatsApp(slot, nome);
    waDiv.style.display = 'block';

    if (formFields) {
      formFields.style.display = 'none';
    }

    // Atualizar para step 3 (confirmar)
    updateProgressSteps(3);

    msgDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    console.error(err);

    submitBtn.disabled = false;
    submitBtn.classList.remove('btn-loading');

    msgDiv.className = 'msg erro';
    msgDiv.innerHTML = `
      <div style="text-align: center;">
        <p style="font-weight: 600; margin-bottom: 8px;">Erro ao realizar agendamento</p>
        <p style="font-size: 14px; margin-bottom: 16px;">${err.message || 'Verifique sua conexão e tente novamente.'}</p>
      </div>
    `;

    msgDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ============================================
// MÁSCARAS DE INPUT
// ============================================
function aplicarMascaraTelefone(input) {
  let value = input.value.replace(/\D/g, '');

  if (value.length <= 2) {
    input.value = value ? '(' + value : '';
  } else if (value.length <= 7) {
    input.value = '(' + value.substring(0, 2) + ') ' + value.substring(2);
  } else if (value.length <= 10) {
    input.value = '(' + value.substring(0, 2) + ') ' + value.substring(2, 6) + '-' + value.substring(6);
  } else {
    input.value = '(' + value.substring(0, 2) + ') ' + value.substring(2, 7) + '-' + value.substring(7, 11);
  }
}

function aplicarMascaraData(input) {
  let value = input.value.replace(/\D/g, '');

  if (value.length > 2) {
    value = value.substring(0, 2) + '/' + value.substring(2);
  }
  if (value.length > 5) {
    value = value.substring(0, 5) + '/' + value.substring(5, 9);
  }

  input.value = value;
}

// ============================================
// VALIDAÇÃO EM TEMPO REAL
// ============================================
function configurarValidacaoEmTempoReal() {
  const campos = ['slotSelect', 'nome', 'dataNascimento', 'telefone', 'observacoes'];

  campos.forEach(campoId => {
    const campo = document.getElementById(campoId);
    if (!campo) return;

    campo.addEventListener('input', () => limparErroCampo(campoId));

    campo.addEventListener('blur', function () {
      const valor = campo.value.trim();
      if (!valor) return;

      if (campoId === 'telefone' && !validarTelefone(valor)) {
        mostrarErroCampo(campoId, 'Telefone inválido');
      } else if (campoId === 'dataNascimento') {
        const validacao = validarDataNascimento(valor);
        if (!validacao.valido) {
          mostrarErroCampo(campoId, validacao.mensagem);
        }
      }
    });

    // Atualizar steps baseado no preenchimento
    campo.addEventListener('change', function () {
      if (campoId === 'slotSelect' && campo.value) {
        updateProgressSteps(2);
      }
    });
  });
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', function () {
  // 🎭 VERIFICA SE DEVE BLOQUEAR O ACESSO (CARNAVAL) - PRIORIDADE MÁXIMA
  verificarModalCarnaval();
  
  // 🎄 VERIFICA SE DEVE MOSTRAR O MODAL DE RECESSO
  verificarModalRecesso();

  // 🔄 PRÉ-CARREGA OS HORÁRIOS EM BACKGROUND (assim que o site abre)
  preCarregarHorarios();

  // Máscaras
  const dataNascInput = document.getElementById('dataNascimento');
  if (dataNascInput) {
    dataNascInput.addEventListener('input', (e) => aplicarMascaraData(e.target));
  }

  const telefoneInput = document.getElementById('telefone');
  if (telefoneInput) {
    telefoneInput.addEventListener('input', (e) => aplicarMascaraTelefone(e.target));
  }

  // Validação em tempo real
  configurarValidacaoEmTempoReal();

  // Submit do formulário
  const form = document.getElementById('agendamento-form');
  if (form) {
    form.addEventListener('submit', enviarAgendamento);
  }

  // Event listeners para botões da intro
  const btnAgendar = document.querySelectorAll('[data-action="agendar"]');
  btnAgendar.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      mostrarFormulario(true);
    });
  });

  const btnVoltar = document.querySelectorAll('[data-action="voltar"]');
  btnVoltar.forEach(btn => {
    btn.addEventListener('click', voltarParaIntro);
  });
});

