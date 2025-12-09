// ====== CONFIGURAÇÕES ======
const SHEET_ID = '15DF8LfTpuRw47etH-gZX49zwUebTUPB2FxtHibPtmY4';
const SHEET_HORARIOS = 'Horarios';
const SHEET_AGENDAMENTOS = 'Agendamentos';

// Planilha geral do posto de saúde (onde você realmente atende)
const SHEET_POSTO_ID = '1fpwmi85pLQWPQrKJiawZOrSOip8MQlsfmyUpIU1wGlk';

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
        // F = Nome, G = DN, H = Motivo
        sheetPosto.getRange(linhaEncontrada, 6).setValue(nome);             // Coluna F - Nome
        sheetPosto.getRange(linhaEncontrada, 7).setValue(dataNascimento);   // Coluna G - Data de Nascimento
        sheetPosto.getRange(linhaEncontrada, 8).setValue(observacoes);      // Coluna H - Motivo
        Logger.log('Dados preenchidos na linha ' + linhaEncontrada + ' da planilha do posto');
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

  return {
    sucesso: true,
    mensagem: 'Agendamento realizado com sucesso!',
    data: data,
    hora: hora
  };
}

/**
 * Encontra a aba da equipe 783 que contém a data especificada
 * As abas têm formato "783 (08/12 - 12/12)" indicando o período
 */
function encontrarAbaEquipe783PorData(spreadsheet, dataStr) {
  const sheets = spreadsheet.getSheets();
  
  // Converte a data do agendamento para comparação (DD/MM/YYYY -> Date)
  const partesData = dataStr.split('/');
  const diaAgendamento = parseInt(partesData[0], 10);
  const mesAgendamento = parseInt(partesData[1], 10);
  
  for (let i = 0; i < sheets.length; i++) {
    const nomeAba = sheets[i].getName();
    
    // Verifica se contém "783" mas NÃO é a aba modelo
    if (nomeAba.indexOf('783') !== -1 && nomeAba.toLowerCase().indexOf('modelo') === -1) {
      // Tenta extrair as datas do nome da aba (ex: "783 (08/12 - 12/12)")
      const match = nomeAba.match(/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/);
      
      if (match) {
        const diaInicio = parseInt(match[1], 10);
        const mesInicio = parseInt(match[2], 10);
        const diaFim = parseInt(match[3], 10);
        const mesFim = parseInt(match[4], 10);
        
        // Verifica se a data do agendamento está no período da aba
        // Simplificado: verifica se o mês é igual e o dia está no intervalo
        if (mesAgendamento === mesInicio && mesAgendamento === mesFim) {
          if (diaAgendamento >= diaInicio && diaAgendamento <= diaFim) {
            return sheets[i];
          }
        }
        // Caso o período cruze meses (ex: 30/11 - 04/12)
        else if (mesAgendamento === mesInicio && diaAgendamento >= diaInicio) {
          return sheets[i];
        }
        else if (mesAgendamento === mesFim && diaAgendamento <= diaFim) {
          return sheets[i];
        }
      } else {
        // Se não conseguiu extrair as datas, retorna a primeira aba 783 encontrada
        return sheets[i];
      }
    }
  }
  
  return null;
}

/**
 * Encontra a linha que tem "reservado" na coluna F com a data e horário correspondentes
 * Coluna C = Data, Coluna E = Horário, Coluna F = Nome (onde está "reservado")
 */
function encontrarLinhaReservada(sheet, dataStr, horaStr) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  
  // Lê as colunas C (data), E (horário) e F (nome)
  // C=3, E=5, F=6
  const dados = sheet.getRange(1, 1, lastRow, 8).getDisplayValues();
  
  // Normaliza a data e hora para comparação
  const dataNormalizada = dataStr.trim();
  const horaNormalizada = horaStr.trim();
  
  for (let i = 0; i < dados.length; i++) {
    const dataLinha = (dados[i][2] || '').toString().trim(); // Coluna C (índice 2)
    const horaLinha = (dados[i][4] || '').toString().trim(); // Coluna E (índice 4)
    const nomeLinha = (dados[i][5] || '').toString().toLowerCase().trim(); // Coluna F (índice 5)
    
    // Verifica se a data contém o dia/mês do agendamento
    // E se o horário bate
    // E se o nome é "reservado"
    const dataMatch = dataLinha === dataNormalizada || 
                      dataLinha.indexOf(dataNormalizada.substring(0, 5)) !== -1; // Compara DD/MM
    
    if (dataMatch && horaLinha === horaNormalizada && nomeLinha === 'reservado') {
      return i + 1; // Retorna o número da linha (1-indexed)
    }
  }
  
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
