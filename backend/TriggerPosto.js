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
  try {
    Logger.log('========== CRIANDO TRIGGER ==========');
    
    // Remove triggers antigos desta função
    const triggers = ScriptApp.getProjectTriggers();
    let removidos = 0;
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'onEditInstalavel') {
        ScriptApp.deleteTrigger(trigger);
        removidos++;
        Logger.log('Trigger antigo removido');
      }
    });
    
    Logger.log('Triggers antigos removidos: ' + removidos);
    
    // Cria novo trigger instalável
    Logger.log('Criando novo trigger...');
    const spreadsheet = SpreadsheetApp.getActive();
    if (!spreadsheet) {
      throw new Error('Não foi possível acessar a planilha ativa. Certifique-se de executar esta função a partir do editor de scripts da planilha do posto.');
    }
    
    const trigger = ScriptApp.newTrigger('onEditInstalavel')
      .forSpreadsheet(spreadsheet)
      .onEdit()
      .create();
    
    Logger.log('✅ Trigger criado com sucesso! ID: ' + trigger.getUniqueId());
    
    // Verifica se o trigger foi criado
    const triggersApos = ScriptApp.getProjectTriggers();
    const triggerCriado = triggersApos.find(t => t.getHandlerFunction() === 'onEditInstalavel');
    
    if (triggerCriado) {
      Logger.log('✅ Trigger confirmado na lista de triggers');
      Logger.log('   Função: ' + triggerCriado.getHandlerFunction());
      Logger.log('   Tipo: ' + triggerCriado.getEventType());
    } else {
      Logger.log('⚠️ Aviso: Trigger não encontrado na lista após criação');
    }
    
    Logger.log('========== FIM CRIAR TRIGGER ==========');
    
    // Retorna mensagem de sucesso (sem alerta para evitar travamento)
    const mensagem = '✅ Trigger criado com sucesso!\n\n' +
      'Agora quando você escrever "reservado" na coluna F de uma aba 783, ' +
      'o horário será liberado automaticamente na planilha de agendamentos.\n\n' +
      'Verifique os logs (Executar > Ver logs) para mais detalhes.';
    
    Logger.log(mensagem);
    
    return mensagem;
    
  } catch (erro) {
    Logger.log('❌ ERRO ao criar trigger: ' + erro.message);
    Logger.log('Stack: ' + erro.stack);
    
    const mensagemErro = '❌ Erro ao criar trigger: ' + erro.message + '\n\nVerifique os logs para mais detalhes.';
    Logger.log(mensagemErro);
    
    throw erro; // Re-lança o erro para aparecer no console
  }
}

/**
 * Função chamada pelo trigger instalável (tem permissões para acessar outras planilhas)
 */
function onEditInstalavel(e) {
  try {
    processarEdicao(e);
  } catch (erro) {
    Logger.log('❌ Erro no trigger onEditInstalavel: ' + erro.message);
    Logger.log('Stack: ' + erro.stack);
  }
}

/**
 * Função alternativa para criar trigger - mais simples
 * Use esta se criarTriggerInstalavel() não funcionar
 */
function criarTriggerSimples() {
  try {
    Logger.log('Criando trigger simples...');
    
    // Remove todos os triggers antigos
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'onEditInstalavel') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // Cria o trigger
    ScriptApp.newTrigger('onEditInstalavel')
      .onEdit()
      .create();
    
    Logger.log('✅ Trigger criado!');
    return 'Trigger criado com sucesso!';
    
  } catch (erro) {
    Logger.log('❌ Erro: ' + erro.message);
    throw erro;
  }
}

/**
 * Verifica se o trigger está instalado e funcionando
 */
function verificarTrigger() {
  try {
    Logger.log('========== VERIFICANDO TRIGGERS ==========');
    
    const triggers = ScriptApp.getProjectTriggers();
    Logger.log('Total de triggers: ' + triggers.length);
    
    const triggerEncontrado = triggers.find(t => t.getHandlerFunction() === 'onEditInstalavel');
    
    if (triggerEncontrado) {
      Logger.log('✅ Trigger encontrado!');
      Logger.log('   Função: ' + triggerEncontrado.getHandlerFunction());
      Logger.log('   Tipo: ' + triggerEncontrado.getEventType());
      Logger.log('   ID único: ' + triggerEncontrado.getUniqueId());
      
      try {
        const ui = SpreadsheetApp.getUi();
        if (ui) {
          ui.alert('Trigger encontrado!', 'O trigger está instalado e funcionando.', ui.ButtonSet.OK);
        }
      } catch (e) {
        // Ignora
      }
      
      return true;
    } else {
      Logger.log('❌ Trigger NÃO encontrado!');
      Logger.log('Execute criarTriggerInstalavel() para criar o trigger.');
      
      try {
        const ui = SpreadsheetApp.getUi();
        if (ui) {
          ui.alert('Trigger não encontrado', 'Execute criarTriggerInstalavel() para criar o trigger.', ui.ButtonSet.OK);
        }
      } catch (e) {
        // Ignora
      }
      
      return false;
    }
    
  } catch (erro) {
    Logger.log('❌ Erro ao verificar: ' + erro.message);
    return false;
  } finally {
    Logger.log('========== FIM VERIFICAÇÃO ==========');
  }
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
    Logger.log('========== LIBERAR HORÁRIO ==========');
    Logger.log('Data recebida: "' + data + '"');
    Logger.log('Horário recebido: "' + horario + '"');
    
    const ss = SpreadsheetApp.openById(PLANILHA_AGENDAMENTOS_ID);
    const sheet = ss.getSheetByName(ABA_HORARIOS);
    
    if (!sheet) {
      Logger.log('❌ Aba Horarios não encontrada na planilha de agendamentos');
      SpreadsheetApp.getUi().alert('Erro: Aba "Horarios" não encontrada na planilha de agendamentos');
      return;
    }
    
    // Formata a data para o formato padrão (dd/MM/yyyy)
    const dataFormatada = formatarDataParaComparacao(data);
    // Formata a hora para o formato padrão (HH:mm)
    const horaFormatada = formatarHoraParaComparacao(horario);
    
    Logger.log('Data formatada: "' + dataFormatada + '"');
    Logger.log('Hora formatada: "' + horaFormatada + '"');
    
    // Verifica se o horário já existe na planilha
    const lastRow = sheet.getLastRow();
    let horarioExiste = false;
    
    if (lastRow >= 2) {
      // Lê os display values para comparação mais robusta
      const dadosDisplay = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
      
      for (let i = 0; i < dadosDisplay.length; i++) {
        const dataDisplay = dadosDisplay[i][0];
        const horaDisplay = dadosDisplay[i][1];
        const statusAtual = (dadosDisplay[i][2] || '').toString().trim().toUpperCase();
        
        // Tenta formatar a data e hora existentes
        const dataExistenteFormatada = formatarDataParaComparacao(dataDisplay);
        const horaExistenteFormatada = formatarHoraParaComparacao(horaDisplay);
        
        Logger.log('Linha ' + (i+2) + ': Data="' + dataDisplay + '" -> "' + dataExistenteFormatada + '" | Hora="' + horaDisplay + '" -> "' + horaExistenteFormatada + '" | Status="' + statusAtual + '"');
        
        // Compara as datas e horas formatadas
        const dataMatch = compararDatas(dataExistenteFormatada, dataFormatada);
        const horaMatch = compararHoras(horaExistenteFormatada, horaFormatada);
        
        Logger.log('  Comparação: dataMatch=' + dataMatch + ', horaMatch=' + horaMatch);
        
        if (dataMatch && horaMatch) {
          // Horário existe, muda para LIVRE
          sheet.getRange(i + 2, 3).setValue('LIVRE');
          horarioExiste = true;
          Logger.log('✅ Horário ' + horaFormatada + ' do dia ' + dataFormatada + ' liberado com sucesso!');
          break;
        }
      }
    }
    
    // Se o horário não existe, cria um novo
    if (!horarioExiste) {
      // Usa a data e hora formatadas para criar o novo registro
      const dataParaInserir = formatarDataParaInsercao(data);
      const horaParaInserir = formatarHoraParaInsercao(horario);
      
      sheet.appendRow([dataParaInserir, horaParaInserir, 'LIVRE']);
      Logger.log('✅ Novo horário criado: ' + dataFormatada + ' ' + horaFormatada);
    }
    
    Logger.log('========== FIM LIBERAR HORÁRIO ==========');
    
  } catch (erro) {
    Logger.log('❌ Erro ao liberar horário: ' + erro.message);
    Logger.log('Stack: ' + erro.stack);
    SpreadsheetApp.getUi().alert('Erro ao liberar horário: ' + erro.message);
  }
}

/**
 * Remove um horário da planilha de agendamentos
 */
function removerHorarioAgendamento(data, horario) {
  try {
    Logger.log('========== REMOVER HORÁRIO ==========');
    Logger.log('Data recebida: "' + data + '"');
    Logger.log('Horário recebido: "' + horario + '"');
    
    const ss = SpreadsheetApp.openById(PLANILHA_AGENDAMENTOS_ID);
    const sheet = ss.getSheetByName(ABA_HORARIOS);
    
    if (!sheet) {
      Logger.log('❌ Aba Horarios não encontrada na planilha de agendamentos');
      return;
    }
    
    // Formata a data e hora para comparação
    const dataFormatada = formatarDataParaComparacao(data);
    const horaFormatada = formatarHoraParaComparacao(horario);
    
    Logger.log('Removendo: Data=' + dataFormatada + ' | Hora=' + horaFormatada);
    
    // Busca o horário na planilha
    const lastRow = sheet.getLastRow();
    
    if (lastRow >= 2) {
      const dadosDisplay = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
      
      for (let i = dadosDisplay.length - 1; i >= 0; i--) {
        const dataDisplay = dadosDisplay[i][0];
        const horaDisplay = dadosDisplay[i][1];
        
        // Formata para comparação
        const dataExistenteFormatada = formatarDataParaComparacao(dataDisplay);
        const horaExistenteFormatada = formatarHoraParaComparacao(horaDisplay);
        
        Logger.log('Linha ' + (i+2) + ': Data="' + dataDisplay + '" -> "' + dataExistenteFormatada + '" | Hora="' + horaDisplay + '" -> "' + horaExistenteFormatada + '"');
        
        // Compara usando as funções de comparação
        const dataMatch = compararDatas(dataExistenteFormatada, dataFormatada);
        const horaMatch = compararHoras(horaExistenteFormatada, horaFormatada);
        
        if (dataMatch && horaMatch) {
          // Encontrou o horário, remove a linha
          sheet.deleteRow(i + 2);
          Logger.log('✅ Horário ' + horaFormatada + ' do dia ' + dataFormatada + ' removido com sucesso!');
          Logger.log('========== FIM REMOVER HORÁRIO ==========');
          return;
        }
      }
    }
    
    Logger.log('❌ Horário não encontrado para remover');
    Logger.log('========== FIM REMOVER HORÁRIO ==========');
    
  } catch (erro) {
    Logger.log('❌ Erro ao remover horário: ' + erro.message);
    Logger.log('Stack: ' + erro.stack);
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
 * Formata data para comparação (dd/MM/yyyy)
 * Aceita vários formatos de entrada e converte para o padrão
 */
function formatarDataParaComparacao(data) {
  if (!data) return '';
  
  const texto = data.toString().trim();
  
  // Se já está no formato dd/MM/yyyy, retorna
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    return texto;
  }
  
  // Se está no formato dd/MM, adiciona o ano atual
  if (/^\d{1,2}\/\d{1,2}$/.test(texto)) {
    const partes = texto.split('/');
    const dia = partes[0].padStart(2, '0');
    const mes = partes[1].padStart(2, '0');
    const ano = new Date().getFullYear();
    return dia + '/' + mes + '/' + ano;
  }
  
  // Tenta converter de Date object
  try {
    const d = new Date(data);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Sao_Paulo', 'dd/MM/yyyy');
    }
  } catch (e) {
    // Continua
  }
  
  // Retorna o texto original normalizado
  return texto;
}

/**
 * Formata hora para comparação (HH:mm)
 * Aceita vários formatos de entrada e converte para o padrão
 */
function formatarHoraParaComparacao(hora) {
  if (!hora) return '';
  
  const texto = hora.toString().trim();
  
  // Se já está no formato HH:mm, retorna
  if (/^\d{2}:\d{2}$/.test(texto)) {
    return texto;
  }
  
  // Se está no formato H:mm, adiciona zero à esquerda
  if (/^\d{1}:\d{2}$/.test(texto)) {
    return '0' + texto;
  }
  
  // Tenta converter de Date object
  try {
    const h = new Date(hora);
    if (!isNaN(h.getTime())) {
      return Utilities.formatDate(h, Session.getScriptTimeZone() || 'America/Sao_Paulo', 'HH:mm');
    }
  } catch (e) {
    // Continua
  }
  
  // Retorna o texto original normalizado
  return texto;
}

/**
 * Compara duas datas no formato dd/MM/yyyy
 * Retorna true se forem iguais
 */
function compararDatas(data1, data2) {
  if (!data1 || !data2) return false;
  
  // Normaliza removendo zeros à esquerda para comparação flexível
  const normalizarData = (d) => {
    const partes = d.split('/');
    if (partes.length !== 3) return d;
    return partes[0].replace(/^0+/, '') + '/' + partes[1].replace(/^0+/, '') + '/' + partes[2];
  };
  
  return normalizarData(data1) === normalizarData(data2);
}

/**
 * Compara duas horas no formato HH:mm
 * Retorna true se forem iguais
 */
function compararHoras(hora1, hora2) {
  if (!hora1 || !hora2) return false;
  
  // Normaliza removendo zeros à esquerda para comparação flexível
  const normalizarHora = (h) => {
    const partes = h.split(':');
    if (partes.length !== 2) return h;
    return partes[0].replace(/^0+/, '') + ':' + partes[1].replace(/^0+/, '');
  };
  
  return normalizarHora(hora1) === normalizarHora(hora2);
}

/**
 * Formata data para inserção na planilha
 * Tenta converter para Date object se possível, senão usa string
 */
function formatarDataParaInsercao(data) {
  if (!data) return '';
  
  const texto = data.toString().trim();
  
  // Tenta converter de string para Date
  try {
    // Formato dd/MM/yyyy
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
      const partes = texto.split('/');
      const dia = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1; // Mês é 0-indexed
      const ano = parseInt(partes[2], 10);
      return new Date(ano, mes, dia);
    }
    
    // Formato dd/MM (assume ano atual)
    if (/^\d{1,2}\/\d{1,2}$/.test(texto)) {
      const partes = texto.split('/');
      const dia = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1;
      const ano = new Date().getFullYear();
      return new Date(ano, mes, dia);
    }
    
    // Tenta como Date object direto
    const d = new Date(data);
    if (!isNaN(d.getTime())) {
      return d;
    }
  } catch (e) {
    // Continua
  }
  
  // Retorna como string se não conseguir converter
  return texto;
}

/**
 * Formata hora para inserção na planilha
 * Tenta converter para Date object se possível, senão usa string
 */
function formatarHoraParaInsercao(hora) {
  if (!hora) return '';
  
  const texto = hora.toString().trim();
  
  // Tenta converter de string HH:mm para Date
  try {
    if (/^\d{1,2}:\d{2}$/.test(texto)) {
      const partes = texto.split(':');
      const horas = parseInt(partes[0], 10);
      const minutos = parseInt(partes[1], 10);
      
      // Cria uma data com a hora de hoje
      const hoje = new Date();
      hoje.setHours(horas, minutos, 0, 0);
      return hoje;
    }
    
    // Tenta como Date object direto
    const h = new Date(hora);
    if (!isNaN(h.getTime())) {
      return h;
    }
  } catch (e) {
    // Continua
  }
  
  // Retorna como string se não conseguir converter
  return texto;
}

/**
 * Formata data para dd/MM/yyyy (caso seja um objeto Date)
 * @deprecated Use formatarDataParaComparacao ou formatarDataParaInsercao
 */
function formatarData(data) {
  return formatarDataParaComparacao(data);
}

/**
 * Formata hora para HH:mm (caso seja um objeto Date)
 * @deprecated Use formatarHoraParaComparacao ou formatarHoraParaInsercao
 */
function formatarHora(hora) {
  return formatarHoraParaComparacao(hora);
}

  