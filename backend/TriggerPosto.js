// ====== TRIGGER PARA PLANILHA DO POSTO DE SAÚDE ======
// Este código deve ser adicionado ao Google Apps Script da planilha do posto
// Planilha: 1fpwmi85pLQWPQrKJiawZOrSOip8MQlsfmyUpIU1wGlk

// ID da sua planilha de agendamentos
const PLANILHA_AGENDAMENTOS_ID = '15DF8LfTpuRw47etH-gZX49zwUebTUPB2FxtHibPtmY4';
const ABA_HORARIOS = 'Horarios';

/**
 * IMPORTANTE: Execute esta função UMA VEZ para criar o trigger instalável
 * Vá em Executar > criarTriggerInstalavel
 * 
 * O trigger de edição agora faz tudo em tempo real:
 * - Quando escreve "reservado" → cria LIVRE
 * - Quando apaga "reservado" → remove LIVRE
 * - Quando deleta linha inteira → também remove LIVRE (verifica órfãos instantaneamente)
 */
function criarTriggerInstalavel() {
  try {
    Logger.log('========== CRIANDO TRIGGER ==========');
    
    // Remove triggers antigos
    const triggers = ScriptApp.getProjectTriggers();
    let removidos = 0;
    triggers.forEach(trigger => {
      const funcao = trigger.getHandlerFunction();
      if (funcao === 'onEditInstalavel' || funcao === 'limparHorariosOrfaosAuto') {
        ScriptApp.deleteTrigger(trigger);
        removidos++;
        Logger.log('Trigger antigo removido: ' + funcao);
      }
    });
    
    Logger.log('Triggers antigos removidos: ' + removidos);
    
    // Cria trigger de edição
    Logger.log('Criando trigger de edição...');
    const spreadsheet = SpreadsheetApp.getActive();
    if (!spreadsheet) {
      throw new Error('Não foi possível acessar a planilha ativa. Certifique-se de executar esta função a partir do editor de scripts da planilha do posto.');
    }
    
    ScriptApp.newTrigger('onEditInstalavel')
      .forSpreadsheet(spreadsheet)
      .onEdit()
      .create();
    
    Logger.log('✅ Trigger criado!');
    
    Logger.log('========== FIM CRIAR TRIGGER ==========');
    
    const mensagem = '✅ Trigger criado com sucesso!\n\n' +
      'Agora tudo é em TEMPO REAL:\n' +
      '• Escrever "reservado" → cria LIVRE instantaneamente\n' +
      '• Apagar "reservado" → remove LIVRE instantaneamente\n' +
      '• Deletar linha inteira → remove LIVRE instantaneamente';
    
    Logger.log(mensagem);
    
    try {
      SpreadsheetApp.getUi().alert('Trigger criado!', mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {
      // Ignora
    }
    
    return mensagem;
    
  } catch (erro) {
    Logger.log('❌ ERRO ao criar trigger: ' + erro.message);
    Logger.log('Stack: ' + erro.stack);
    
    const mensagemErro = '❌ Erro ao criar trigger: ' + erro.message + '\n\nVerifique os logs para mais detalhes.';
    Logger.log(mensagemErro);
    
    throw erro;
  }
}

/**
 * VERIFICAÇÃO INSTANTÂNEA DE ÓRFÃOS
 * 
 * Compara os horários LIVRE na planilha de agendamentos com os "reservado" 
 * atuais na planilha do posto. Remove qualquer LIVRE que não tenha mais
 * um "reservado" correspondente.
 * 
 * Roda após CADA edição para garantir limpeza em tempo real.
 */
function verificarERemoverOrfaosInstantaneo(e) {
  try {
    // Verifica se estamos em uma aba 783 B
    if (!e || !e.source) return;
    
    const sheet = e.source.getActiveSheet();
    const nomeAba = sheet.getName();
    const nomeAbaTrimmed = nomeAba.trim();
    
    // Só executa para abas 783 B
    if (nomeAba.indexOf('783') === -1 || 
        nomeAba.toLowerCase().indexOf('modelo') !== -1 ||
        !nomeAbaTrimmed.endsWith(' B')) {
      return;
    }
    
    Logger.log('========== VERIFICAÇÃO INSTANTÂNEA DE ÓRFÃOS ==========');
    
    // Coleta todos os "reservado" atuais da planilha do posto
    const ssPosto = e.source;
    const reservadosAtuais = coletarTodosReservados(ssPosto);
    Logger.log('Total de "reservado" na planilha do posto: ' + reservadosAtuais.length);
    
    // Abre a planilha de agendamentos
    const ssAgendamentos = SpreadsheetApp.openById(PLANILHA_AGENDAMENTOS_ID);
    const sheetHorarios = ssAgendamentos.getSheetByName(ABA_HORARIOS);
    
    if (!sheetHorarios) {
      Logger.log('Aba Horarios não encontrada');
      return;
    }
    
    const lastRow = sheetHorarios.getLastRow();
    if (lastRow < 2) {
      Logger.log('Planilha de agendamentos vazia');
      return;
    }
    
    // Agora lê 4 colunas: Data, Hora, Status, Origem
    const dados = sheetHorarios.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
    let removidos = 0;
    
    // Processa de baixo para cima
    for (let i = dados.length - 1; i >= 0; i--) {
      const dataHorario = formatarDataParaComparacao(dados[i][0]);
      const horaHorario = formatarHoraParaComparacao(dados[i][1]);
      const status = (dados[i][2] || '').toString().trim().toUpperCase();
      const origemHorario = (dados[i][3] || 'F').toString().trim().toUpperCase(); // Default F para retrocompatibilidade
      
      // Só verifica horários LIVRE
      if (status !== 'LIVRE') continue;
      
      // Verifica se existe um "reservado" correspondente (com mesma origem)
      const existeReservado = reservadosAtuais.some(r => 
        compararDatas(r.data, dataHorario) && 
        compararHoras(r.hora, horaHorario) &&
        r.origem === origemHorario
      );
      
      if (!existeReservado) {
        Logger.log('Órfão encontrado: ' + dataHorario + ' ' + horaHorario + ' (origem: ' + origemHorario + ') - REMOVENDO');
        sheetHorarios.deleteRow(i + 2);
        removidos++;
      }
    }
    
    if (removidos > 0) {
      Logger.log('✅ ' + removidos + ' horário(s) órfão(s) removido(s) instantaneamente');
    } else {
      Logger.log('Nenhum órfão encontrado');
    }
    
    Logger.log('========== FIM VERIFICAÇÃO INSTANTÂNEA ==========');
    
  } catch (erro) {
    Logger.log('Erro na verificação instantânea: ' + erro.message);
  }
}

/**
 * Função chamada pelo trigger instalável (tem permissões para acessar outras planilhas)
 */
function onEditInstalavel(e) {
  try {
    processarEdicao(e);
    
    // Após processar, verifica se há órfãos comparando cache com estado atual
    verificarERemoverOrfaosInstantaneo(e);
    
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
 * Processa a edição - verifica se é "reservado" na coluna F ou O de uma aba 783
 * 
 * ESTRUTURA 1 (Colunas C, E, F):
 * - Coluna C = Data
 * - Coluna E = Horário
 * - Coluna F = Nome / "reservado"
 * 
 * ESTRUTURA 2 (Colunas M, N, O, P, Q):
 * - Coluna M = App
 * - Coluna N = Horário
 * - Coluna O = Nome / "reservado"
 * - Coluna P = Data de nascimento
 * - Coluna Q = Motivo
 * 
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
  
  // Verifica se é uma aba da equipe 783 que termina com " B" (não modelo)
  const nomeAbaTrimmed = nomeAba.trim();
  if (nomeAba.indexOf('783') === -1 || 
      nomeAba.toLowerCase().indexOf('modelo') !== -1 ||
      !nomeAbaTrimmed.endsWith(' B')) {
    return;
  }
  
  const COLUNA_F = 6;   // Nome/reservado (estrutura 1)
  const COLUNA_O = 15;  // Nome/reservado (estrutura 2)
  
  const primeiraColunaEditada = range.getColumn();
  const ultimaColunaEditada = range.getLastColumn();
  
  // Verifica se alguma das colunas de interesse foi editada
  const editouColunaF = COLUNA_F >= primeiraColunaEditada && COLUNA_F <= ultimaColunaEditada;
  const editouColunaO = COLUNA_O >= primeiraColunaEditada && COLUNA_O <= ultimaColunaEditada;
  
  if (!editouColunaF && !editouColunaO) {
    return; // Nenhuma coluna de interesse foi editada
  }
  
  const numLinhas = range.getNumRows();
  const numColunas = range.getNumColumns();
  
  // ===== PROCESSA COLUNA F (estrutura 1) =====
  if (editouColunaF) {
    processarColunaReservado(sheet, range, numLinhas, numColunas, COLUNA_F, 5, 3, 'F', e);
  }
  
  // ===== PROCESSA COLUNA O (estrutura 2) =====
  if (editouColunaO) {
    processarColunaReservado(sheet, range, numLinhas, numColunas, COLUNA_O, 14, 3, 'O', e);
  }
}

/**
 * Processa uma coluna de "reservado" (F ou O)
 * @param {Sheet} sheet - A aba sendo editada
 * @param {Range} range - O range editado
 * @param {number} numLinhas - Número de linhas no range
 * @param {number} numColunas - Número de colunas no range
 * @param {number} colunaReservado - Número da coluna de reservado (F=6, O=15)
 * @param {number} colunaHorario - Número da coluna de horário (E=5, N=14)
 * @param {number} colunaData - Número da coluna de data (C=3)
 * @param {string} nomeColuna - Nome da coluna para logs ('F' ou 'O') - também usado como origem
 * @param {Event} e - Evento de edição
 */
function processarColunaReservado(sheet, range, numLinhas, numColunas, colunaReservado, colunaHorario, colunaData, nomeColuna, e) {
  const primeiraLinha = range.getRow();
  
  // ===== CASO 1: Edição simples (uma célula só) =====
  if (numLinhas === 1 && numColunas === 1 && range.getColumn() === colunaReservado) {
    const valorAtual = (range.getValue() || '').toString().toLowerCase().trim();
    const linha = range.getRow();
    
    // Pega o horário da coluna correspondente
    const horarioValor = sheet.getRange(linha, colunaHorario).getValue();
    const horarioTexto = sheet.getRange(linha, colunaHorario).getDisplayValue();
    const horario = horarioTexto || horarioValor;
    
    // Busca a data (pode estar em célula mesclada acima)
    let dataTexto = '';
    let linhaAtual = linha;
    
    while (linhaAtual >= 1 && !dataTexto) {
      dataTexto = sheet.getRange(linhaAtual, colunaData).getDisplayValue();
      if (!dataTexto) {
        linhaAtual--;
      }
    }
    
    Logger.log('========== EDIÇÃO COLUNA ' + nomeColuna + ' ==========');
    Logger.log('Linha: ' + linha + ' | Valor atual: "' + valorAtual + '"');
    Logger.log('Data: ' + dataTexto + ' | Horário: ' + horario);
    
    if (!dataTexto || !horario) {
      Logger.log('Data ou horário não encontrados');
      return;
    }
    
    if (valorAtual === 'reservado') {
      Logger.log('Ação: LIBERAR horário (origem: ' + nomeColuna + ')');
      liberarHorarioAgendamento(dataTexto, horario, nomeColuna);
    } else {
      Logger.log('Ação: VERIFICAR E REMOVER horário LIVRE');
      removerHorarioLivreSeExistir(dataTexto, horario);
    }
    
    return;
  }
  
  // ===== CASO 2: Edição em bloco =====
  // Verifica se a coluna de reservado está no range
  const primeiraColunaRange = range.getColumn();
  const ultimaColunaRange = range.getLastColumn();
  
  if (colunaReservado < primeiraColunaRange || colunaReservado > ultimaColunaRange) {
    return;
  }
  
  Logger.log('========== EDIÇÃO EM BLOCO COLUNA ' + nomeColuna + ' ==========');
  
  const valoresColuna = sheet.getRange(primeiraLinha, colunaReservado, numLinhas, 1).getValues();
  
  for (let r = 0; r < numLinhas; r++) {
    const linha = primeiraLinha + r;
    const valorAtualCelula = (valoresColuna[r][0] || '').toString().toLowerCase().trim();
    
    Logger.log('Bloco ' + nomeColuna + ' - Linha ' + linha + ' | Valor: "' + valorAtualCelula + '"');
    
    // Pega o horário da coluna correspondente
    const horarioValor = sheet.getRange(linha, colunaHorario).getValue();
    const horarioTexto = sheet.getRange(linha, colunaHorario).getDisplayValue();
    const horario = horarioTexto || horarioValor;
    
    // Busca a data
    let dataTexto = '';
    let linhaAtual = linha;
    
    while (linhaAtual >= 1 && !dataTexto) {
      dataTexto = sheet.getRange(linhaAtual, colunaData).getDisplayValue();
      if (!dataTexto) {
        linhaAtual--;
      }
    }
    
    Logger.log('Bloco ' + nomeColuna + ' - Data: "' + dataTexto + '" | Horário: "' + horario + '"');
    
    if (!dataTexto || !horario) {
      Logger.log('Bloco ' + nomeColuna + ' - Data ou horário não encontrados, pulando');
      continue;
    }
    
    if (valorAtualCelula === 'reservado') {
      Logger.log('Bloco ' + nomeColuna + ' - Ação: LIBERAR horário (origem: ' + nomeColuna + ')');
      liberarHorarioAgendamento(dataTexto, horario, nomeColuna);
    } else {
      Logger.log('Bloco ' + nomeColuna + ' - Ação: VERIFICAR E REMOVER');
      removerHorarioLivreSeExistir(dataTexto, horario);
    }
  }
  
  Logger.log('========== FIM EDIÇÃO EM BLOCO ' + nomeColuna + ' ==========');
}

/**
 * Libera (cria como LIVRE) um horário na planilha de agendamentos
 * @param {string} data - Data do horário
 * @param {string} horario - Horário
 * @param {string} origem - Coluna de origem: 'F' ou 'O' (para saber onde preencher os dados do paciente)
 */
function liberarHorarioAgendamento(data, horario, origem) {
  try {
    origem = origem || 'F'; // Padrão é coluna F para retrocompatibilidade
    
    Logger.log('========== LIBERAR HORÁRIO ==========');
    Logger.log('Data recebida: "' + data + '"');
    Logger.log('Horário recebido: "' + horario + '"');
    Logger.log('Origem: "' + origem + '"');
    
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
      // Lê os display values para comparação mais robusta (agora 4 colunas: Data, Hora, Status, Origem)
      const dadosDisplay = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
      
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
          // Horário existe, muda para LIVRE e atualiza origem
          sheet.getRange(i + 2, 3).setValue('LIVRE');
          sheet.getRange(i + 2, 4).setValue(origem);
          horarioExiste = true;
          Logger.log('✅ Horário ' + horaFormatada + ' do dia ' + dataFormatada + ' liberado com sucesso! (Origem: ' + origem + ')');
          break;
        }
      }
    }
    
    // Se o horário não existe, cria um novo
    if (!horarioExiste) {
      // Usa a data e hora formatadas para criar o novo registro
      const dataParaInserir = formatarDataParaInsercao(data);
      // Usa a hora formatada como string "HH:mm" para garantir que só a hora seja inserida
      const horaParaInserir = horaFormatada; // Já está formatada como "HH:mm"
      
      // Agora inclui a coluna Origem (D)
      sheet.appendRow([dataParaInserir, horaParaInserir, 'LIVRE', origem]);
      Logger.log('✅ Novo horário criado: ' + dataFormatada + ' ' + horaFormatada + ' (Origem: ' + origem + ')');
    }
    
    Logger.log('========== FIM LIBERAR HORÁRIO ==========');
    
  } catch (erro) {
    Logger.log('❌ Erro ao liberar horário: ' + erro.message);
    Logger.log('Stack: ' + erro.stack);
    SpreadsheetApp.getUi().alert('Erro ao liberar horário: ' + erro.message);
  }
}

/**
 * Remove um horário LIVRE da planilha de agendamentos SE existir
 * Diferente de removerHorarioAgendamento, esta função:
 * - Só remove se o status for LIVRE (não remove agendamentos feitos)
 * - Não loga erro se não encontrar (é esperado não existir às vezes)
 */
function removerHorarioLivreSeExistir(data, horario) {
  try {
    Logger.log('========== VERIFICAR E REMOVER HORÁRIO LIVRE ==========');
    Logger.log('Planilha de agendamentos ID: ' + PLANILHA_AGENDAMENTOS_ID);
    Logger.log('Data recebida: "' + data + '"');
    Logger.log('Horário recebido: "' + horario + '"');
    
    const ss = SpreadsheetApp.openById(PLANILHA_AGENDAMENTOS_ID);
    Logger.log('Planilha aberta: ' + ss.getName());
    
    const sheet = ss.getSheetByName(ABA_HORARIOS);
    
    if (!sheet) {
      Logger.log('❌ Aba "' + ABA_HORARIOS + '" não encontrada!');
      return;
    }
    
    Logger.log('Aba encontrada: ' + sheet.getName());
    
    // Formata a data e hora para comparação
    const dataFormatada = formatarDataParaComparacao(data);
    const horaFormatada = formatarHoraParaComparacao(horario);
    
    Logger.log('Data formatada: "' + dataFormatada + '"');
    Logger.log('Hora formatada: "' + horaFormatada + '"');
    
    // Busca o horário na planilha
    const lastRow = sheet.getLastRow();
    Logger.log('Última linha da planilha: ' + lastRow);
    
    if (lastRow < 2) {
      Logger.log('Planilha vazia (só cabeçalho)');
      Logger.log('========== FIM VERIFICAR E REMOVER ==========');
      return;
    }
    
    const dadosDisplay = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
    Logger.log('Total de linhas para verificar: ' + dadosDisplay.length);
    
    for (let i = dadosDisplay.length - 1; i >= 0; i--) {
      const dataDisplay = dadosDisplay[i][0];
      const horaDisplay = dadosDisplay[i][1];
      const statusAtual = (dadosDisplay[i][2] || '').toString().trim().toUpperCase();
      
      // Formata para comparação
      const dataExistenteFormatada = formatarDataParaComparacao(dataDisplay);
      const horaExistenteFormatada = formatarHoraParaComparacao(horaDisplay);
      
      // Compara usando as funções de comparação
      const dataMatch = compararDatas(dataExistenteFormatada, dataFormatada);
      const horaMatch = compararHoras(horaExistenteFormatada, horaFormatada);
      
      Logger.log('Linha ' + (i+2) + ': Data="' + dataDisplay + '"→"' + dataExistenteFormatada + '" | Hora="' + horaDisplay + '"→"' + horaExistenteFormatada + '" | Status="' + statusAtual + '" | Match: data=' + dataMatch + ', hora=' + horaMatch);
      
      if (dataMatch && horaMatch) {
        // Encontrou o horário - só remove se for LIVRE
        if (statusAtual === 'LIVRE') {
          Logger.log('>>> DELETANDO linha ' + (i + 2) + '...');
          sheet.deleteRow(i + 2);
          Logger.log('✅ Horário LIVRE removido: ' + dataFormatada + ' ' + horaFormatada);
        } else {
          Logger.log('⚠️ Horário encontrado mas NÃO é LIVRE (status: "' + statusAtual + '"), mantendo na planilha');
        }
        Logger.log('========== FIM VERIFICAR E REMOVER ==========');
        return;
      }
    }
    
    Logger.log('❌ Horário NÃO encontrado na planilha de agendamentos');
    Logger.log('   Procurado: Data="' + dataFormatada + '" Hora="' + horaFormatada + '"');
    Logger.log('========== FIM VERIFICAR E REMOVER ==========');
    
  } catch (erro) {
    Logger.log('❌ ERRO ao verificar/remover horário: ' + erro.message);
    Logger.log('Stack: ' + erro.stack);
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
 * Retorna apenas a hora no formato "HH:mm" como string
 * Isso garante que só a hora seja inserida, sem a data
 */
function formatarHoraParaInsercao(hora) {
  if (!hora) return '';
  
  // Primeiro tenta formatar usando a função de comparação que já normaliza
  const horaFormatada = formatarHoraParaComparacao(hora);
  
  // Se conseguiu formatar como "HH:mm", retorna como string
  if (/^\d{2}:\d{2}$/.test(horaFormatada)) {
    return horaFormatada;
  }
  
  // Se não conseguiu, tenta extrair apenas a hora de um Date object
  try {
    const h = new Date(hora);
    if (!isNaN(h.getTime())) {
      // Extrai apenas a hora e minuto, formata como "HH:mm"
      const horas = h.getHours();
      const minutos = h.getMinutes();
      return (horas < 10 ? '0' : '') + horas + ':' + (minutos < 10 ? '0' : '') + minutos;
    }
  } catch (e) {
    // Continua
  }
  
  // Retorna como string se não conseguir converter
  return horaFormatada || hora.toString().trim();
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

/**
 * SINCRONIZA TODOS OS "RESERVADOS" DA PLANILHA DO POSTO
 * Varre todas as abas 783 (exceto modelos), procura "reservado" na coluna F
 * e garante que cada um deles esteja como LIVRE na planilha de agendamentos.
 * 
 * Versão simplificada que usa a função liberarHorarioAgendamento existente
 */
function sincronizarReservados() {
  try {
    Logger.log('========== SINCRONIZAR TODOS OS RESERVADOS ==========');
    Logger.log('Iniciando sincronização...');
    
    const ssPosto = SpreadsheetApp.getActive();
    if (!ssPosto) {
      throw new Error('Não foi possível acessar a planilha ativa do posto.');
    }
    
    Logger.log('Planilha do posto acessada: ' + ssPosto.getName());
    
    const abas = ssPosto.getSheets();
    Logger.log('Total de abas encontradas: ' + abas.length);
    
    let totalProcessados = 0;
    let totalEncontrados = 0;
    
    abas.forEach((aba, indexAba) => {
      const nomeAba = aba.getName();
      Logger.log('Verificando aba ' + (indexAba + 1) + ': "' + nomeAba + '"');
      
      // Só considera abas da equipe 783 que terminam com " B" (não modelo)
      // Exemplo válido: "783 (26/01 - 30/01) B"
      const nomeAbaTrimmed = nomeAba.trim();
      if (nomeAba.indexOf('783') === -1 || 
          nomeAba.toLowerCase().indexOf('modelo') !== -1 ||
          !nomeAbaTrimmed.endsWith(' B')) {
        Logger.log('  Aba ignorada (não é 783 terminando com " B" ou é modelo)');
        return;
      }
      
      Logger.log('  Aba 783 B encontrada! Processando...');
      
      const lastRow = aba.getLastRow();
      Logger.log('  Última linha: ' + lastRow);
      
      if (lastRow < 2) {
        Logger.log('  Aba vazia, pulando');
        return;
      }
      
      Logger.log('  Lendo dados da aba...');
      // Lê até coluna Q (17) para ter ambas estruturas
      const dados = aba.getRange(1, 1, lastRow, 17).getDisplayValues();
      Logger.log('  Dados lidos: ' + dados.length + ' linhas');
      
      let ultimaData = '';
      
      for (let i = 1; i < dados.length; i++) { // começa na linha 2 (índice 1)
        // Data da coluna C (usada por ambas estruturas)
        let dataLinha = (dados[i][2] || '').toString().trim(); // Coluna C
        
        // Trata células mescladas de data
        if (dataLinha) {
          ultimaData = dataLinha;
        } else {
          dataLinha = ultimaData;
        }
        
        if (!dataLinha) continue;
        
        // ESTRUTURA 1: Coluna E (hora) + Coluna F (nome/reservado)
        const horaE = (dados[i][4] || '').toString().trim(); // Coluna E
        const nomeF = (dados[i][5] || '').toString().toLowerCase().trim(); // Coluna F
        
        if (horaE && nomeF === 'reservado') {
          totalEncontrados++;
          Logger.log('  [RESERVADO F-' + totalEncontrados + '] Linha ' + (i + 1) + 
                     ': data="' + dataLinha + '", hora="' + horaE + '"');
          try {
            liberarHorarioAgendamento(dataLinha, horaE, 'F');
            totalProcessados++;
            Logger.log('    ✅ Processado!');
          } catch (erro) {
            Logger.log('    ❌ Erro: ' + erro.message);
          }
        }
        
        // ESTRUTURA 2: Coluna N (hora) + Coluna O (nome/reservado)
        const horaN = (dados[i][13] || '').toString().trim(); // Coluna N
        const nomeO = (dados[i][14] || '').toString().toLowerCase().trim(); // Coluna O
        
        if (horaN && nomeO === 'reservado') {
          totalEncontrados++;
          Logger.log('  [RESERVADO O-' + totalEncontrados + '] Linha ' + (i + 1) + 
                     ': data="' + dataLinha + '", hora="' + horaN + '"');
          try {
            liberarHorarioAgendamento(dataLinha, horaN, 'O');
            totalProcessados++;
            Logger.log('    ✅ Processado!');
          } catch (erro) {
            Logger.log('    ❌ Erro: ' + erro.message);
          }
        }
      }
      
      Logger.log('  Fim do processamento da aba "' + nomeAba + '"');
    });
    
    Logger.log('========== FIM SINCRONIZAR ==========');
    Logger.log('Total de "reservado" encontrados: ' + totalEncontrados);
    Logger.log('Total de "reservado" processados: ' + totalProcessados);
    
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Sincronização concluída',
               'Foram encontrados ' + totalEncontrados + ' horários com "reservado".\n' +
               'Foram processados ' + totalProcessados + ' com sucesso.',
               ui.ButtonSet.OK);
    } catch (e) {
      Logger.log('Não foi possível mostrar alerta UI');
    }
    
  } catch (erro) {
    Logger.log('❌ ERRO CRÍTICO na sincronização: ' + erro.message);
    Logger.log('Stack completo: ' + erro.stack);
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Erro na sincronização', 
               'Erro: ' + erro.message + '\n\nVerifique os logs no Apps Script.',
               ui.ButtonSet.OK);
    } catch (e) {
      Logger.log('Não foi possível mostrar alerta de erro');
    }
  }
}

/**
 * VERSÃO DE TESTE - Execute esta função diretamente no Apps Script para ver os logs
 * Vá em Executar > testarSincronizarReservados
 * Depois vá em Executar > Ver logs para ver o que aconteceu
 */
function testarSincronizarReservados() {
  Logger.log('========== TESTE DE SINCRONIZAÇÃO ==========');
  sincronizarReservados();
  Logger.log('========== FIM DO TESTE ==========');
}

/**
 * LIMPAR HORÁRIOS LIVRE ÓRFÃOS
 * 
 * Varre a planilha de agendamentos e remove horários LIVRE que não têm
 * mais um "reservado" correspondente na planilha do posto.
 * 
 * Use quando deletar linhas inteiras (horário + reservado juntos).
 */
function limparHorariosOrfaos() {
  try {
    Logger.log('========== LIMPAR HORÁRIOS ÓRFÃOS ==========');
    
    // Abre a planilha de agendamentos
    const ssAgendamentos = SpreadsheetApp.openById(PLANILHA_AGENDAMENTOS_ID);
    const sheetHorarios = ssAgendamentos.getSheetByName(ABA_HORARIOS);
    
    if (!sheetHorarios) {
      Logger.log('❌ Aba Horarios não encontrada');
      return;
    }
    
    // Abre a planilha do posto
    const ssPosto = SpreadsheetApp.getActive();
    if (!ssPosto) {
      Logger.log('❌ Planilha do posto não encontrada');
      return;
    }
    
    // Coleta todos os "reservado" da planilha do posto
    Logger.log('Coletando todos os "reservado" da planilha do posto...');
    const reservadosExistentes = coletarTodosReservados(ssPosto);
    Logger.log('Total de "reservado" encontrados: ' + reservadosExistentes.length);
    
    // Agora varre a planilha de agendamentos
    const lastRow = sheetHorarios.getLastRow();
    if (lastRow < 2) {
      Logger.log('Planilha de agendamentos vazia');
      return;
    }
    
    // Agora lê 4 colunas: Data, Hora, Status, Origem
    const dados = sheetHorarios.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
    let removidos = 0;
    
    // Processa de baixo para cima para não afetar os índices
    for (let i = dados.length - 1; i >= 0; i--) {
      const dataHorario = formatarDataParaComparacao(dados[i][0]);
      const horaHorario = formatarHoraParaComparacao(dados[i][1]);
      const status = (dados[i][2] || '').toString().trim().toUpperCase();
      const origemHorario = (dados[i][3] || 'F').toString().trim().toUpperCase(); // Default F para retrocompatibilidade
      
      // Só verifica horários LIVRE
      if (status !== 'LIVRE') {
        continue;
      }
      
      // Verifica se existe um "reservado" correspondente na planilha do posto (com mesma origem)
      const existeReservado = reservadosExistentes.some(r => 
        compararDatas(r.data, dataHorario) && 
        compararHoras(r.hora, horaHorario) && 
        r.origem === origemHorario
      );
      
      if (!existeReservado) {
        Logger.log('Órfão encontrado: ' + dataHorario + ' ' + horaHorario + ' (origem: ' + origemHorario + ') - REMOVENDO');
        sheetHorarios.deleteRow(i + 2);
        removidos++;
      }
    }
    
    Logger.log('========== FIM LIMPAR ÓRFÃOS ==========');
    Logger.log('Total de horários órfãos removidos: ' + removidos);
    
    try {
      SpreadsheetApp.getUi().alert('Limpeza concluída', 
        'Foram removidos ' + removidos + ' horários LIVRE órfãos.',
        SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {
      // Ignora se UI não disponível
    }
    
  } catch (erro) {
    Logger.log('❌ Erro: ' + erro.message);
    Logger.log('Stack: ' + erro.stack);
  }
}

/**
 * Coleta todos os "reservado" de todas as abas 783 B da planilha do posto
 * Verifica DUAS estruturas:
 * - Estrutura 1: Coluna C (data), E (hora), F (nome/reservado)
 * - Estrutura 2: Coluna C (data), N (hora), O (nome/reservado)
 * 
 * Retorna array de objetos {data, hora}
 */
function coletarTodosReservados(ssPosto) {
  const reservados = [];
  const abas = ssPosto.getSheets();
  
  abas.forEach(aba => {
    const nomeAba = aba.getName();
    const nomeAbaTrimmed = nomeAba.trim();
    
    // Só abas 783 que terminam com " B" (não modelo)
    if (nomeAba.indexOf('783') === -1 || 
        nomeAba.toLowerCase().indexOf('modelo') !== -1 ||
        !nomeAbaTrimmed.endsWith(' B')) {
      return;
    }
    
    const lastRow = aba.getLastRow();
    if (lastRow < 2) return;
    
    // Lê até coluna Q (17) para pegar ambas estruturas
    const dados = aba.getRange(1, 1, lastRow, 17).getDisplayValues();
    let ultimaData = '';
    
    for (let i = 1; i < dados.length; i++) {
      // Data da coluna C (usada por ambas estruturas)
      let dataLinha = (dados[i][2] || '').toString().trim(); // Coluna C (índice 2)
      
      // Trata células mescladas de data
      if (dataLinha) {
        ultimaData = dataLinha;
      } else {
        dataLinha = ultimaData;
      }
      
      if (!dataLinha) continue;
      
      // ESTRUTURA 1: Coluna E (hora) + Coluna F (nome/reservado)
      const horaE = (dados[i][4] || '').toString().trim(); // Coluna E (índice 4)
      const nomeF = (dados[i][5] || '').toString().toLowerCase().trim(); // Coluna F (índice 5)
      
      if (horaE && nomeF === 'reservado') {
        reservados.push({
          data: formatarDataParaComparacao(dataLinha),
          hora: formatarHoraParaComparacao(horaE),
          origem: 'F'  // Indica que veio da estrutura F (colunas D-H)
        });
      }
      
      // ESTRUTURA 2: Coluna N (hora) + Coluna O (nome/reservado)
      const horaN = (dados[i][13] || '').toString().trim(); // Coluna N (índice 13)
      const nomeO = (dados[i][14] || '').toString().toLowerCase().trim(); // Coluna O (índice 14)
      
      if (horaN && nomeO === 'reservado') {
        reservados.push({
          data: formatarDataParaComparacao(dataLinha),
          hora: formatarHoraParaComparacao(horaN),
          origem: 'O'  // Indica que veio da estrutura O (colunas M-Q)
        });
      }
    }
  });
  
  return reservados;
}

/**
 * Cria um menu na planilha do posto para chamar a sincronização manualmente
 * Esta função é chamada automaticamente quando a planilha é aberta
 * IMPORTANTE: Esta função só funciona se o código estiver na planilha do posto!
 */
function onOpen() {
  criarMenuAgendamento();
}

/**
 * Função que pode ser executada manualmente para criar o menu
 * Execute esta função no Apps Script da planilha do posto se o menu não aparecer automaticamente
 * Vá em Executar > criarMenuAgendamento
 */
function criarMenuAgendamento() {
  try {
    Logger.log('Criando menu Agendamento...');
    const ui = SpreadsheetApp.getUi();
    
    if (!ui) {
      Logger.log('❌ UI não disponível');
      return;
    }
    
    ui.createMenu('Agendamento')
      .addItem('Sincronizar todos os reservados', 'sincronizarReservados')
      .addItem('Limpar horários órfãos', 'limparHorariosOrfaos')
      .addToUi();
    
    Logger.log('✅ Menu Agendamento criado com sucesso!');
    
    // Mostra mensagem de sucesso
    ui.alert('Menu criado!', 
             'O menu "Agendamento" foi adicionado com sucesso.\n\n' +
             'Agora você pode usar:\n' +
             'Agendamento → Sincronizar todos os reservados',
             ui.ButtonSet.OK);
    
  } catch (e) {
    Logger.log('❌ Erro ao criar menu Agendamento: ' + e.message);
    Logger.log('Stack: ' + e.stack);
    
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Erro ao criar menu', 
               'Erro: ' + e.message + '\n\nVerifique os logs para mais detalhes.',
               ui.ButtonSet.OK);
    } catch (e2) {
      // Ignora
    }
  }
}

  
