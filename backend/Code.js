// ====== BACKEND DO SITE DE AGENDAMENTO (EQUIPE 783) ======
// Backend ÚNICO para os dois sites (agendamento atual e pueripre/enfermagem).
// Publicado como Web App; os sites chamam via fetch (GET getSlots / POST bookSlot).
//
// Regra central: o agendamento SÓ é confirmado se o nome do paciente foi
// escrito na agenda do posto. Se a escrita no posto falhar, o paciente recebe
// uma mensagem de erro e a vaga continua livre — nada de agendamento "fantasma".

// ====== CONFIGURAÇÕES ======
const SHEET_ID = '15DF8LfTpuRw47etH-gZX49zwUebTUPB2FxtHibPtmY4';
const SHEET_HORARIOS = 'Horarios';
const SHEET_AGENDAMENTOS = 'Agendamentos';

// Planilha geral do posto de saúde (onde a equipe realmente atende)
const SHEET_POSTO_ID = '1fpwmi85pLQWPQrKJiawZOrSOip8MQlsfmyUpIU1wGlk';

// Planilha de triagem (pré-natal/puericultura)
const SHEET_TRIAGEM_ID = '1Ih-PMnTW698l-pqJks69qBn0QOQXSH3ZfcJKY6YhvOA';

const PALAVRA_RESERVADO = 'reservado';

// Estruturas de colunas na agenda do posto, por origem:
// F = médico     (hora na E, "reservado" na F; escreve marcador na D e nome/DN/motivo em F-H)
// O = enfermeira (hora na N, "reservado" na O; escreve marcador na M e nome/DN/motivo em O-Q)
const ESTRUTURAS_POSTO = {
  'F': { colunaHorario: 5, colunaReservado: 6, colunaMarcador: 4, colunaNome: 6 },
  'O': { colunaHorario: 14, colunaReservado: 15, colunaMarcador: 13, colunaNome: 15 }
};

// ====== ENDPOINTS (API) ======

/**
 * GET ?action=getSlots -> lista de horários LIVRES em JSON
 */
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'getSlots') {
    return respostaJson(getAvailableSlots());
  }

  return respostaJson({ error: 'Ação inválida' });
}

/**
 * POST com corpo JSON:
 *   { data, hora, origem, canal, nome, telefone, dataNascimento, observacoes, triagem }
 * (payload antigo com rowIndex também é aceito, por compatibilidade)
 *
 * SEMPRE responde JSON — inclusive em erro ({ sucesso:false, mensagem }).
 */
function doPost(e) {
  let res;
  try {
    const data = JSON.parse(e.postData.contents);
    res = bookSlot(data);
  } catch (erro) {
    Logger.log('❌ Erro no doPost: ' + erro.message + '\n' + (erro.stack || ''));
    res = {
      sucesso: false,
      mensagem: 'Não foi possível concluir o agendamento. Tente novamente em instantes.'
    };
  }
  return respostaJson(res);
}

function respostaJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====== LÓGICA DE NEGÓCIO ======

/**
 * Lê a aba Horarios e devolve só horários LIVRES já formatados.
 * Cada slot: { rowIndex, data, hora, diaSemana, origem }
 */
function getAvailableSlots() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_HORARIOS);

  if (!sheet) {
    throw new Error('A aba "' + SHEET_HORARIOS + '" não foi encontrada na planilha.');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const slots = [];

  values.forEach((row, index) => {
    const status = (row[2] || '').toString().toUpperCase().trim();
    if (status !== 'LIVRE') return;

    const dataStr = formatarDataCelula(row[0]);
    const horaStr = formatarHoraCelula(row[1]);
    const origem = (row[3] || 'F').toString().toUpperCase().trim();

    const partes = dataStr.split('/');
    if (partes.length !== 3) return; // data ilegível — não oferece o slot

    const dataObj = new Date(parseInt(partes[2], 10), parseInt(partes[1], 10) - 1, parseInt(partes[0], 10));

    slots.push({
      rowIndex: index + 2,
      data: dataStr,
      hora: horaStr,
      diaSemana: diasSemana[dataObj.getDay()],
      origem: origem
    });
  });

  return slots;
}

/**
 * Faz o agendamento, nesta ordem (tudo sob lock):
 *   1. Localiza a vaga LIVRE pela chave data+hora+origem.
 *   2. Escreve o paciente na agenda do posto (se falhar, PARA aqui — a vaga fica livre).
 *   3. Remove a vaga e registra em Agendamentos.
 *   4. Registra a triagem (não-crítico).
 */
function bookSlot(bookingData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30 * 1000);
  } catch (erroLock) {
    return {
      sucesso: false,
      mensagem: 'O sistema está ocupado no momento. Aguarde alguns segundos e tente novamente.'
    };
  }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheetHor = ss.getSheetByName(SHEET_HORARIOS);
    const sheetAg = ss.getSheetByName(SHEET_AGENDAMENTOS);

    if (!sheetHor || !sheetAg) {
      return { sucesso: false, mensagem: 'Erro de configuração da planilha de vagas. Contate o posto.' };
    }

    const nome = (bookingData.nome || '').toString().trim();
    const telefone = (bookingData.telefone || '').toString().trim();
    const dataNascimento = (bookingData.dataNascimento || '').toString().trim();
    const observacoes = (bookingData.observacoes || '').toString().trim();
    const marcador = (bookingData.canal || '').toString().trim() || 'app';

    if (!nome) {
      return { sucesso: false, mensagem: 'Informe o nome do paciente.' };
    }

    // 1) Localiza a vaga
    const vaga = localizarVaga(sheetHor, bookingData);
    if (!vaga) {
      return { sucesso: false, mensagem: 'Esse horário acabou de ser ocupado. Por favor, escolha outro.' };
    }

    // 2) Escreve na agenda do posto ANTES de consumir a vaga
    const posto = escreverNaAgendaDoPosto(vaga, nome, dataNascimento, observacoes, marcador);
    if (!posto.ok) {
      return { sucesso: false, mensagem: posto.mensagem };
    }

    // 3) Consome a vaga e registra o agendamento.
    // A nova linha entra SEMPRE NO TOPO (logo abaixo do cabeçalho), para o
    // agendamento mais recente aparecer primeiro.
    // Colunas da aba Agendamentos: Timestamp | Data | Hora | Nome | Motivo | Telefone
    removerVagaComVerificacao(sheetHor, vaga);
    sheetAg.insertRowBefore(2);
    sheetAg.getRange(2, 1, 1, 6).setValues([[new Date(), vaga.data, vaga.hora, nome, observacoes, telefone]]);

    // 4) Triagem — não-crítico: erro aqui não desfaz o agendamento
    try {
      const profissional = vaga.origem === 'O' ? 'Enfermeira' : 'Médico';
      registrarTriagem(vaga.data, vaga.hora, bookingData, profissional);
    } catch (erroTriagem) {
      Logger.log('[TRIAGEM] Erro (não-crítico): ' + erroTriagem.message);
    }

    SpreadsheetApp.flush();

    return {
      sucesso: true,
      mensagem: 'Agendamento realizado com sucesso!',
      data: vaga.data,
      hora: vaga.hora
    };
  } finally {
    try { lock.releaseLock(); } catch (ignorado) {}
  }
}

/**
 * Localiza a vaga LIVRE pela chave data+hora+origem enviada pelo site.
 * Payload antigo (só rowIndex) é aceito: a chave é lida daquela linha e a
 * busca continua pela chave — assim, mesmo que as linhas tenham se deslocado
 * desde o carregamento da página, nunca se agenda a vaga errada.
 * Retorna { rowIndex, data, hora, origem } ou null.
 */
function localizarVaga(sheetHor, bookingData) {
  const lastRow = sheetHor.getLastRow();
  if (lastRow < 2) return null;

  const valores = sheetHor.getRange(2, 1, lastRow - 1, 4).getValues();

  let dataStr = (bookingData.data || '').toString().trim();
  let horaStr = (bookingData.hora || '').toString().trim();
  let origem = (bookingData.origem || '').toString().trim().toUpperCase();

  // Compatibilidade com o payload antigo (rowIndex)
  if ((!dataStr || !horaStr) && bookingData.rowIndex) {
    const idx = parseInt(bookingData.rowIndex, 10);
    if (!idx || idx < 2 || idx > lastRow) return null;
    const row = valores[idx - 2];
    dataStr = formatarDataCelula(row[0]);
    horaStr = formatarHoraCelula(row[1]);
    if (!origem) origem = (row[3] || 'F').toString().trim().toUpperCase();
  }

  if (!dataStr || !horaStr) return null;
  if (!origem) origem = 'F';

  for (let i = 0; i < valores.length; i++) {
    const status = (valores[i][2] || '').toString().trim().toUpperCase();
    if (status !== 'LIVRE') continue;

    const origemLinha = (valores[i][3] || 'F').toString().trim().toUpperCase();
    if (origemLinha !== origem) continue;

    const dataLinha = formatarDataCelula(valores[i][0]);
    const horaLinha = formatarHoraCelula(valores[i][1]);

    if (compararDatas(dataLinha, dataStr) && compararHoras(horaLinha, horaStr)) {
      return { rowIndex: i + 2, data: dataLinha, hora: horaLinha, origem: origem };
    }
  }

  return null;
}

/**
 * Escreve o paciente na agenda do posto, substituindo o "reservado".
 * Retorna { ok: true } ou { ok: false, mensagem } — nunca engole erro.
 */
function escreverNaAgendaDoPosto(vaga, nome, dataNascimento, observacoes, marcador) {
  const estrutura = ESTRUTURAS_POSTO[vaga.origem];
  if (!estrutura) {
    return { ok: false, mensagem: 'Configuração de agenda desconhecida (origem "' + vaga.origem + '"). Contate o posto.' };
  }

  let ssPosto;
  try {
    ssPosto = SpreadsheetApp.openById(SHEET_POSTO_ID);
  } catch (erro) {
    Logger.log('❌ Não foi possível abrir a planilha do posto: ' + erro.message);
    return { ok: false, mensagem: 'Não foi possível acessar a agenda do posto agora. Tente novamente em alguns minutos.' };
  }

  const sheetPosto = encontrarAbaEquipe783PorData(ssPosto, vaga.data);
  if (!sheetPosto) {
    Logger.log('❌ Aba da equipe 783 não encontrada para ' + vaga.data);
    return { ok: false, mensagem: 'A agenda do posto para o dia ' + vaga.data + ' não foi encontrada. Escolha outro horário ou contate o posto.' };
  }

  const linha = encontrarLinhaReservada(sheetPosto, vaga.data, vaga.hora, estrutura.colunaReservado, estrutura.colunaHorario);
  if (linha < 1) {
    Logger.log('❌ "' + PALAVRA_RESERVADO + '" não encontrado em "' + sheetPosto.getName() + '" para ' + vaga.data + ' ' + vaga.hora + ' (origem ' + vaga.origem + ')');
    return { ok: false, mensagem: 'Esse horário não está mais disponível na agenda do posto. Por favor, escolha outro horário.' };
  }

  try {
    sheetPosto.getRange(linha, estrutura.colunaMarcador).setValue(marcador);
    // Nome, data de nascimento e motivo ficam em colunas contíguas (F-H ou O-Q)
    sheetPosto.getRange(linha, estrutura.colunaNome, 1, 3).setValues([[nome, dataNascimento, observacoes]]);
  } catch (erro) {
    Logger.log('❌ Erro ao escrever na agenda do posto: ' + erro.message);
    return { ok: false, mensagem: 'Não foi possível registrar na agenda do posto. Tente novamente em instantes.' };
  }

  Logger.log('✅ Paciente registrado no posto: "' + sheetPosto.getName() + '" linha ' + linha + ' (origem ' + vaga.origem + ')');
  return { ok: true };
}

/**
 * Remove a linha da vaga conferindo antes se ela ainda é a mesma — o
 * Triggerposto é outro projeto Apps Script (lock não compartilhado) e pode
 * ter inserido/removido linhas nesse meio-tempo.
 */
function removerVagaComVerificacao(sheetHor, vaga) {
  const lastRow = sheetHor.getLastRow();

  if (vaga.rowIndex >= 2 && vaga.rowIndex <= lastRow) {
    const atual = sheetHor.getRange(vaga.rowIndex, 1, 1, 4).getValues()[0];
    const confere =
      compararDatas(formatarDataCelula(atual[0]), vaga.data) &&
      compararHoras(formatarHoraCelula(atual[1]), vaga.hora) &&
      (atual[3] || 'F').toString().trim().toUpperCase() === vaga.origem;

    if (confere) {
      sheetHor.deleteRow(vaga.rowIndex);
      return;
    }
  }

  // A linha se deslocou: re-localiza pela chave e remove a primeira que bater
  for (let linha = sheetHor.getLastRow(); linha >= 2; linha--) {
    const atual = sheetHor.getRange(linha, 1, 1, 4).getValues()[0];
    const confere =
      compararDatas(formatarDataCelula(atual[0]), vaga.data) &&
      compararHoras(formatarHoraCelula(atual[1]), vaga.hora) &&
      (atual[3] || 'F').toString().trim().toUpperCase() === vaga.origem;
    if (confere) {
      sheetHor.deleteRow(linha);
      return;
    }
  }

  // Vaga já não está na lista (ex.: o próprio trigger removeu). O paciente já
  // está na agenda do posto, então segue; se sobrar linha, o menu
  // "Limpar horários órfãos" resolve.
  Logger.log('⚠️ Vaga não encontrada para remover: ' + vaga.data + ' ' + vaga.hora + ' (' + vaga.origem + ')');
}

/**
 * Encontra a aba da equipe 783 que contém a data (formato "783 (dd/MM - dd/MM) X",
 * X = A para 2025, B para 2026, e assim por diante).
 * Tenta o nome padrão direto (rápido) e cai para a varredura com regex.
 */
function encontrarAbaEquipe783PorData(spreadsheet, dataStr) {
  const partesData = dataStr.split('/');
  const dia = parseInt(partesData[0], 10);
  const mes = parseInt(partesData[1], 10);
  const ano = parseInt(partesData[2], 10);

  // Sufixo do ano: A=2025, B=2026, C=2027...
  const sufixoAno = ano >= 2025 ? ' ' + String.fromCharCode(65 + (ano - 2025)) : '';

  // Semana de trabalho (segunda a sexta) que contém a data
  const dataObj = new Date(ano, mes - 1, dia);
  const diaSemana = dataObj.getDay();
  const segunda = new Date(dataObj);
  segunda.setDate(dataObj.getDate() + (diaSemana === 0 ? -6 : 1 - diaSemana));
  const sexta = new Date(segunda);
  sexta.setDate(segunda.getDate() + 4);

  const dois = (n) => (n < 10 ? '0' + n : '' + n);
  const nomePadrao = '783 (' + dois(segunda.getDate()) + '/' + dois(segunda.getMonth() + 1) +
    ' - ' + dois(sexta.getDate()) + '/' + dois(sexta.getMonth() + 1) + ')' + sufixoAno;

  const direto = spreadsheet.getSheetByName(nomePadrao);
  if (direto) {
    return direto;
  }

  // Fallback: varre as abas e interpreta o período do nome
  const sheets = spreadsheet.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    const nomeAba = sheets[i].getName();

    if (nomeAba.indexOf('783') === -1) continue;
    if (nomeAba.toLowerCase().indexOf('modelo') !== -1) continue;
    if (sufixoAno && !nomeAba.trim().endsWith(sufixoAno)) continue;

    // Formato completo: DD/MM - DD/MM
    let match = nomeAba.match(/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/);
    if (match) {
      if (verificarDataNoPeriodo(dia, mes, parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10), parseInt(match[4], 10))) {
        return sheets[i];
      }
      continue;
    }

    // Formato abreviado: (DD - DD/MM), mesmo mês
    match = nomeAba.match(/\((\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})\)/);
    if (match) {
      const mesAba = parseInt(match[3], 10);
      if (verificarDataNoPeriodo(dia, mes, parseInt(match[1], 10), mesAba, parseInt(match[2], 10), mesAba)) {
        return sheets[i];
      }
    }
  }

  return null;
}

/**
 * Verifica se uma data (dia/mês) está dentro de um período, inclusive
 * períodos que cruzam meses (ex.: 30/11 - 04/12).
 */
function verificarDataNoPeriodo(dia, mes, diaInicio, mesInicio, diaFim, mesFim) {
  if (mesInicio === mesFim) {
    return mes === mesInicio && dia >= diaInicio && dia <= diaFim;
  }
  if (mes === mesInicio && dia >= diaInicio) return true;
  if (mes === mesFim && dia <= diaFim) return true;
  return false;
}

/**
 * Encontra a linha que tem "reservado" na coluna indicada, com data (coluna C,
 * tratando células mescladas) e horário correspondentes.
 * Retorna o número da linha (1-indexed) ou -1.
 */
function encontrarLinhaReservada(sheet, dataStr, horaStr, colunaReservado, colunaHorario) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const dados = sheet.getRange(1, 1, lastRow, Math.max(colunaReservado, colunaHorario, 3)).getDisplayValues();

  const idxData = 2; // Coluna C
  const idxHora = colunaHorario - 1;
  const idxReservado = colunaReservado - 1;

  let ultimaDataEncontrada = '';

  for (let i = 0; i < dados.length; i++) {
    let dataLinha = (dados[i][idxData] || '').toString().trim();
    const horaLinha = (dados[i][idxHora] || '').toString().trim();
    const nomeLinha = (dados[i][idxReservado] || '').toString().toLowerCase().trim();

    // Células mescladas de data: usa a última data vista
    if (dataLinha) {
      ultimaDataEncontrada = dataLinha;
    } else {
      dataLinha = ultimaDataEncontrada;
    }

    if (nomeLinha !== PALAVRA_RESERVADO) continue;
    if (!compararHoras(formatarHoraParaTexto(horaLinha), horaStr)) continue;

    // A data na aba pode estar como dd/MM ou dd/MM/yyyy dentro de um texto
    const matchData = dataLinha.match(/(\d{1,2})\/(\d{1,2})/);
    if (!matchData) continue;

    const partes = dataStr.split('/');
    const diaOk = matchData[1].replace(/^0/, '') === partes[0].replace(/^0/, '');
    const mesOk = matchData[2].replace(/^0/, '') === partes[1].replace(/^0/, '');

    if (diaOk && mesOk) {
      return i + 1;
    }
  }

  return -1;
}

// ====== FORMATAÇÃO / COMPARAÇÃO ======

/** Data da célula (Date ou texto) -> "dd/MM/yyyy" */
function formatarDataCelula(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, 'America/Sao_Paulo', 'dd/MM/yyyy');
  }
  const texto = (valor || '').toString().trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(texto)) return texto;
  const d = new Date(valor);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy');
  }
  return texto;
}

/** Hora da célula (Date ou texto) -> "HH:mm" */
function formatarHoraCelula(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, 'America/Sao_Paulo', 'HH:mm');
  }
  return formatarHoraParaTexto((valor || '').toString().trim());
}

/** Normaliza texto de hora ("8:00" -> "08:00") */
function formatarHoraParaTexto(texto) {
  if (/^\d{2}:\d{2}$/.test(texto)) return texto;
  if (/^\d{1}:\d{2}$/.test(texto)) return '0' + texto;
  const d = new Date(texto);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'America/Sao_Paulo', 'HH:mm');
  }
  return texto;
}

/** Compara datas dd/MM/yyyy ignorando zeros à esquerda */
function compararDatas(data1, data2) {
  if (!data1 || !data2) return false;
  const normalizar = (d) => {
    const partes = d.split('/');
    if (partes.length !== 3) return d;
    return partes[0].replace(/^0+/, '') + '/' + partes[1].replace(/^0+/, '') + '/' + partes[2];
  };
  return normalizar(data1) === normalizar(data2);
}

/** Compara horas HH:mm ignorando zeros à esquerda */
function compararHoras(hora1, hora2) {
  if (!hora1 || !hora2) return false;
  const normalizar = (h) => {
    const partes = h.split(':');
    if (partes.length !== 2) return h;
    return partes[0].replace(/^0+/, '') + ':' + partes[1].replace(/^0+/, '');
  };
  return normalizar(hora1) === normalizar(hora2);
}

// ====== PLANILHA DE TRIAGEM ======

/**
 * Registra os dados da triagem (pré-natal/puericultura) em planilha separada.
 */
function registrarTriagem(dataConsulta, horaConsulta, dados, profissional) {
  const sheetTriagem = SpreadsheetApp.openById(SHEET_TRIAGEM_ID);
  let aba = sheetTriagem.getSheetByName('Triagem');

  if (!aba) {
    aba = sheetTriagem.insertSheet('Triagem');
    aba.appendRow([
      'Timestamp', 'Tipo', 'Nome', 'Data Nascimento', 'Motivo',
      'Data Consulta', 'Hora Consulta', 'Profissional',
      'Última Consulta', 'Data Última Consulta', 'Semanas Gestacionais',
      'Número Semanas', 'Último Profissional (PN)',
      'Meses Criança', 'Última Consulta (meses)', 'Último Profissional (PC)'
    ]);
  }

  const triagem = dados.triagem || {};

  aba.appendRow([
    new Date(),
    triagem.tipo || '',
    dados.nome || '',
    dados.dataNascimento || '',
    dados.observacoes || '',
    dataConsulta,
    horaConsulta,
    profissional,
    triagem.ultimaConsulta || '',
    triagem.dataUltimaConsulta || '',
    triagem.semanasGestacao || '',
    triagem.numeroSemanas || '',
    triagem.tipo === 'pre-natal' ? (triagem.ultimoProfissional || '') : '',
    triagem.mesesCrianca || '',
    triagem.ultimaConsultaMeses || '',
    triagem.tipo === 'puericultura' ? (triagem.ultimoProfissional || '') : ''
  ]);
}

// ====== MIGRAÇÃO DA ABA AGENDAMENTOS (EXECUTAR UMA VEZ) ======

/**
 * Arruma as linhas ANTIGAS da aba Agendamentos para o formato novo.
 *
 *   Antigo: Timestamp | Data | Hora | Nome | Data Nasc. | Motivo | Telefone
 *   Novo:   Timestamp | Data | Hora | Nome | Motivo     | Telefone
 *
 * COMO EXECUTAR: no editor do Apps Script, escolha "migrarAbaAgendamentos"
 * na barra de cima e clique em Executar. Rode UMA VEZ só.
 *
 * - Linhas antigas: a data de nascimento (coluna E) é descartada e
 *   Motivo/Telefone sobem uma coluna.
 * - Linhas que já estão no formato novo são detectadas e não são tocadas
 *   (dá para rodar de novo sem estragar nada).
 * - O cabeçalho é atualizado.
 */
function migrarAbaAgendamentos() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_AGENDAMENTOS);
    if (!sheet) throw new Error('Aba "' + SHEET_AGENDAMENTOS + '" não encontrada.');

    // Cabeçalho novo (limpa o G1, que era o Telefone antigo)
    sheet.getRange(1, 1, 1, 7).setValues([['Timestamp', 'Data', 'Hora', 'Nome', 'Motivo', 'Telefone', '']]);

    const lastRow = sheet.getLastRow();
    let migradas = 0;
    let jaNovas = 0;

    if (lastRow >= 2) {
      const valores = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      const display = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();

      for (let i = 0; i < valores.length; i++) {
        const colE = (display[i][4] || '').toString().trim(); // 5ª coluna
        const colF = (display[i][5] || '').toString().trim(); // 6ª coluna
        const colG = (display[i][6] || '').toString().trim(); // 7ª coluna

        // No formato antigo a coluna E era a data de nascimento
        const pareceDataNascimento =
          valores[i][4] instanceof Date || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(colE);

        // É formato antigo se: tem telefone na G, ou a E parece data de
        // nascimento, ou a E está vazia mas a F tem o motivo
        const formatoAntigo = colG !== '' || pareceDataNascimento || (colE === '' && colF !== '');

        if (!formatoAntigo) {
          jaNovas++;
          continue;
        }

        const motivo = valores[i][5];   // F antiga
        const telefone = valores[i][6]; // G antiga
        sheet.getRange(i + 2, 5, 1, 3).setValues([[motivo, telefone, '']]);
        migradas++;
      }
    }

    SpreadsheetApp.flush();
    const resumo = 'Migração concluída: ' + migradas + ' linha(s) arrumada(s); ' +
      jaNovas + ' já estava(m) no formato novo.';
    Logger.log(resumo);
    return resumo;
  } finally {
    try { lock.releaseLock(); } catch (ignorado) {}
  }
}
