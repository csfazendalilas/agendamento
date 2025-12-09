// ====== TRIGGER PARA PLANILHA DO POSTO DE SAÚDE ======
// Este código deve ser adicionado ao Google Apps Script da planilha do posto
// Planilha: 1fpwmi85pLQWPQrKJiawZOrSOip8MQlsfmyUpIU1wGlk

// ID da sua planilha de agendamentos
const PLANILHA_AGENDAMENTOS_ID = '15DF8LfTpuRw47etH-gZX49zwUebTUPB2FxtHibPtmY4';
const ABA_HORARIOS = 'Horarios';

/**
 * IMPORTANTE: Execute esta função UMA VEZ para criar o trigger instalável
 * Vá em Executar > criarTriggerInstalavel
 */
function criarTriggerInstalavel() {
  // Remove triggers antigos desta função
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onEditInstalavel') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Cria novo trigger instalável
  ScriptApp.newTrigger('onEditInstalavel')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
    
  SpreadsheetApp.getUi().alert('Trigger criado com sucesso! Agora quando você escrever "reservado" na coluna F, o horário será liberado automaticamente.');
}

/**
 * Função chamada pelo trigger instalável (tem permissões para acessar outras planilhas)
 */
function onEditInstalavel(e) {
  processarEdicao(e);
}

/**
 * Função chamada pelo trigger simples (backup, caso funcione)
 */
function onEdit(e) {
  processarEdicao(e);
}

/**
 * Processa a edição - verifica se é "reservado" na coluna F de uma aba 783
 */
function processarEdicao(e) {
  if (!e || !e.source || !e.range) {
    Logger.log('Evento inválido');
    return;
  }
  
  const sheet = e.source.getActiveSheet();
  const range = e.range;
  const nomeAba = sheet.getName();
  
  // Verifica se é uma aba da equipe 783 (não modelo)
  if (nomeAba.indexOf('783') === -1 || nomeAba.toLowerCase().indexOf('modelo') !== -1) {
    return; // Não é a aba certa, ignora
  }
  
  // Verifica se a edição foi na coluna F (coluna 6)
  if (range.getColumn() !== 6) {
    return; // Não é a coluna F, ignora
  }
  
  // Verifica se o valor é "reservado" (case insensitive)
  const valor = (range.getValue() || '').toString().toLowerCase().trim();
  if (valor !== 'reservado') {
    return; // Não é "reservado", ignora
  }
  
  // Pega a linha que foi editada
  const linha = range.getRow();
  
  // Pega o horário (coluna E = 5) da mesma linha
  const horarioValor = sheet.getRange(linha, 5).getValue();
  const horarioTexto = sheet.getRange(linha, 5).getDisplayValue();
  const horario = horarioTexto || horarioValor;
  
  // A data pode estar em uma célula mesclada acima
  // Busca a data subindo nas linhas até encontrar
  let dataTexto = '';
  let linhaAtual = linha;
  
  while (linhaAtual >= 1 && !dataTexto) {
    dataTexto = sheet.getRange(linhaAtual, 3).getDisplayValue();
    if (!dataTexto) {
      linhaAtual--;
    }
  }
  
  // Log para debug
  Logger.log('Linha original: ' + linha);
  Logger.log('Data encontrada na linha ' + linhaAtual + ': ' + dataTexto);
  Logger.log('Horário: ' + horario);
  
  // Verifica se encontrou a data
  if (!dataTexto) {
    SpreadsheetApp.getUi().alert('Data não encontrada na coluna C (verificou até a linha 1)');
    return;
  }
  
  if (!horario) {
    SpreadsheetApp.getUi().alert('Horário não encontrado na coluna E desta linha (linha ' + linha + ')');
    return;
  }
  
  // Abre o horário na planilha de agendamentos
  liberarHorarioAgendamento(dataTexto, horario);
}

/**
 * Libera (cria como LIVRE) um horário na planilha de agendamentos
 */
function liberarHorarioAgendamento(data, horario) {
  try {
    const ss = SpreadsheetApp.openById(PLANILHA_AGENDAMENTOS_ID);
    const sheet = ss.getSheetByName(ABA_HORARIOS);
    
    if (!sheet) {
      Logger.log('Aba Horarios não encontrada na planilha de agendamentos');
      SpreadsheetApp.getUi().alert('Erro: Aba "Horarios" não encontrada na planilha de agendamentos');
      return;
    }
    
    // Normaliza a data e hora para comparação (remove espaços extras)
    const dataNormalizada = normalizarTexto(data);
    const horaNormalizada = normalizarTexto(horario);
    
    Logger.log('Buscando: Data=' + dataNormalizada + ' | Hora=' + horaNormalizada);
    
    // Verifica se o horário já existe na planilha
    const lastRow = sheet.getLastRow();
    let horarioExiste = false;
    
    if (lastRow >= 2) {
      const dados = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
      
      for (let i = 0; i < dados.length; i++) {
        const dataExistente = normalizarTexto(dados[i][0]);
        const horaExistente = normalizarTexto(dados[i][1]);
        
        Logger.log('Comparando linha ' + (i+2) + ': ' + dataExistente + ' vs ' + dataNormalizada + ' | ' + horaExistente + ' vs ' + horaNormalizada);
        
        if (dataExistente === dataNormalizada && horaExistente === horaNormalizada) {
          // Horário existe, muda para LIVRE
          sheet.getRange(i + 2, 3).setValue('LIVRE');
          horarioExiste = true;
          Logger.log('Horário ' + horaNormalizada + ' do dia ' + dataNormalizada + ' liberado com sucesso!');
          break;
        }
      }
    }
    
    // Se o horário não existe, cria um novo
    if (!horarioExiste) {
      sheet.appendRow([data, horario, 'LIVRE']);
      Logger.log('Novo horário criado: ' + dataNormalizada + ' ' + horaNormalizada);
    }
    
  } catch (erro) {
    Logger.log('Erro ao liberar horário: ' + erro.message);
    SpreadsheetApp.getUi().alert('Erro ao liberar horário: ' + erro.message);
  }
}

/**
 * Normaliza texto removendo espaços extras e convertendo para comparação
 */
function normalizarTexto(valor) {
  if (!valor) return '';
  return valor.toString().trim();
}

/**
 * Formata data para dd/MM/yyyy (caso seja um objeto Date)
 */
function formatarData(data) {
  if (!data) return '';
  if (typeof data === 'string') return data.trim();
  try {
    const d = new Date(data);
    return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy');
  } catch (e) {
    return data.toString().trim();
  }
}

/**
 * Formata hora para HH:mm (caso seja um objeto Date)
 */
function formatarHora(hora) {
  if (!hora) return '';
  if (typeof hora === 'string') return hora.trim();
  try {
    const h = new Date(hora);
    return Utilities.formatDate(h, 'America/Sao_Paulo', 'HH:mm');
  } catch (e) {
    return hora.toString().trim();
  }
}

