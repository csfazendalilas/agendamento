// ====== TRIGGER PARA A PLANILHA DO POSTO DE SAÚDE (EQUIPE 783) ======
// Este código vive no Apps Script da planilha do posto:
// https://docs.google.com/spreadsheets/d/1fpwmi85pLQWPQrKJiawZOrSOip8MQlsfmyUpIU1wGlk
//
// O que ele faz:
// - Escrever "reservado" na coluna F ou O de uma aba "783 (...) B" cria uma vaga
//   LIVRE na planilha de vagas (aba Horarios), com a origem correspondente
//   (F = médico, O = enfermeira).
// - Apagar o "reservado" remove a vaga LIVRE correspondente.
// - Deletar linhas inteiras dispara a limpeza de órfãos (via onChange).
// - Criar/duplicar uma aba dispara a sincronização completa (via onChange).
//
// IMPORTANTE: depois de colar este código, execute UMA VEZ criarTriggerInstalavel().

const PLANILHA_AGENDAMENTOS_ID = '15DF8LfTpuRw47etH-gZX49zwUebTUPB2FxtHibPtmY4';
const ABA_HORARIOS = 'Horarios';
const PALAVRA_RESERVADO = 'reservado';
const COLUNA_DATA = 3; // Coluna C (compartilhada pelas duas estruturas)

// As duas estruturas de colunas dentro das abas 783 B:
// F = médico     (hora na coluna E, "reservado" na coluna F)
// O = enfermeira (hora na coluna N, "reservado" na coluna O)
const ESTRUTURAS = [
  { origem: 'F', colunaHorario: 5, colunaReservado: 6 },
  { origem: 'O', colunaHorario: 14, colunaReservado: 15 }
];

// ====== INSTALAÇÃO DOS TRIGGERS ======

/**
 * Execute esta função UMA VEZ (Executar > criarTriggerInstalavel).
 * Remove os triggers antigos e instala onEditInstalavel + onChangeInstalavel.
 */
function criarTriggerInstalavel() {
  const spreadsheet = SpreadsheetApp.getActive();
  if (!spreadsheet) {
    throw new Error('Execute esta função a partir do editor de scripts da planilha do posto.');
  }

  let removidos = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    const funcao = trigger.getHandlerFunction();
    if (funcao === 'onEditInstalavel' || funcao === 'onChangeInstalavel' || funcao === 'limparHorariosOrfaosAuto') {
      ScriptApp.deleteTrigger(trigger);
      removidos++;
    }
  });
  Logger.log('Triggers antigos removidos: ' + removidos);

  ScriptApp.newTrigger('onEditInstalavel')
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();

  ScriptApp.newTrigger('onChangeInstalavel')
    .forSpreadsheet(spreadsheet)
    .onChange()
    .create();

  const mensagem = '✅ Triggers criados com sucesso!\n\n' +
    '• Escrever "reservado" → cria vaga LIVRE\n' +
    '• Apagar "reservado" → remove a vaga LIVRE\n' +
    '• Deletar linha inteira → limpa vagas órfãs\n' +
    '• Criar/duplicar aba 783 → sincroniza os reservados';
  Logger.log(mensagem);
  return mensagem;
}

// ====== TRIGGERS ======

/**
 * Trigger instalável de edição.
 * Processa SOMENTE o range editado, tudo sob um único lock, e dá flush antes
 * de soltar o lock — isso evita que duas edições rápidas se atropelem.
 */
function onEditInstalavel(e) {
  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();
    if (!ehAba783B(sheet.getName())) return;

    // Sai rápido (antes do lock) se a edição não tocou as colunas F/O
    const primeiraColuna = e.range.getColumn();
    const ultimaColuna = e.range.getLastColumn();
    const estruturasEditadas = ESTRUTURAS.filter(est =>
      est.colunaReservado >= primeiraColuna && est.colunaReservado <= ultimaColuna);
    if (estruturasEditadas.length === 0) return;

    const lock = LockService.getScriptLock();
    lock.waitLock(30 * 1000);
    try {
      const sheetHorarios = abrirAbaHorarios();
      if (!sheetHorarios) return;

      const primeiraLinha = Math.max(e.range.getRow(), 2); // linha 1 é cabeçalho
      const ultimaLinha = e.range.getLastRow();
      if (ultimaLinha < primeiraLinha) return;

      // Snapshot único da aba (datas mescladas na C + horas + reservados),
      // em vez de ler célula a célula
      const dados = sheet.getRange(1, 1, ultimaLinha, 15).getDisplayValues();

      estruturasEditadas.forEach(est => {
        for (let linha = primeiraLinha; linha <= ultimaLinha; linha++) {
          const valor = (dados[linha - 1][est.colunaReservado - 1] || '').toString().toLowerCase().trim();
          const horario = (dados[linha - 1][est.colunaHorario - 1] || '').toString().trim();
          const data = buscarDataAcima(dados, linha);

          if (!data || !horario) continue;

          if (valor === PALAVRA_RESERVADO) {
            liberarHorarioAgendamento(sheetHorarios, data, horario, est.origem);
          } else {
            removerHorarioLivreSeExistir(sheetHorarios, data, horario, est.origem);
          }
        }
      });

      SpreadsheetApp.flush();
    } finally {
      try { lock.releaseLock(); } catch (ignorado) {}
    }
  } catch (erro) {
    Logger.log('❌ Erro no onEditInstalavel: ' + erro.message + '\n' + (erro.stack || ''));
  }
}

/**
 * Trigger instalável de mudança estrutural.
 * - Criar/duplicar aba (INSERT_GRID/COPY/OTHER) → sincroniza os reservados.
 * - Deletar linhas/abas (REMOVE_ROW/REMOVE_GRID) → limpa vagas órfãs
 *   (deletar linha inteira não dispara onEdit, por isso é tratado aqui).
 * Edições normais chegam com changeType EDIT e são ignoradas (onEdit cuida delas).
 */
function onChangeInstalavel(e) {
  try {
    const changeType = (e && e.changeType) ? String(e.changeType) : '';

    const deveSincronizar =
      !changeType ||
      changeType === 'INSERT_GRID' ||
      changeType === 'COPY' ||
      changeType === 'OTHER';

    const deveLimparOrfaos =
      changeType === 'REMOVE_ROW' ||
      changeType === 'REMOVE_GRID' ||
      changeType === 'REMOVE_COLUMN';

    if (!deveSincronizar && !deveLimparOrfaos) return;

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30 * 1000)) {
      Logger.log('onChangeInstalavel: lock não obtido, pulando para evitar concorrência.');
      return;
    }
    try {
      if (deveSincronizar) sincronizarReservadosInterno();
      if (deveLimparOrfaos) limparHorariosOrfaosInterno();
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  } catch (erro) {
    Logger.log('❌ Erro no onChangeInstalavel: ' + erro.message + '\n' + (erro.stack || ''));
  }
}

// ====== AÇÕES NA PLANILHA DE VAGAS ======

/**
 * Cria (ou reativa) uma vaga LIVRE na planilha de vagas e remove duplicatas
 * da mesma chave data+hora+origem numa única passada.
 * Deve ser chamada com o lock já adquirido pelo chamador.
 */
function liberarHorarioAgendamento(sheetHorarios, data, horario, origem) {
  origem = (origem || 'F').toString().trim().toUpperCase();
  const dataFormatada = formatarDataParaComparacao(data);
  const horaFormatada = formatarHoraParaComparacao(horario);

  const lastRow = sheetHorarios.getLastRow();
  let linhaExistente = -1;
  const duplicatasLivres = [];

  if (lastRow >= 2) {
    const dados = sheetHorarios.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
    for (let i = 0; i < dados.length; i++) {
      const origemLinha = (dados[i][3] || 'F').toString().trim().toUpperCase();
      if (origemLinha !== origem) continue;
      if (!compararDatas(formatarDataParaComparacao(dados[i][0]), dataFormatada)) continue;
      if (!compararHoras(formatarHoraParaComparacao(dados[i][1]), horaFormatada)) continue;

      if (linhaExistente === -1) {
        linhaExistente = i + 2;
      } else if ((dados[i][2] || '').toString().trim().toUpperCase() === 'LIVRE') {
        duplicatasLivres.push(i + 2);
      }
    }
  }

  if (linhaExistente !== -1) {
    sheetHorarios.getRange(linhaExistente, 3).setValue('LIVRE');
    sheetHorarios.getRange(linhaExistente, 4).setValue(origem);
    Logger.log('✅ Vaga reativada: ' + dataFormatada + ' ' + horaFormatada + ' (' + origem + ')');
  } else {
    sheetHorarios.appendRow([formatarDataParaInsercao(data), horaFormatada, 'LIVRE', origem]);
    Logger.log('✅ Vaga criada: ' + dataFormatada + ' ' + horaFormatada + ' (' + origem + ')');
  }

  // Remove duplicatas de baixo para cima (índices não se deslocam entre si)
  for (let i = duplicatasLivres.length - 1; i >= 0; i--) {
    if (deletarLinhaSeAindaCorresponde(sheetHorarios, duplicatasLivres[i], dataFormatada, horaFormatada, origem)) {
      Logger.log('🧹 Duplicata removida: linha ' + duplicatasLivres[i]);
    }
  }
}

/**
 * Remove a vaga LIVRE correspondente, se existir.
 * Só remove linhas com status LIVRE — nunca apaga um horário já agendado.
 * Deve ser chamada com o lock já adquirido pelo chamador.
 */
function removerHorarioLivreSeExistir(sheetHorarios, data, horario, origem) {
  origem = (origem || 'F').toString().trim().toUpperCase();
  const dataFormatada = formatarDataParaComparacao(data);
  const horaFormatada = formatarHoraParaComparacao(horario);

  const lastRow = sheetHorarios.getLastRow();
  if (lastRow < 2) return;

  const dados = sheetHorarios.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  let removidos = 0;

  for (let i = dados.length - 1; i >= 0; i--) {
    const status = (dados[i][2] || '').toString().trim().toUpperCase();
    if (status !== 'LIVRE') continue;
    const origemLinha = (dados[i][3] || 'F').toString().trim().toUpperCase();
    if (origemLinha !== origem) continue;
    if (!compararDatas(formatarDataParaComparacao(dados[i][0]), dataFormatada)) continue;
    if (!compararHoras(formatarHoraParaComparacao(dados[i][1]), horaFormatada)) continue;

    if (deletarLinhaSeAindaCorresponde(sheetHorarios, i + 2, dataFormatada, horaFormatada, origem)) {
      removidos++;
    }
  }

  Logger.log(removidos > 0
    ? '✅ Vaga removida: ' + dataFormatada + ' ' + horaFormatada + ' (' + origem + ')'
    : 'Nenhuma vaga LIVRE para remover: ' + dataFormatada + ' ' + horaFormatada + ' (' + origem + ')');
}

/**
 * Confere a linha imediatamente antes de deletar. O site de agendamento é
 * outro projeto Apps Script (o lock não é compartilhado), então a linha pode
 * ter se deslocado entre a leitura e o delete — nesse caso não deleta.
 */
function deletarLinhaSeAindaCorresponde(sheetHorarios, numeroLinha, dataFormatada, horaFormatada, origem) {
  if (numeroLinha < 2 || numeroLinha > sheetHorarios.getLastRow()) return false;

  const atual = sheetHorarios.getRange(numeroLinha, 1, 1, 4).getDisplayValues()[0];
  const corresponde =
    (atual[2] || '').toString().trim().toUpperCase() === 'LIVRE' &&
    (atual[3] || 'F').toString().trim().toUpperCase() === origem &&
    compararDatas(formatarDataParaComparacao(atual[0]), dataFormatada) &&
    compararHoras(formatarHoraParaComparacao(atual[1]), horaFormatada);

  if (!corresponde) {
    Logger.log('⚠️ Linha ' + numeroLinha + ' mudou desde a leitura; não vou deletar.');
    return false;
  }

  sheetHorarios.deleteRow(numeroLinha);
  return true;
}

// ====== SINCRONIZAÇÃO E LIMPEZA (menu / onChange) ======

/**
 * Menu: varre todas as abas 783 B e garante que todo "reservado" tem vaga LIVRE.
 */
function sincronizarReservados() {
  const lock = LockService.getScriptLock();
  lock.waitLock(60 * 1000);
  try {
    sincronizarReservadosInterno();
    SpreadsheetApp.flush();
  } finally {
    try { lock.releaseLock(); } catch (ignorado) {}
  }
}

function sincronizarReservadosInterno() {
  const ssPosto = SpreadsheetApp.getActive();
  const sheetHorarios = abrirAbaHorarios();
  if (!ssPosto || !sheetHorarios) return;

  const reservados = coletarTodosReservados(ssPosto);
  Logger.log('Sincronizando ' + reservados.length + ' "reservado(s)"...');
  reservados.forEach(r => liberarHorarioAgendamento(sheetHorarios, r.data, r.hora, r.origem));
}

/**
 * Menu: remove vagas LIVRE que não têm mais um "reservado" correspondente
 * na planilha do posto (ex.: depois de deletar linhas inteiras).
 */
function limparHorariosOrfaos() {
  const lock = LockService.getScriptLock();
  lock.waitLock(60 * 1000);
  try {
    limparHorariosOrfaosInterno();
    SpreadsheetApp.flush();
  } finally {
    try { lock.releaseLock(); } catch (ignorado) {}
  }
}

function limparHorariosOrfaosInterno() {
  const ssPosto = SpreadsheetApp.getActive();
  const sheetHorarios = abrirAbaHorarios();
  if (!ssPosto || !sheetHorarios) return;

  const reservados = coletarTodosReservados(ssPosto);
  const lastRow = sheetHorarios.getLastRow();
  if (lastRow < 2) return;

  const dados = sheetHorarios.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  let removidos = 0;

  for (let i = dados.length - 1; i >= 0; i--) {
    const status = (dados[i][2] || '').toString().trim().toUpperCase();
    if (status !== 'LIVRE') continue;

    const data = formatarDataParaComparacao(dados[i][0]);
    const hora = formatarHoraParaComparacao(dados[i][1]);
    const origem = (dados[i][3] || 'F').toString().trim().toUpperCase();

    const existeReservado = reservados.some(r =>
      compararDatas(r.data, data) && compararHoras(r.hora, hora) && r.origem === origem);
    if (existeReservado) continue;

    if (deletarLinhaSeAindaCorresponde(sheetHorarios, i + 2, data, hora, origem)) {
      Logger.log('🧹 Órfã removida: ' + data + ' ' + hora + ' (' + origem + ')');
      removidos++;
    }
  }

  Logger.log('Total de vagas órfãs removidas: ' + removidos);
}

/**
 * Coleta todos os "reservado" de todas as abas 783 B (estruturas F e O).
 * Retorna [{data, hora, origem}].
 */
function coletarTodosReservados(ssPosto) {
  const reservados = [];

  ssPosto.getSheets().forEach(aba => {
    if (!ehAba783B(aba.getName())) return;

    const lastRow = aba.getLastRow();
    if (lastRow < 2) return;

    const dados = aba.getRange(1, 1, lastRow, 15).getDisplayValues();
    let ultimaData = '';

    for (let i = 1; i < dados.length; i++) {
      const dataCelula = (dados[i][COLUNA_DATA - 1] || '').toString().trim();
      if (dataCelula) ultimaData = dataCelula; // trata células mescladas de data
      const dataLinha = dataCelula || ultimaData;
      if (!dataLinha) continue;

      ESTRUTURAS.forEach(est => {
        const hora = (dados[i][est.colunaHorario - 1] || '').toString().trim();
        const valor = (dados[i][est.colunaReservado - 1] || '').toString().toLowerCase().trim();
        if (hora && valor === PALAVRA_RESERVADO) {
          reservados.push({
            data: formatarDataParaComparacao(dataLinha),
            hora: formatarHoraParaComparacao(hora),
            origem: est.origem
          });
        }
      });
    }
  });

  return reservados;
}

// ====== AUXILIARES ======

function ehAba783B(nomeAba) {
  const nome = (nomeAba || '').trim();
  return nome.indexOf('783') !== -1 &&
    nome.toLowerCase().indexOf('modelo') === -1 &&
    nome.endsWith(' B');
}

function abrirAbaHorarios() {
  const ss = SpreadsheetApp.openById(PLANILHA_AGENDAMENTOS_ID);
  const sheet = ss.getSheetByName(ABA_HORARIOS);
  if (!sheet) {
    Logger.log('❌ Aba "' + ABA_HORARIOS + '" não encontrada na planilha de vagas.');
  }
  return sheet;
}

/**
 * Busca a data na coluna C subindo a partir da linha (células de data mescladas),
 * usando o snapshot já lido em vez de ler célula a célula.
 */
function buscarDataAcima(dados, linha) {
  for (let l = linha; l >= 1; l--) {
    const valor = (dados[l - 1][COLUNA_DATA - 1] || '').toString().trim();
    if (valor) return valor;
  }
  return '';
}

/**
 * Formata data para comparação (dd/MM/yyyy). Aceita dd/MM (assume ano atual) e Date.
 */
function formatarDataParaComparacao(data) {
  if (!data) return '';

  const texto = data.toString().trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    return texto;
  }

  if (/^\d{1,2}\/\d{1,2}$/.test(texto)) {
    const partes = texto.split('/');
    return partes[0].padStart(2, '0') + '/' + partes[1].padStart(2, '0') + '/' + new Date().getFullYear();
  }

  try {
    const d = new Date(data);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Sao_Paulo', 'dd/MM/yyyy');
    }
  } catch (ignorado) {}

  return texto;
}

/**
 * Formata hora para comparação (HH:mm). Aceita H:mm e Date.
 */
function formatarHoraParaComparacao(hora) {
  if (!hora) return '';

  const texto = hora.toString().trim();

  if (/^\d{2}:\d{2}$/.test(texto)) {
    return texto;
  }

  if (/^\d{1}:\d{2}$/.test(texto)) {
    return '0' + texto;
  }

  try {
    const h = new Date(hora);
    if (!isNaN(h.getTime())) {
      return Utilities.formatDate(h, Session.getScriptTimeZone() || 'America/Sao_Paulo', 'HH:mm');
    }
  } catch (ignorado) {}

  return texto;
}

/**
 * Compara datas dd/MM/yyyy ignorando zeros à esquerda.
 */
function compararDatas(data1, data2) {
  if (!data1 || !data2) return false;

  const normalizar = (d) => {
    const partes = d.split('/');
    if (partes.length !== 3) return d;
    return partes[0].replace(/^0+/, '') + '/' + partes[1].replace(/^0+/, '') + '/' + partes[2];
  };

  return normalizar(data1) === normalizar(data2);
}

/**
 * Compara horas HH:mm ignorando zeros à esquerda.
 */
function compararHoras(hora1, hora2) {
  if (!hora1 || !hora2) return false;

  const normalizar = (h) => {
    const partes = h.split(':');
    if (partes.length !== 2) return h;
    return partes[0].replace(/^0+/, '') + ':' + partes[1].replace(/^0+/, '');
  };

  return normalizar(hora1) === normalizar(hora2);
}

/**
 * Converte a data para objeto Date na hora de inserir a vaga (mantém a coluna
 * A da planilha de vagas como data de verdade, não texto).
 */
function formatarDataParaInsercao(data) {
  if (!data) return '';

  const texto = data.toString().trim();

  try {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
      const partes = texto.split('/');
      return new Date(parseInt(partes[2], 10), parseInt(partes[1], 10) - 1, parseInt(partes[0], 10));
    }

    if (/^\d{1,2}\/\d{1,2}$/.test(texto)) {
      const partes = texto.split('/');
      return new Date(new Date().getFullYear(), parseInt(partes[1], 10) - 1, parseInt(partes[0], 10));
    }

    const d = new Date(data);
    if (!isNaN(d.getTime())) {
      return d;
    }
  } catch (ignorado) {}

  return texto;
}

// ====== MENU ======

function onOpen() {
  criarMenuAgendamento();
}

function criarMenuAgendamento() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Agendamento')
      .addItem('Sincronizar todos os reservados', 'sincronizarReservados')
      .addItem('Limpar horários órfãos', 'limparHorariosOrfaos')
      .addToUi();
  } catch (erro) {
    Logger.log('❌ Erro ao criar menu Agendamento: ' + erro.message);
  }
}
