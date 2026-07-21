// ============================================
// ENVIO DE EXAMES (laboratoriais e de imagem)
// Fluxo: iniciarEnvioExames (cria a pasta no Drive) → anexarExame (um por
// arquivo, com barra de progresso) → finalizarEnvioExames (registra a linha
// na aba "Exames não vistos" da planilha da equipe).
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbzSnLgusejiDF9oCtL-xjY54TybLn91HyX3NTofToGRs9rqREqg136D2czCsSLhNrti/exec';

const MAX_ARQUIVOS = 10;
const MAX_MB_POR_ARQUIVO = 15;

// Extensão → tipo (o celular às vezes não informa o tipo do arquivo)
const TIPOS_POR_EXTENSAO = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf'
};

let arquivosSelecionados = [];

// ============================================
// UTILITÁRIOS
// ============================================

const $ = (id) => document.getElementById(id);

function tipoDoArquivo(arquivo) {
  const tipo = (arquivo.type || '').toLowerCase();
  if (tipo) return tipo;
  const ext = (arquivo.name.split('.').pop() || '').toLowerCase();
  return TIPOS_POR_EXTENSAO[ext] || '';
}

function tipoAceito(arquivo) {
  const tipo = tipoDoArquivo(arquivo);
  return Object.values(TIPOS_POR_EXTENSAO).indexOf(tipo) !== -1;
}

function tamanhoLegivel(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function lerComoBase64(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = leitor.result || '';
      resolver(resultado.toString().split(',')[1] || '');
    };
    leitor.onerror = () => rejeitar(new Error('Não foi possível ler o arquivo "' + arquivo.name + '".'));
    leitor.readAsDataURL(arquivo);
  });
}

// Faz o POST via XMLHttpRequest (em vez de fetch) para conseguir a barra de
// progresso REAL do upload: o fetch não informa quanto do arquivo já subiu.
// O callback aoProgredirUpload (opcional) recebe uma fração de 0 a 1 enquanto
// o corpo da requisição está sendo enviado.
function chamarApi(corpo, aoProgredirUpload) {
  return new Promise((resolver, rejeitar) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL, true);
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
    if (aoProgredirUpload && xhr.upload) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) aoProgredirUpload(e.loaded / e.total);
      });
    }
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        rejeitar(new Error('Falha de conexão (HTTP ' + xhr.status + '). Verifique a internet e tente de novo.'));
        return;
      }
      try {
        resolver(JSON.parse(xhr.responseText));
      } catch (e) {
        rejeitar(new Error('Resposta inesperada do servidor. Tente de novo.'));
      }
    };
    xhr.onerror = () => rejeitar(new Error('Falha de conexão. Verifique a internet e tente de novo.'));
    xhr.send(JSON.stringify(corpo));
  });
}

// ============================================
// VALIDAÇÕES (mesmas regras do site)
// ============================================

function validarTelefone(telefone) {
  const apenasNumeros = telefone.replace(/\D/g, '');
  return apenasNumeros.length >= 10 && apenasNumeros.length <= 11;
}

function validarDataNascimento(data) {
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  if (!regex.test(data)) return { valido: false, mensagem: 'Use o formato DD/MM/AAAA' };
  const partes = data.split('/');
  const dia = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10);
  const ano = parseInt(partes[2], 10);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 1900 || ano > new Date().getFullYear()) {
    return { valido: false, mensagem: 'Data inválida. Verifique dia, mês e ano.' };
  }
  return { valido: true };
}

function mostrarErroCampo(campoId, mensagem) {
  const campo = $(campoId);
  const errorSpan = $(campoId + '-error');
  if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.classList.add('error'); }
  if (errorSpan) errorSpan.textContent = mensagem;
}

function limparErroCampo(campoId) {
  const campo = $(campoId);
  const errorSpan = $(campoId + '-error');
  if (campo) { campo.removeAttribute('aria-invalid'); campo.classList.remove('error'); }
  if (errorSpan) errorSpan.textContent = '';
}

function validarFormulario() {
  ['nome', 'dataNascimento', 'telefone', 'arquivos'].forEach(limparErroCampo);

  const nome = $('nome').value.trim();
  const dataNascimento = $('dataNascimento').value.trim();
  const telefone = $('telefone').value.trim();
  let valido = true;

  if (!nome || nome.length < 3) { mostrarErroCampo('nome', 'Informe o nome completo'); valido = false; }

  if (!dataNascimento) {
    mostrarErroCampo('dataNascimento', 'Informe a data de nascimento'); valido = false;
  } else {
    const v = validarDataNascimento(dataNascimento);
    if (!v.valido) { mostrarErroCampo('dataNascimento', v.mensagem); valido = false; }
  }

  if (!telefone) { mostrarErroCampo('telefone', 'Informe seu telefone'); valido = false; }
  else if (!validarTelefone(telefone)) { mostrarErroCampo('telefone', 'Telefone inválido'); valido = false; }

  if (arquivosSelecionados.length === 0) {
    mostrarErroCampo('arquivos', 'Escolha ao menos um arquivo de exame');
    valido = false;
  }

  return valido;
}

// ============================================
// MÁSCARAS
// ============================================

function aplicarMascaraTelefone(input) {
  let value = input.value.replace(/\D/g, '');
  if (value.length <= 2) input.value = value ? '(' + value : '';
  else if (value.length <= 7) input.value = '(' + value.substring(0, 2) + ') ' + value.substring(2);
  else if (value.length <= 10) input.value = '(' + value.substring(0, 2) + ') ' + value.substring(2, 6) + '-' + value.substring(6);
  else input.value = '(' + value.substring(0, 2) + ') ' + value.substring(2, 7) + '-' + value.substring(7, 11);
}

function aplicarMascaraData(input) {
  let value = input.value.replace(/\D/g, '');
  if (value.length > 2) value = value.substring(0, 2) + '/' + value.substring(2);
  if (value.length > 5) value = value.substring(0, 5) + '/' + value.substring(5, 9);
  input.value = value;
}

// ============================================
// SELEÇÃO DE ARQUIVOS
// ============================================

function adicionarArquivos(lista) {
  limparErroCampo('arquivos');
  const problemas = [];

  Array.prototype.forEach.call(lista, (arquivo) => {
    if (arquivosSelecionados.length >= MAX_ARQUIVOS) {
      problemas.push('Limite de ' + MAX_ARQUIVOS + ' arquivos por envio.');
      return;
    }
    if (!tipoAceito(arquivo)) {
      problemas.push('"' + arquivo.name + '" não é foto nem PDF.');
      return;
    }
    if (arquivo.size > MAX_MB_POR_ARQUIVO * 1024 * 1024) {
      problemas.push('"' + arquivo.name + '" passa de ' + MAX_MB_POR_ARQUIVO + ' MB.');
      return;
    }
    const repetido = arquivosSelecionados.some(a => a.name === arquivo.name && a.size === arquivo.size);
    if (!repetido) arquivosSelecionados.push(arquivo);
  });

  if (problemas.length) mostrarErroCampo('arquivos', problemas.join(' '));
  renderizarListaArquivos();
}

function renderizarListaArquivos() {
  const listaEl = $('lista-arquivos');
  listaEl.innerHTML = '';
  arquivosSelecionados.forEach((arquivo, indice) => {
    const item = document.createElement('div');
    item.className = 'exm-arquivo';

    const emoji = tipoDoArquivo(arquivo) === 'application/pdf' ? '📄' : '🖼️';
    const nome = document.createElement('span');
    nome.className = 'exm-nome';
    nome.textContent = emoji + ' ' + arquivo.name;

    const tamanho = document.createElement('span');
    tamanho.className = 'exm-tamanho';
    tamanho.textContent = tamanhoLegivel(arquivo.size);

    const remover = document.createElement('button');
    remover.type = 'button';
    remover.className = 'exm-remover';
    remover.textContent = '✕';
    remover.setAttribute('aria-label', 'Remover ' + arquivo.name);
    remover.addEventListener('click', () => {
      arquivosSelecionados.splice(indice, 1);
      renderizarListaArquivos();
    });

    item.appendChild(nome);
    item.appendChild(tamanho);
    item.appendChild(remover);
    listaEl.appendChild(item);
  });
}

// ============================================
// ENVIO
// ============================================

// Estado da barra: guardamos a % atual para (1) a barra nunca voltar atrás e
// (2) o "trickle" conseguir avançar sozinho durante as esperas. Passar texto
// null mantém o texto anterior (usado quando só a % muda).
let progressoAtual = 0;
let textoAtual = '';
let trickleTimer = null;

function definirProgresso(texto, porcentagem) {
  if (typeof texto === 'string') textoAtual = texto;
  progressoAtual = Math.max(progressoAtual, Math.min(100, porcentagem));
  const pct = Math.round(progressoAtual);
  $('progresso').style.display = 'block';
  $('progresso-txt').textContent = pct >= 100 ? textoAtual : textoAtual + ' — ' + pct + '%';
  $('barra').style.width = pct + '%';
}

// Enquanto esperamos algo que não dá para medir (criar a pasta, registrar na
// planilha, ou o servidor processar um arquivo que já terminou de subir), a
// barra avança sozinha e devagar em direção a um teto, para nunca parecer
// travada. Ela desacelera perto do teto e nunca o ultrapassa.
function iniciarTrickle(teto) {
  pararTrickle();
  trickleTimer = setInterval(() => {
    if (progressoAtual < teto) {
      const passo = Math.max(0.2, (teto - progressoAtual) * 0.06);
      definirProgresso(null, progressoAtual + passo);
    }
  }, 200);
}

function pararTrickle() {
  if (trickleTimer) { clearInterval(trickleTimer); trickleTimer = null; }
}

async function enviarExames(evento) {
  if (evento) evento.preventDefault();
  if (!validarFormulario()) return;

  const nome = $('nome').value.trim();
  const dataNascimento = $('dataNascimento').value.trim();
  const telefone = $('telefone').value.trim();
  const msgDiv = $('mensagem');
  const botao = $('submit-btn');

  botao.disabled = true;
  msgDiv.style.display = 'none';
  msgDiv.className = 'msg';

  const total = arquivosSelecionados.length;

  // Faixas da barra: 0–8% preparar, 8–92% enviar os arquivos, 92–100% registrar.
  const INICIO_ARQUIVOS = 8;
  const FIM_ARQUIVOS = 92;
  const FAIXA_ARQUIVOS = FIM_ARQUIVOS - INICIO_ARQUIVOS;

  progressoAtual = 0; // zera caso seja uma nova tentativa após erro

  try {
    // 1) Cria a pasta do envio (espera não mensurável → trickle)
    definirProgresso('Preparando envio…', 2);
    iniciarTrickle(INICIO_ARQUIVOS - 1);
    const inicio = await chamarApi({ action: 'iniciarEnvioExames', nome, dataNascimento, telefone });
    pararTrickle();

    if (!inicio || inicio.sucesso !== true || !inicio.envioId) {
      const mensagemServidor = inicio && inicio.mensagem ? inicio.mensagem : '';
      // Backend antigo (sem o envio de exames ativado) cai aqui
      throw new Error(mensagemServidor && !/hor[aá]rio/i.test(mensagemServidor)
        ? mensagemServidor
        : 'O envio de exames ainda está sendo ativado pela equipe. Tente novamente mais tarde.');
    }

    // 2) Sobe os arquivos um a um, com a barra acompanhando o upload de verdade
    for (let i = 0; i < total; i++) {
      const arquivo = arquivosSelecionados[i];
      const segInicio = INICIO_ARQUIVOS + (i / total) * FAIXA_ARQUIVOS;
      const segFim = INICIO_ARQUIVOS + ((i + 1) / total) * FAIXA_ARQUIVOS;
      const seg = segFim - segInicio;

      pararTrickle();
      definirProgresso('Enviando arquivo ' + (i + 1) + ' de ' + total + ' — ' + arquivo.name, segInicio);

      const conteudo = await lerComoBase64(arquivo);
      const resposta = await chamarApi({
        action: 'anexarExame',
        envioId: inicio.envioId,
        nomeArquivo: arquivo.name,
        tipo: tipoDoArquivo(arquivo),
        conteudo: conteudo
      }, (fracao) => {
        // enquanto o arquivo sobe, preenche até 88% do trecho deste arquivo...
        definirProgresso(null, segInicio + fracao * seg * 0.88);
        // ...e quando termina de subir, o trickle cobre a espera do servidor
        if (fracao >= 1 && !trickleTimer) iniciarTrickle(segInicio + seg * 0.98);
      });
      pararTrickle();
      if (!resposta || resposta.sucesso !== true) {
        throw new Error((resposta && resposta.mensagem) || 'Falha ao enviar "' + arquivo.name + '". Tente de novo.');
      }
      definirProgresso(null, segFim); // arquivo confirmado → fecha o trecho dele
    }

    // 3) Registra na planilha da equipe (espera não mensurável → trickle)
    definirProgresso('Registrando envio…', FIM_ARQUIVOS + 1);
    iniciarTrickle(99);
    const fim = await chamarApi({ action: 'finalizarEnvioExames', envioId: inicio.envioId, nome, dataNascimento, telefone });
    pararTrickle();
    if (!fim || fim.sucesso !== true) {
      throw new Error((fim && fim.mensagem) || 'Não foi possível registrar o envio. Tente de novo.');
    }

    definirProgresso('Concluído!', 100);
    $('form-fields').style.display = 'none';
    setTimeout(() => { $('progresso').style.display = 'none'; }, 600);

    msgDiv.className = 'msg sucesso';
    msgDiv.style.display = 'block';
    msgDiv.innerHTML = '';
    const cabecalho = document.createElement('div');
    cabecalho.className = 'resumo-header';
    const icone = document.createElement('div');
    icone.className = 'icon-ok';
    icone.textContent = '✓';
    const textos = document.createElement('div');
    const titulo = document.createElement('div');
    titulo.className = 'resumo-titulo';
    titulo.textContent = 'Exames enviados!';
    const subtitulo = document.createElement('div');
    subtitulo.className = 'resumo-subtitulo';
    subtitulo.textContent = fim.arquivos + ' arquivo(s) recebido(s) pela equipe. Vamos avaliar e, se necessário, entraremos em contato pelo telefone informado.';
    textos.appendChild(titulo);
    textos.appendChild(subtitulo);
    cabecalho.appendChild(icone);
    cabecalho.appendChild(textos);
    msgDiv.appendChild(cabecalho);
    msgDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (erro) {
    console.error(erro);
    pararTrickle();
    $('progresso').style.display = 'none';
    botao.disabled = false;

    msgDiv.className = 'msg erro';
    msgDiv.style.display = 'block';
    msgDiv.innerHTML = '';
    const tituloErro = document.createElement('p');
    tituloErro.style.fontWeight = '600';
    tituloErro.textContent = 'Não foi possível enviar os exames';
    const detalheErro = document.createElement('p');
    detalheErro.style.fontSize = '14px';
    detalheErro.textContent = erro.message || 'Verifique sua conexão e tente novamente.';
    msgDiv.appendChild(tituloErro);
    msgDiv.appendChild(detalheErro);
    msgDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ============================================
// INICIALIZAÇÃO
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const area = $('area-drop');
  const inputArquivos = $('arquivos');

  area.addEventListener('click', () => inputArquivos.click());
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputArquivos.click(); }
  });

  inputArquivos.addEventListener('change', () => {
    adicionarArquivos(inputArquivos.files);
    inputArquivos.value = ''; // permite escolher o mesmo arquivo de novo
  });

  ['dragover', 'dragenter'].forEach(nome => area.addEventListener(nome, (e) => {
    e.preventDefault();
    area.classList.add('arrastando');
  }));
  ['dragleave', 'drop'].forEach(nome => area.addEventListener(nome, (e) => {
    e.preventDefault();
    area.classList.remove('arrastando');
  }));
  area.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files) adicionarArquivos(e.dataTransfer.files);
  });

  $('dataNascimento').addEventListener('input', (e) => aplicarMascaraData(e.target));
  $('telefone').addEventListener('input', (e) => aplicarMascaraTelefone(e.target));
  ['nome', 'dataNascimento', 'telefone'].forEach(id => {
    $(id).addEventListener('input', () => limparErroCampo(id));
  });

  $('form-exames').addEventListener('submit', enviarExames);
});
