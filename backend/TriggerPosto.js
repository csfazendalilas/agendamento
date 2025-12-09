// ====== TRIGGER PARA PLANILHA DO POSTO DE SAÚDE ======
// Este código deve ser adicionado ao Google Apps Script da planilha do posto
// Planilha: 1fpwmi85pLQWPQrKJiawZOrSOip8MQlsfmyUpIU1wGlk

// ID da sua planilha de agendamentos
const PLANILHA_AGENDAMENTOS_ID = '15DF8LfTpuRw47etH-gZX49zwUebTUPB2FxtHibPtmY4';
const ABA_HORARIOS = 'Horarios';

/**
 * Trigger que executa quando uma célula é editada
 * Quando "reservado" é escrito na coluna F de uma aba 783,
 * libera o horário na planilha de agendamentos
 */
function onEdit(e) {
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
  
  // Pega a data (coluna C = 3) e horário (coluna E = 5) da mesma linha
  const data = sheet.getRange(linha, 3).getValue();
  const horario = sheet.getRange(linha, 5).getValue();
  
  if (!data || !horario) {
    SpreadsheetApp.getUi().alert('Data ou horário não encontrados nesta linha.');
    return;
  }
  
  // Abre o horário na planilha de agendamentos
  liberarHorarioAgendamento(data, horario);
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
      return;
    }
    
    // Formata a data e hora para comparação
    const dataFormatada = formatarData(data);
    const horaFormatada = formatarHora(horario);
    
    // Verifica se o horário já existe na planilha
    const lastRow = sheet.getLastRow();
    let horarioExiste = false;
    
    if (lastRow >= 2) {
      const dados = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      
      for (let i = 0; i < dados.length; i++) {
        const dataExistente = formatarData(dados[i][0]);
        const horaExistente = formatarHora(dados[i][1]);
        
        if (dataExistente === dataFormatada && horaExistente === horaFormatada) {
          // Horário existe, muda para LIVRE
          sheet.getRange(i + 2, 3).setValue('LIVRE');
          horarioExiste = true;
          Logger.log('Horário ' + horaFormatada + ' do dia ' + dataFormatada + ' liberado com sucesso!');
          break;
        }
      }
    }
    
    // Se o horário não existe, cria um novo
    if (!horarioExiste) {
      sheet.appendRow([data, horario, 'LIVRE']);
      Logger.log('Novo horário criado: ' + dataFormatada + ' ' + horaFormatada);
    }
    
  } catch (erro) {
    Logger.log('Erro ao liberar horário: ' + erro.message);
  }
}

/**
 * Formata data para dd/MM/yyyy
 */
function formatarData(data) {
  if (!data) return '';
  const d = new Date(data);
  return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy');
}

/**
 * Formata hora para HH:mm
 */
function formatarHora(hora) {
  if (!hora) return '';
  const h = new Date(hora);
  return Utilities.formatDate(h, 'America/Sao_Paulo', 'HH:mm');
}

