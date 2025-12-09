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
 * Função onEdit simples - NÃO FAZ NADA
 * (O trigger simples não tem permissão para acessar outras planilhas)
 * Usamos apenas o trigger instalável (onEditInstalavel)
 */
function onEdit(e) {
  // Não faz nada - apenas o trigger instalável funciona
  return;
}

/**
 * Processa a edição - verifica se é "reservado" na coluna F de uma aba 783
 * Se adicionar "reservado" -> cria horário LIVRE na planilha de agendamentos
 * Se apagar "reservado" -> remove o horário da planilha de agendamentos
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
  
  // Pega o valor atual e o valor antigo
  const valorAtual = (range.getValue() || '').toString().toLowerCase().trim();
  const valorAntigo = (e.oldValue || '').toString().toLowerCase().trim();
  
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
  Logger.log('Linha: ' + linha + ' | Valor antigo: "' + valorAntigo + '" | Valor atual: "' + valorAtual + '"');
  Logger.log('Data: ' + dataTexto + ' | Horário: ' + horario);
  
  // Verifica se encontrou data e horário
  if (!dataTexto || !horario) {
    Logger.log('Data ou horário não encontrados');
    return;
  }
  
  // CASO 1: Escreveu "reservado" -> libera horário na planilha de agendamentos
  if (valorAtual === 'reservado' && valorAntigo !== 'reservado') {
    Logger.log('Ação: LIBERAR horário');
    liberarHorarioAgendamento(dataTexto, horario);
  }
  
  // CASO 2: Apagou "reservado" -> remove horário da planilha de agendamentos
  else if (valorAntigo === 'reservado' && valorAtual !== 'reservado') {
    Logger.log('Ação: REMOVER horário');
    removerHorarioAgendamento(dataTexto, horario);
  }
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
 * Remove um horário da planilha de agendamentos
 */
function removerHorarioAgendamento(data, horario) {
  try {
    const ss = SpreadsheetApp.openById(PLANILHA_AGENDAMENTOS_ID);
    const sheet = ss.getSheetByName(ABA_HORARIOS);
    
    if (!sheet) {
      Logger.log('Aba Horarios não encontrada na planilha de agendamentos');
      return;
    }
    
    // Normaliza a data e hora para comparação
    const dataNormalizada = normalizarTexto(data);
    const horaNormalizada = normalizarTexto(horario);
    
    Logger.log('Removendo: Data=' + dataNormalizada + ' | Hora=' + horaNormalizada);
    
    // Busca o horário na planilha
    const lastRow = sheet.getLastRow();
    
    if (lastRow >= 2) {
      const dados = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
      
      for (let i = dados.length - 1; i >= 0; i--) {
        const dataExistente = normalizarTexto(dados[i][0]);
        const horaExistente = normalizarTexto(dados[i][1]);
        
        if (dataExistente === dataNormalizada && horaExistente === horaNormalizada) {
          // Encontrou o horário, remove a linha
          sheet.deleteRow(i + 2);
          Logger.log('Horário ' + horaNormalizada + ' do dia ' + dataNormalizada + ' removido com sucesso!');
          return;
        }
      }
    }
    
    Logger.log('Horário não encontrado para remover');
    
  } catch (erro) {
    Logger.log('Erro ao remover horário: ' + erro.message);
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

