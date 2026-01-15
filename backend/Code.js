// ====== CONFIGURAÇÕES ======
const SHEET_ID = '15DF8LfTpuRw47etH-gZX49zwUebTUPB2FxtHibPtmY4';
const SHEET_HORARIOS = 'Horarios';
const SHEET_AGENDAMENTOS = 'Agendamentos';

// Planilha geral do posto de saúde (onde você realmente atende)
const SHEET_POSTO_ID = '1fpwmi85pLQWPQrKJiawZOrSOip8MQlsfmyUpIU1wGlk';

// Planilha de triagem (pré-natal/puericultura)
const SHEET_TRIAGEM_ID = '1Ih-PMnTW698l-pqJks69qBn0QOQXSH3ZfcJKY6YhvOA';

// ====== FUNÇÃO DE TESTE - Execute para debugar ======
function testarBuscaReservado() {
  // ALTERE ESTES VALORES PARA TESTAR:
  const dataParaTestar = '12/12/2024';
  const horaParaTestar = '09:00';
  
  Logger.log('========== TESTE DE BUSCA ==========');
  Logger.log('Data: ' + dataParaTestar);
  Logger.log('Hora: ' + horaParaTestar);
  
  try {
    const ssPosto = SpreadsheetApp.openById(SHEET_POSTO_ID);
    Logger.log('✅ Abriu planilha do posto');
    
    // Lista todas as abas
    const todasAbas = ssPosto.getSheets();
    Logger.log('Abas encontradas:');
    todasAbas.forEach(aba => {
      Logger.log('  - ' + aba.getName());
    });
    
    // Busca a aba 783
    const sheetPosto = encontrarAbaEquipe783PorData(ssPosto, dataParaTestar);
    
    if (sheetPosto) {
      Logger.log('✅ Aba encontrada: ' + sheetPosto.getName());
      
      // Busca a linha reservada
      const linha = encontrarLinhaReservada(sheetPosto, dataParaTestar, horaParaTestar);
      
      if (linha > 0) {
        Logger.log('✅ Linha com reservado encontrada: ' + linha);
        
        // Mostra o conteúdo da linha
        const dadosLinha = sheetPosto.getRange(linha, 1, 1, 8).getDisplayValues()[0];
        Logger.log('Conteúdo da linha:');
        Logger.log('  A: ' + dadosLinha[0]);
        Logger.log('  B: ' + dadosLinha[1]);
        Logger.log('  C (Data): ' + dadosLinha[2]);
        Logger.log('  D: ' + dadosLinha[3]);
        Logger.log('  E (Hora): ' + dadosLinha[4]);
        Logger.log('  F (Nome): ' + dadosLinha[5]);
        Logger.log('  G (DN): ' + dadosLinha[6]);
        Logger.log('  H (Motivo): ' + dadosLinha[7]);
      } else {
        Logger.log('❌ Linha com "reservado" NÃO encontrada');
        
        // Mostra algumas linhas para debug
        Logger.log('Primeiras 20 linhas da aba:');
        const dados = sheetPosto.getRange(1, 1, Math.min(20, sheetPosto.getLastRow()), 8).getDisplayValues();
        dados.forEach((row, i) => {
          Logger.log('Linha ' + (i+1) + ': C="' + row[2] + '" E="' + row[4] + '" F="' + row[5] + '"');
        });
      }
    } else {
      Logger.log('❌ Aba 783 NÃO encontrada para a data ' + dataParaTestar);
    }
  } catch (erro) {
    Logger.log('❌ ERRO: ' + erro.message);
  }
  
  Logger.log('========== FIM DO TESTE ==========');
}

// ====== ENDPOINTS (API) ======

/**
 * GET:
 *  - ?action=getSlots  -> retorna lista de horários LIVRES em JSON
 */
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'getSlots') {
    const slots = getAvailableSlots();
    return ContentService
      .createTextOutput(JSON.stringify(slots))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Resposta padrão pra ação inválida
  return ContentService
    .createTextOutput(JSON.stringify({ error: 'Ação inválida' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST:
 *  - corpo JSON com { rowIndex, nome, telefone, observacoes }
 *  - grava na planilha e retorna JSON com mensagem
 */
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const res = bookSlot(data);

  return ContentService
    .createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====== LÓGICA DE NEGÓCIO ======

/**
 * Lê a aba Horarios e devolve só horários LIVRES já formatados
 */
function getAvailableSlots() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_HORARIOS);

  if (!sheet) {
    throw new Error('A aba "Horarios" não foi encontrada na planilha.');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  // Linha 2 até a última, colunas A (Data), B (Hora), C (Status)
  const range = sheet.getRange(2, 1, lastRow - 1, 3);
  const values = range.getValues();

  const slots = [];

  values.forEach((row, index) => {
    const dataCell = row[0];
    const horaCell = row[1];
    const status = (row[2] || '').toString().toUpperCase().trim();

    if (status === 'LIVRE') {
      const rowIndex = index + 2;

      const dataObj = new Date(dataCell);

      const dataStr = Utilities.formatDate(
        dataObj,
        'America/Sao_Paulo',
        'dd/MM/yyyy'
      );

      const horaStr = Utilities.formatDate(
        new Date(horaCell),
        'America/Sao_Paulo',
        'HH:mm'
      );

      const diasSemana = [
        'Domingo',
        'Segunda-feira',
        'Terça-feira',
        'Quarta-feira',
        'Quinta-feira',
        'Sexta-feira',
        'Sábado'
      ];
      const diaSemana = diasSemana[dataObj.getDay()];

      slots.push({
        rowIndex: rowIndex,
        data: dataStr,
        hora: horaStr,
        diaSemana: diaSemana
      });
    }
  });

  return slots;
}

/**
 * Registra o agendamento e EXCLUI a linha do horário
 */
function bookSlot(bookingData) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheetHor = ss.getSheetByName(SHEET_HORARIOS);
  const sheetAg = ss.getSheetByName(SHEET_AGENDAMENTOS);

  const rowIndex = bookingData.rowIndex;
  const nome = bookingData.nome;
  const telefone = bookingData.telefone;
  const dataNascimento = bookingData.dataNascimento || '';
  const observacoes = bookingData.observacoes || '';

  const row = sheetHor.getRange(rowIndex, 1, 1, 3).getValues()[0];
  const statusAtual = (row[2] || '').toString().toUpperCase().trim();

  if (statusAtual !== 'LIVRE') {
    throw new Error('Esse horário acabou de ser ocupado. Por favor, escolha outro.');
  }

  // Guarda os dados ANTES de excluir a linha
  const data = row[0];
  const hora = row[1];

  // EXCLUI a linha do horário (em vez de marcar como OCUPADO)
  sheetHor.deleteRow(rowIndex);

  // Formata a hora para HH:mm (sem segundos)
  const horaFormatada = Utilities.formatDate(
    new Date(hora),
    'America/Sao_Paulo',
    'HH:mm'
  );

  // Formata a data para dd/MM/yyyy
  const dataFormatada = Utilities.formatDate(
    new Date(data),
    'America/Sao_Paulo',
    'dd/MM/yyyy'
  );

  // Registra o agendamento na planilha pessoal
  // Ordem: Timestamp, Data, Hora, Nome, DN, Observacoes, Telefone
  sheetAg.appendRow([
    new Date(), // Timestamp
    dataFormatada,
    horaFormatada,
    nome,
    dataNascimento,
    observacoes,
    telefone
  ]);

  // ====== REGISTRA NA PLANILHA GERAL DO POSTO DE SAÚDE ======
  try {
    const ssPosto = SpreadsheetApp.openById(SHEET_POSTO_ID);
    
    // Busca a aba da equipe 783 que contém a data do agendamento
    const sheetPosto = encontrarAbaEquipe783PorData(ssPosto, dataFormatada);
    
    if (sheetPosto) {
      // Procura a linha que tem "reservado" com a mesma data e horário
      const linhaEncontrada = encontrarLinhaReservada(sheetPosto, dataFormatada, horaFormatada);
      
      if (linhaEncontrada > 0) {
        // Substitui "reservado" pelos dados do paciente
        // D = "app", F = Nome, G = DN, H = Motivo
        sheetPosto.getRange(linhaEncontrada, 4).setValue('app');            // Coluna D - Marcado pelo app
        sheetPosto.getRange(linhaEncontrada, 6).setValue(nome);             // Coluna F - Nome
        sheetPosto.getRange(linhaEncontrada, 7).setValue(dataNascimento);   // Coluna G - Data de Nascimento
        sheetPosto.getRange(linhaEncontrada, 8).setValue(observacoes);      // Coluna H - Motivo
        Logger.log('Dados preenchidos na linha ' + linhaEncontrada + ' da planilha do posto (marcado como app)');
      } else {
        Logger.log('Linha com "reservado" não encontrada para data ' + dataFormatada + ' e hora ' + horaFormatada);
      }
    } else {
      Logger.log('Aba da equipe 783 não encontrada para a data ' + dataFormatada);
    }
  } catch (erroPosto) {
    // Se der erro ao registrar no posto, não impede o agendamento principal
    Logger.log('Erro ao registrar na planilha do posto: ' + erroPosto.message);
  }

  // ====== REGISTRA NA PLANILHA DE TRIAGEM (PRÉ-NATAL/PUERICULTURA) ======
  try {
    registrarTriagem(dataFormatada, horaFormatada, bookingData, 'Médico');
  } catch (erroTriagem) {
    Logger.log('[MED] Erro ao registrar na planilha de triagem: ' + erroTriagem.message);
  }

  return {
    sucesso: true,
    mensagem: 'Agendamento realizado com sucesso!',
    data: data,
    hora: hora
  };
}

/**
 * Encontra a aba da equipe 783 que contém a data especificada
 * Formato da aba: "783 (08/12 - 12/12) A" onde A=2025, B=2026
 * 
 * OTIMIZADO: Tenta adivinhar o nome da aba primeiro (instantâneo!)
 * Se não encontrar, faz busca filtrada como fallback
 */
function encontrarAbaEquipe783PorData(spreadsheet, dataStr) {
  // Converte a data do agendamento para comparação (DD/MM/YYYY)
  const partesData = dataStr.split('/');
  const diaAgendamento = parseInt(partesData[0], 10);
  const mesAgendamento = parseInt(partesData[1], 10);
  const anoAgendamento = parseInt(partesData[2], 10);
  
  // Define o sufixo baseado no ano: A=2025, B=2026
  let sufixoAno = '';
  if (anoAgendamento === 2025) {
    sufixoAno = ' A';
  } else if (anoAgendamento === 2026) {
    sufixoAno = ' B';
  }
  
  // ========== OTIMIZAÇÃO: TENTAR ADIVINHAR O NOME DA ABA ==========
  // Calcula a semana de trabalho (segunda a sexta) que contém a data
  const dataObj = new Date(anoAgendamento, mesAgendamento - 1, diaAgendamento);
  const diaSemana = dataObj.getDay(); // 0=dom, 1=seg, ..., 5=sex, 6=sab
  
  // Encontra a segunda-feira da semana
  let diasAteSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segunda = new Date(dataObj);
  segunda.setDate(dataObj.getDate() + diasAteSegunda);
  
  // Encontra a sexta-feira da semana
  const sexta = new Date(segunda);
  sexta.setDate(segunda.getDate() + 4);
  
  const diaIni = segunda.getDate();
  const mesIni = segunda.getMonth() + 1;
  const diaFim = sexta.getDate();
  const mesFim = sexta.getMonth() + 1;
  
  // Formata com zero à esquerda
  const diaIniStr = diaIni < 10 ? '0' + diaIni : '' + diaIni;
  const mesIniStr = mesIni < 10 ? '0' + mesIni : '' + mesIni;
  const diaFimStr = diaFim < 10 ? '0' + diaFim : '' + diaFim;
  const mesFimStr = mesFim < 10 ? '0' + mesFim : '' + mesFim;
  
  Logger.log('Buscando aba 783 para ' + dataStr);
  Logger.log('Semana calculada: ' + diaIni + '/' + mesIni + ' - ' + diaFim + '/' + mesFim);
  Logger.log('Sufixo do ano: "' + sufixoAno + '"');
  
  // Tenta vários formatos de nome comuns
  const tentativas = [
    '783 (' + diaIniStr + '/' + mesIniStr + ' - ' + diaFimStr + '/' + mesFimStr + ')' + sufixoAno,
    ' 783 (' + diaIniStr + '/' + mesIniStr + ' - ' + diaFimStr + '/' + mesFimStr + ')' + sufixoAno,
    '783 (' + diaIni + '/' + mesIni + ' - ' + diaFim + '/' + mesFim + ')' + sufixoAno,
    '783(' + diaIniStr + '/' + mesIniStr + ' - ' + diaFimStr + '/' + mesFimStr + ')' + sufixoAno,
    '783 (' + diaIni + '/' + mesIniStr + '-' + diaFim + '/' + mesFimStr + ')' + sufixoAno,
    '783 (' + diaIniStr + '/' + mesIniStr + '-' + diaFimStr + '/' + mesFimStr + ')' + sufixoAno,
    '783 (' + diaIni + '-' + diaFim + '/' + mesIniStr + ')' + sufixoAno,
    '783 (' + diaIniStr + '-' + diaFimStr + '/' + mesIniStr + ')' + sufixoAno,
  ];
  
  Logger.log('Tentando encontrar por nome direto:');
  
  // Tenta encontrar por nome direto (MUITO RÁPIDO!)
  for (let i = 0; i < tentativas.length; i++) {
    Logger.log('  Tentativa ' + (i+1) + ': "' + tentativas[i] + '"');
    const sheet = spreadsheet.getSheetByName(tentativas[i]);
    if (sheet) {
      Logger.log('✅ ENCONTRADA! Aba: ' + tentativas[i]);
      return sheet;
    }
  }
  
  Logger.log('Nome direto não encontrado, fazendo busca filtrada...');
  
  // ========== FALLBACK: BUSCA FILTRADA ==========
  const sheets = spreadsheet.getSheets();
  
  // Filtra: só abas que contêm "783", não são modelo, e têm o sufixo certo
  for (let i = 0; i < sheets.length; i++) {
    const nomeAba = sheets[i].getName();
    
    // Filtro rápido
    if (nomeAba.indexOf('783') === -1) continue;
    if (nomeAba.toLowerCase().indexOf('modelo') !== -1) continue;
    
    // Filtro de sufixo
    if (sufixoAno) {
      const nomeAbaTrimmed = nomeAba.trim();
      if (!nomeAbaTrimmed.endsWith(sufixoAno.trim())) continue;
    }
    
    // Verifica se a data está no período
    const match = nomeAba.match(/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/);
    if (match) {
      const diaInicio = parseInt(match[1], 10);
      const mesInicio = parseInt(match[2], 10);
      const diaFimAba = parseInt(match[3], 10);
      const mesFimAba = parseInt(match[4], 10);
      
      if (verificarDataNoPeriodo(diaAgendamento, mesAgendamento, diaInicio, mesInicio, diaFimAba, mesFimAba)) {
        Logger.log('✅ Aba encontrada por busca: ' + nomeAba);
        return sheets[i];
      }
    }
  }
  
  Logger.log('❌ Nenhuma aba encontrada para a data ' + dataStr);
  return null;
}

/**
 * Verifica se uma data está dentro de um período
 */
function verificarDataNoPeriodo(dia, mes, diaInicio, mesInicio, diaFim, mesFim) {
  // Mesmo mês início e fim
  if (mesInicio === mesFim) {
    return mes === mesInicio && dia >= diaInicio && dia <= diaFim;
  }
  
  // Período cruza meses (ex: 30/11 - 04/12)
  if (mes === mesInicio && dia >= diaInicio) {
    return true;
  }
  if (mes === mesFim && dia <= diaFim) {
    return true;
  }
  
  return false;
}

/**
 * Encontra a linha que tem "reservado" na coluna F com a data e horário correspondentes
 * Coluna C = Data (pode estar mesclada), Coluna E = Horário, Coluna F = Nome (onde está "reservado")
 */
function encontrarLinhaReservada(sheet, dataStr, horaStr) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  
  // Lê todas as colunas
  const dados = sheet.getRange(1, 1, lastRow, 8).getDisplayValues();
  
  // Extrai dia e mês da data do agendamento (formato DD/MM/YYYY)
  const partesData = dataStr.split('/');
  const diaAgendamento = partesData[0].replace(/^0/, ''); // Remove zero à esquerda
  const mesAgendamento = partesData[1].replace(/^0/, ''); // Remove zero à esquerda
  
  // Normaliza a hora (remove zero à esquerda se houver)
  const horaAgendamento = horaStr.replace(/^0/, '');
  
  Logger.log('Buscando: dia=' + diaAgendamento + ', mês=' + mesAgendamento + ', hora=' + horaAgendamento);
  
  // Guarda a última data encontrada (para lidar com células mescladas)
  let ultimaDataEncontrada = '';
  
  for (let i = 0; i < dados.length; i++) {
    let dataLinha = (dados[i][2] || '').toString().trim(); // Coluna C (índice 2)
    const horaLinha = (dados[i][4] || '').toString().trim(); // Coluna E (índice 4)
    const nomeLinha = (dados[i][5] || '').toString().toLowerCase().trim(); // Coluna F (índice 5)
    
    // Se a célula da data está vazia, usa a última data encontrada (célula mesclada)
    if (dataLinha) {
      ultimaDataEncontrada = dataLinha;
    } else {
      dataLinha = ultimaDataEncontrada;
    }
    
    // Verifica se é "reservado"
    if (nomeLinha !== 'reservado') {
      continue;
    }
    
    // Compara o horário (com e sem zero à esquerda)
    const horaLinhaLimpa = horaLinha.replace(/^0/, '');
    const horaMatch = horaLinha === horaStr || horaLinhaLimpa === horaAgendamento;
    
    if (!horaMatch) {
      continue;
    }
    
    // Compara a data
    // A data na planilha pode estar em vários formatos: "9/12", "09/12", "9/12/2024", etc.
    let dataMatch = false;
    
    // Extrai dia/mês da data da linha
    const matchData = dataLinha.match(/(\d{1,2})\/(\d{1,2})/);
    if (matchData) {
      const diaLinha = matchData[1].replace(/^0/, '');
      const mesLinha = matchData[2].replace(/^0/, '');
      dataMatch = (diaLinha === diaAgendamento && mesLinha === mesAgendamento);
    }
    
    Logger.log('Linha ' + (i+1) + ': data="' + dataLinha + '", hora="' + horaLinha + '", nome="' + nomeLinha + '", dataMatch=' + dataMatch + ', horaMatch=' + horaMatch);
    
    if (dataMatch && horaMatch) {
      Logger.log('ENCONTROU na linha ' + (i + 1));
      return i + 1; // Retorna o número da linha (1-indexed)
    }
  }
  
  Logger.log('Não encontrou linha com reservado para ' + dataStr + ' ' + horaStr);
  return -1; // Não encontrou
}

/**
 * Encontra a aba da equipe 783 na planilha do posto (versão simples)
 * Ignora a aba "783 (modelo)" e busca a aba atual
 */
function encontrarAbaEquipe783(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  
  for (let i = 0; i < sheets.length; i++) {
    const nomeAba = sheets[i].getName();
    
    // Verifica se contém "783" mas NÃO é a aba modelo
    if (nomeAba.indexOf('783') !== -1 && nomeAba.toLowerCase().indexOf('modelo') === -1) {
      return sheets[i];
    }
  }
  
  return null;
}

// ====== REGISTRAR NA PLANILHA DE TRIAGEM ======
/**
 * Registra os dados da triagem (pré-natal/puericultura) em planilha separada
 */
function registrarTriagem(dataConsulta, horaConsulta, dados, profissional) {
  try {
    const sheetTriagem = SpreadsheetApp.openById(SHEET_TRIAGEM_ID);
    let aba = sheetTriagem.getSheetByName('Triagem');
    
    // Se a aba não existir, cria com cabeçalho
    if (!aba) {
      aba = sheetTriagem.insertSheet('Triagem');
      aba.appendRow([
        'Timestamp',
        'Tipo',
        'Nome',
        'Data Nascimento',
        'Motivo',
        'Data Consulta',
        'Hora Consulta',
        'Profissional',
        // Pré-natal
        'Última Consulta',
        'Data Última Consulta',
        'Semanas Gestacionais',
        'Número Semanas',
        'Último Profissional (PN)',
        // Puericultura
        'Meses Criança',
        'Última Consulta (meses)',
        'Último Profissional (PC)'
      ]);
    }
    
    const triagem = dados.triagem || {};
    
    // Monta a linha com todos os dados
    const linha = [
      new Date(),                                    // A: Timestamp
      triagem.tipo || '',                            // B: Tipo (pre-natal / puericultura)
      dados.nome || '',                              // C: Nome
      dados.dataNascimento || '',                    // D: Data Nascimento
      dados.observacoes || '',                       // E: Motivo
      dataConsulta,                                  // F: Data Consulta
      horaConsulta,                                  // G: Hora Consulta
      profissional,                                  // H: Profissional (Enfermagem/Médico)
      // Pré-natal
      triagem.ultimaConsulta || '',                  // I: Última Consulta (data/primeira)
      triagem.dataUltimaConsulta || '',              // J: Data Última Consulta
      triagem.semanasGestacao || '',                 // K: Semanas Gestacionais (semanas/nao_lembro)
      triagem.numeroSemanas || '',                   // L: Número Semanas
      triagem.tipo === 'pre-natal' ? triagem.ultimoProfissional : '', // M: Último Profissional (PN)
      // Puericultura
      triagem.mesesCrianca || '',                    // N: Meses Criança
      triagem.ultimaConsultaMeses || '',             // O: Última Consulta (meses)
      triagem.tipo === 'puericultura' ? triagem.ultimoProfissional : '' // P: Último Profissional (PC)
    ];
    
    aba.appendRow(linha);
    Logger.log('[TRIAGEM] Dados registrados com sucesso');
    
  } catch (error) {
    Logger.log('[TRIAGEM] Erro ao registrar: ' + error.message);
    throw error;
  }
}
