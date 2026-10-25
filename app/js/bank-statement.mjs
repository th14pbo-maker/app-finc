/**
 * Finance OS — Importação e Análise Inteligente de Extratos Bancários
 * Suporta arquivos OFX (SGML/XML), planilhas CSV e texto bruto colado de apps/PDFs de bancos brasileiros.
 */

import { uid } from './domain.mjs';
import { parseBrlCents, formatBrlCents } from './currency.mjs';
import { categories } from './views/transactions.mjs';
import { el, icon, btn, iconBtn, money, openDialog, toast } from './ui.mjs';

const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Categorização inteligente baseada em palavras-chave do ecossistema bancário e de consumo brasileiro.
 */
const CATEGORY_KEYWORDS = [
  { category: 'Salário', patterns: [/\bsalario\b/, /\bproventos\b/, /\bfolha\s*pag/, /\bvencimento\b/, /\bordenado\b/, /\bremuneracao\b/] },
  { category: 'Renda extra', patterns: [/\breembolso\b/, /\bestorno\b/, /\brendimento\b/, /\bdividendos?\b/, /\bjcp\b/, /\bcashback\b/, /\bfreela\b/, /\bvenda\b/] },
  { category: 'Mercado', patterns: [/\bmercado\b/, /\bsupermercado\b/, /\batacad[ao]/, /\bassai\b/, /\bcarrefour\b/, /\bpao\s*de\s*acucar\b/, /\bextra\b/, /\bsonda\b/, /\bzaffari\b/, /\bmuffato\b/, /\bdia\s*%\b/, /\bhortifruti\b/, /\bsacolao\b/, /\bquitanda\b/, /\bfeira\b/] },
  { category: 'Padaria', patterns: [/\bpadaria\b/, /\bpanificadora\b/, /\bpao\b/, /\bconfeitaria\b/, /\bpanettiere\b/] },
  { category: 'Restaurantes e delivery', patterns: [/\bifood\b/, /\brestaurante\b/, /\blanchonete\b/, /\bmcdonald\b/, /\bburger\b/, /\bsubway\b/, /\bhabib\b/, /\boutback\b/, /\bpizza\b/, /\bsushi\b/, /\bbar\b/, /\bcafe\b/, /\bstarbucks\b/, /\brefeicao\b/, /\bchoperia\b/, /\bdelivery\b/] },
  { category: 'Combustível', patterns: [/\bposto\b/, /\bgasolina\b/, /\betanol\b/, /\bcombustivel\b/, /\bshell\b/, /\bipiranga\b/, /\bbr\s*distribuidora\b/, /\bauto\s*posto\b/, /\bpetrobras\b/, /\bale\s*combustiveis\b/] },
  { category: 'Transporte', patterns: [/\buber\b/, /\b99app\b/, /\b99\s*tecnologia\b/, /\btaxi\b/, /\bmetro\b/, /\bcptm\b/, /\bsptrans\b/, /\bpedagio\b/, /\bsem\s*parar\b/, /\bconectcar\b/, /\bveloe\b/, /\bestapar\b/, /\bestacionamento\b/, /\bpassagem\b/] },
  { category: 'Medicamentos', patterns: [/\bfarmacia\b/, /\bdrogaria\b/, /\bpague\s*menos\b/, /\braia\b/, /\bdrogasil\b/, /\bsao\s*paulo\b/, /\bpanvel\b/, /\bdpsp\b/, /\bnissei\b/, /\bultrafarma\b/, /\bremedio\b/] },
  { category: 'Saúde', patterns: [/\bconsulta\b/, /\bexame\b/, /\bhospital\b/, /\blaboratorio\b/, /\bfleury\b/, /\bdelboni\b/, /\blavoisier\b/, /\bunimed\b/, /\bbradesco\s*saude\b/, /\bodonto\b/, /\bclinica\b/] },
  { category: 'Pets', patterns: [/\bpet\b/, /\bpetz\b/, /\bcobasi\b/, /\bveterinari[oa]\b/, /\bracao\b/, /\bpet\s*shop\b/, /\bbanho\s*e\s*tosa\b/, /\bgato\b/, /\bcachorro\b/] },
  { category: 'Energia', patterns: [/\benel\b/, /\bcpfl\b/, /\bcemig\b/, /\bedp\b/, /\blight\b/, /\benergisa\b/, /\beletropaulo\b/, /\bcoelba\b/, /\bneoenergia\b/, /\benergia\b/, /\bluz\b/] },
  { category: 'Água', patterns: [/\bsabesp\b/, /\bcompesa\b/, /\bcopasa\b/, /\bcorsan\b/, /\bcedae\b/, /\bembasa\b/, /\bagua\b/, /\bsaneamento\b/] },
  { category: 'Internet e telefone', patterns: [/\bclaro\b/, /\bvivo\b/, /\btim\b/, /\boi\s*fibra\b/, /\bnet\s*servicos\b/, /\binternet\b/, /\btelecom\b/, /\bfibra\b/, /\bprovedor\b/] },
  { category: 'Moradia', patterns: [/\baluguel\b/, /\bcondominio\b/, /\btaxa\s*condominial\b/, /\biptu\b/, /\bquintoandar\b/, /\bloft\b/] },
  { category: 'Assinaturas', patterns: [/\bnetflix\b/, /\bspotify\b/, /\bamazon\s*prime\b/, /\bamzn\s*digital\b/, /\bdisney\b/, /\bhbo\b/, /\bmax\b/, /\bdeezer\b/, /\byoutube\b/, /\bgloboplay\b/, /\bapple\.com\b/, /\bgoogle\s*play\b/] },
  { category: 'Educação', patterns: [/\bescola\b/, /\bcolegio\b/, /\bfaculdade\b/, /\buniversidade\b/, /\bmensalidade\s*escolar\b/, /\budemy\b/, /\bcoursera\b/, /\balura\b/, /\blivros?\b/, /\blivraria\b/] },
  { category: 'Compras', patterns: [/\bmercadolivre\b/, /\bmercado\s*livre\b/, /\bshopee\b/, /\bshein\b/, /\bmagalu\b/, /\bmagazine\s*luiza\b/, /\bamericanas\b/, /\bcasas\s*bahia\b/, /\briachuelo\b/, /\brenner\b/, /\bc&a\b/, /\bzara\b/] }
];

export function categorizeTransaction(description, type = 'expense') {
  const d = norm(description);
  for (const item of CATEGORY_KEYWORDS) {
    if (item.patterns.some(p => p.test(d))) {
      return item.category;
    }
  }
  if (type === 'income') {
    if (/\bpix\b/.test(d)) return 'Renda extra';
    return 'Salário';
  }
  return 'Outros';
}

/**
 * Remove tags XML/SGML e limpa espaços
 */
function cleanXml(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza data ISO (YYYY-MM-DD)
 */
function toIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Leitor de OFX (suporta SGML antigo sem fechamento de tag e XML moderno)
 */
export function parseOfx(text) {
  if (typeof text !== 'string' || !text.includes('<STMTTRN>')) {
    return [];
  }

  const items = [];
  // Divide blocos de transações
  const blocks = text.split(/<STMTTRN>/i).slice(1);

  for (const block of blocks) {
    const endIdx = block.search(/<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>/i);
    const content = endIdx >= 0 ? block.slice(0, endIdx) : block;

    // Tipo
    const typeMatch = content.match(/<TRNTYPE>([^<\r\n]+)/i);
    const trnType = norm(typeMatch?.[1] || '');

    // Data (formato YYYYMMDD...)
    const dateMatch = content.match(/<DTPOSTED>(\d{4})(\d{2})(\d{2})/i);
    if (!dateMatch) continue;
    const date = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
    if (!date) continue;

    // Valor
    const amtMatch = content.match(/<TRNAMT>([-+]?\d+(?:\.\d+)?)/i);
    if (!amtMatch) continue;
    const numAmt = parseFloat(amtMatch[1]);
    if (isNaN(numAmt) || numAmt === 0) continue;

    // Descrição (MEMO ou NAME ou CHECKNUM)
    const memoMatch = content.match(/<MEMO>([^<\r\n]+)/i);
    const nameMatch = content.match(/<NAME>([^<\r\n]+)/i);
    const checkMatch = content.match(/<CHECKNUM>([^<\r\n]+)/i);
    const rawDesc = memoMatch?.[1] || nameMatch?.[1] || checkMatch?.[1] || 'Lançamento bancário';
    const description = cleanXml(rawDesc).slice(0, 140) || 'Lançamento bancário';

    // Se for CREDIT ou positivo -> income, senão expense
    const isCredit = trnType === 'credit' || numAmt > 0;
    const type = isCredit ? 'income' : 'expense';
    const amountCents = Math.round(Math.abs(numAmt) * 100);

    items.push({
      date,
      description,
      amountCents,
      type,
      category: categorizeTransaction(description, type)
    });
  }

  return items;
}

/**
 * Parser de CSV de extrato bancário
 */
export function parseCsv(text) {
  if (typeof text !== 'string' || !text.trim()) return [];

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detecta separador (; , ou \t)
  const firstLine = lines[0];
  const countSemi = (firstLine.match(/;/g) || []).length;
  const countComma = (firstLine.match(/,/g) || []).length;
  const countTab = (firstLine.match(/\t/g) || []).length;
  const sep = countTab > countSemi && countTab > countComma ? '\t' : countSemi >= countComma ? ';' : ',';

  // Identifica colunas
  const headers = firstLine.split(sep).map(h => norm(h.replace(/^["']|["']$/g, '')));
  let dateCol = headers.findIndex(h => /data|date|dt/.test(h));
  let descCol = headers.findIndex(h => /descri|histor|memor|title|lancament|transa/.test(h));
  let amountCol = headers.findIndex(h => /valor|quantia|amount/.test(h));
  let debitCol = headers.findIndex(h => /debito|debit|saida/.test(h));
  let creditCol = headers.findIndex(h => /credito|credit|entrada/.test(h));

  // Fallback caso não haja cabeçalho formal
  if (dateCol < 0) dateCol = 0;
  if (descCol < 0) descCol = 1;
  if (amountCol < 0 && debitCol < 0 && creditCol < 0) amountCol = 2;

  const items = [];
  const startRow = (dateCol >= 0 && /data|date/.test(headers[dateCol])) ? 1 : 0;

  for (let i = startRow; i < lines.length; i++) {
    const rawCols = lines[i].split(sep).map(c => c.replace(/^["']|["']$/g, '').trim());
    if (rawCols.length < 2) continue;

    // Extrai data
    const rawDate = rawCols[dateCol] || '';
    let date = null;
    const dmy = rawDate.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
    if (dmy) {
      const year = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3];
      date = toIsoDate(year, dmy[2], dmy[1]);
    } else {
      const ymd = rawDate.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
      if (ymd) date = toIsoDate(ymd[1], ymd[2], ymd[3]);
    }
    if (!date) continue;

    // Extrai descrição
    const description = (rawCols[descCol] || 'Lançamento').slice(0, 140);

    // Extrai valor
    let amountCents = 0;
    let isIncome = false;

    if (debitCol >= 0 && creditCol >= 0) {
      const dVal = rawCols[debitCol];
      const cVal = rawCols[creditCol];
      if (cVal && /[1-9]/.test(cVal)) {
        try { amountCents = parseBrlCents(cVal); isIncome = true; } catch {}
      } else if (dVal && /[1-9]/.test(dVal)) {
        try { amountCents = parseBrlCents(dVal); isIncome = false; } catch {}
      }
    } else if (amountCol >= 0 && rawCols[amountCol]) {
      const rawVal = rawCols[amountCol];
      const isNegative = rawVal.includes('-') || /\b[Dd]\b/.test(rawVal) || /\(.*\)/.test(rawVal);
      const isPositive = rawVal.includes('+') || /\b[Cc]\b/.test(rawVal);
      try {
        amountCents = parseBrlCents(rawVal.replace(/[-+CDcd()]/g, '').trim());
        isIncome = isPositive || (!isNegative && (norm(description).includes('pix recebido') || norm(description).includes('salario')));
      } catch {}
    }

    if (amountCents > 0) {
      const type = isIncome ? 'income' : 'expense';
      items.push({
        date,
        description,
        amountCents,
        type,
        category: categorizeTransaction(description, type)
      });
    }
  }

  return items;
}

/**
 * Parser de texto livre de extrato colado de app ou PDF
 * Exemplos:
 * 24/10/2026 PIX ENVIADO FULANO -50,00
 * 23/10/2026 SALARIO +3.500,00
 * 22/10 Farmacia Raia R$ 45,90 D
 */
export function parseStatementText(text) {
  if (typeof text !== 'string' || !text.trim()) return [];

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  const currentYear = new Date().getFullYear();

  for (const line of lines) {
    // Procura data DD/MM/YYYY ou DD/MM
    const dateMatch = line.match(/\b(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](\d{2,4}))?\b/);
    if (!dateMatch) continue;

    const day = dateMatch[1];
    const month = dateMatch[2];
    const year = dateMatch[3] ? (dateMatch[3].length === 2 ? '20' + dateMatch[3] : dateMatch[3]) : String(currentYear);
    const date = toIsoDate(year, month, day);
    if (!date) continue;

    // Procura valor monetário com ou sem R$, ex: R$ 1.250,00 ou -35,50 ou 100,00 D
    const valueMatch = line.match(/(?:R\$\s*)?([-+]?\s*\d{1,3}(?:\.\d{3})*,\d{2}|\b[-+]?\d+,\d{2}\b|\b[-+]?\d+\.\d{2}\b)(?:\s*([CDcd]))?/);
    if (!valueMatch) continue;

    const rawValStr = valueMatch[1].replace(/\s+/g, '');
    const flagCD = (valueMatch[2] || '').toUpperCase();
    const isNegative = rawValStr.includes('-') || flagCD === 'D';
    const isPositive = rawValStr.includes('+') || flagCD === 'C';

    let amountCents = 0;
    try {
      amountCents = parseBrlCents(rawValStr.replace(/[-+]/g, '').trim());
    } catch {
      continue;
    }
    if (amountCents <= 0) continue;

    // Remove a data e o valor da linha para sobrar a descrição
    let desc = line
      .replace(dateMatch[0], ' ')
      .replace(valueMatch[0], ' ')
      .replace(/\bR\$\b/gi, ' ')
      .replace(/[-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!desc || desc.length < 2) {
      desc = 'Lançamento bancário';
    }
    desc = desc.slice(0, 140);

    const descNorm = norm(desc);

    // Determina se é Entrada ou Saída
    let isIncome = false;
    if (isPositive) {
      isIncome = true;
    } else if (isNegative) {
      isIncome = false;
    } else if (/\b(recebid[oa]|salario|estorno|reembolso|rendimento|proventos|ted recebida|doc recebido|deposito)\b/.test(descNorm)) {
      isIncome = true;
    } else {
      // Por padrão em extratos, sem sinal explícito, considera saída
      isIncome = false;
    }

    const type = isIncome ? 'income' : 'expense';
    items.push({
      date,
      description: desc,
      amountCents,
      type,
      category: categorizeTransaction(desc, type)
    });
  }

  return items;
}

/**
 * Detecta o formato e processa o extrato
 */
export function analyzeStatement({ text, existingTransactions = [], accountId, memberId }) {
  let parsed = [];
  if (text.includes('<OFX>') || text.includes('<STMTTRN>')) {
    parsed = parseOfx(text);
  } else {
    // Se tiver linhas com mais de 1 delimitador (ex: Data;Descricao;Valor), tenta CSV
    const firstNonEmpty = text.split(/\r?\n/).map(l => l.trim()).find(Boolean) || '';
    const hasCsvDelim = (firstNonEmpty.match(/;/g) || []).length >= 1 || (firstNonEmpty.match(/,/g) || []).length >= 2;
    if (hasCsvDelim) {
      parsed = parseCsv(text);
    }
    if (!parsed.length) {
      parsed = parseStatementText(text);
    }
  }

  if (!parsed.length) {
    throw Error('Nenhum lançamento foi identificado. Verifique se o arquivo ou texto contém data, descrição e valor.');
  }

  // Compara com transações já existentes para marcar duplicatas potenciais
  let totalIncomeCents = 0;
  let totalExpenseCents = 0;
  let duplicateCount = 0;

  const dates = [];

  const candidates = parsed.map(item => {
    dates.push(item.date);
    const isDup = existingTransactions.some(ex =>
      ex.accountId === accountId &&
      ex.date === item.date &&
      ex.amountCents === item.amountCents &&
      (norm(ex.description) === norm(item.description) ||
       norm(ex.description).includes(norm(item.description)) ||
       norm(item.description).includes(norm(ex.description)))
    );

    if (isDup) duplicateCount++;

    if (item.type === 'income') totalIncomeCents += item.amountCents;
    else totalExpenseCents += item.amountCents;

    return {
      id: uid(),
      tempId: uid(),
      description: item.description,
      amountCents: item.amountCents,
      date: item.date,
      type: item.type,
      category: item.category,
      accountId,
      memberId,
      notes: 'Importado de extrato bancário',
      tags: [],
      priority: '',
      isDuplicate: isDup,
      selected: !isDup // Por segurança, não seleciona duplicata automaticamente
    };
  });

  dates.sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  return {
    candidates,
    summary: {
      totalCount: candidates.length,
      duplicateCount,
      totalIncomeCents,
      totalExpenseCents,
      netCents: totalIncomeCents - totalExpenseCents,
      startDate,
      endDate
    }
  };
}

/**
 * Interface Modal Responsiva para Análise e Importação de Extrato
 */
export function openBankStatementDialog(c, initialAccountId = null) {
  if (!c.state.accounts.length) {
    c.navigate('accounts');
    c.notify('Cadastre uma conta antes de importar o extrato bancário.', 'error');
    return;
  }

  const accounts = c.state.accounts;
  let selectedAccountId = initialAccountId || accounts[0]?.id;
  const memberId = c.state.members.find(m => m.id === 'me')?.id || c.state.members[0]?.id;

  const container = el('div', { class: 'statement-dialog-container' });

  // 1. Etapa de Entrada
  function renderInputStep() {
    let activeTab = 'file'; // 'file' | 'text'
    let rawText = '';
    let fileName = '';

    const wrap = el('div', { class: 'statement-step-wrap' });

    // Seletor de conta bancária
    const accountSelect = el('select', {
      class: 'statement-account-select',
      'aria-label': 'Conta bancária de destino',
      onChange: e => { selectedAccountId = e.target.value; }
    }, accounts.map(a => el('option', { value: a.id, selected: a.id === selectedAccountId }, a.name)));

    const accountField = el('div', { class: 'field' }, [
      el('label', { for: 'statement-account' }, 'Conta bancária no Finance OS:'),
      accountSelect,
      el('small', {}, 'As transações serão associadas a esta conta.')
    ]);

    // Abas
    const tabFileBtn = el('button', {
      type: 'button',
      class: 'btn statement-tab active',
      onClick: () => switchTab('file')
    }, [icon('wallet'), 'Arquivo (OFX ou CSV)']);

    const tabTextBtn = el('button', {
      type: 'button',
      class: 'btn statement-tab',
      onClick: () => switchTab('text')
    }, [icon('note'), 'Colar texto do extrato']);

    const tabHeader = el('div', { class: 'statement-tabs' }, [tabFileBtn, tabTextBtn]);

    // Painel 1: Arquivo
    const fileInput = el('input', {
      type: 'file',
      accept: '.ofx,.csv,.txt',
      id: 'statement-file-input',
      class: 'statement-file-input',
      onChange: async e => {
        const file = e.target.files?.[0];
        if (file) {
          fileName = file.name;
          fileLabel.textContent = `Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
          rawText = await file.text();
          analyzeBtn.disabled = false;
        }
      }
    });

    const fileLabel = el('span', { class: 'statement-file-label' }, 'Toque para escolher seu arquivo .ofx ou .csv do banco');
    const fileDropzone = el('label', {
      for: 'statement-file-input',
      class: 'statement-dropzone'
    }, [
      icon('upload'),
      fileLabel,
      el('small', { class: 'muted' }, 'Suporta extratos OFX de qualquer banco brasileiro (Itaú, Nubank, Bradesco, Inter, Santander, BB, etc.)')
    ]);

    const filePanel = el('div', { class: 'statement-tab-panel' }, [fileInput, fileDropzone]);

    // Painel 2: Colar texto
    const textarea = el('textarea', {
      class: 'statement-textarea',
      placeholder: 'Cole aqui o texto do extrato copiado do app do seu banco ou PDF...\n\nExemplo:\n24/10/2026 PIX RECEBIDO JOAO SILVA R$ 500,00\n23/10/2026 SUPERMERCADO ABC R$ -145,20\n22/10/2026 POSTO IPIRANGA 150,00 D',
      rows: 7,
      onInput: e => {
        rawText = e.target.value;
        analyzeBtn.disabled = !rawText.trim();
      }
    });

    const textPanel = el('div', { class: 'statement-tab-panel hide' }, [
      el('p', { class: 'small muted', style: 'margin-bottom:8px;' }, 'Dica para celular: Abra o extrato no app do seu banco, copie as linhas e cole aqui.'),
      textarea
    ]);

    function switchTab(tab) {
      activeTab = tab;
      tabFileBtn.classList.toggle('active', tab === 'file');
      tabTextBtn.classList.toggle('active', tab === 'text');
      filePanel.classList.toggle('hide', tab !== 'file');
      textPanel.classList.toggle('hide', tab !== 'text');
      analyzeBtn.disabled = tab === 'file' ? !rawText : !textarea.value.trim();
    }

    const errBox = el('p', { class: 'form-error' });

    const analyzeBtn = el('button', {
      type: 'button',
      class: 'btn primary statement-analyze-btn',
      disabled: true,
      onClick: () => {
        errBox.textContent = '';
        try {
          const content = activeTab === 'file' ? rawText : textarea.value;
          if (!content.trim()) throw Error('Selecione um arquivo ou cole o texto do extrato.');

          const analysis = analyzeStatement({
            text: content,
            existingTransactions: c.state.transactions,
            accountId: selectedAccountId,
            memberId
          });

          renderReviewStep(analysis);
        } catch (err) {
          errBox.textContent = err.message;
        }
      }
    }, [icon('sparkles'), 'Analisar extrato bancário']);

    wrap.append(accountField, tabHeader, filePanel, textPanel, errBox, analyzeBtn);
    container.replaceChildren(wrap);
  }

  // 2. Etapa de Revisão e Análise
  function renderReviewStep(analysis) {
    const { candidates, summary } = analysis;
    const accountName = accounts.find(a => a.id === selectedAccountId)?.name || 'Conta';

    const wrap = el('div', { class: 'statement-review-wrap' });

    // Cards de Resumo Financeiro
    const summaryCards = el('div', { class: 'statement-summary-grid' }, [
      el('div', { class: 'statement-metric income' }, [
        el('small', {}, 'Entradas no extrato'),
        el('strong', {}, '+ ' + money(summary.totalIncomeCents, false)),
        el('span', { class: 'small' }, `${candidates.filter(c => c.type === 'income').length} lançamentos`)
      ]),
      el('div', { class: 'statement-metric expense' }, [
        el('small', {}, 'Saídas no extrato'),
        el('strong', {}, '− ' + money(summary.totalExpenseCents, false)),
        el('span', { class: 'small' }, `${candidates.filter(c => c.type === 'expense').length} lançamentos`)
      ]),
      el('div', { class: 'statement-metric net' }, [
        el('small', {}, 'Resultado líquido'),
        el('strong', { class: summary.netCents >= 0 ? 'positive' : 'negative' }, (summary.netCents >= 0 ? '+ ' : '') + money(summary.netCents, false)),
        el('span', { class: 'small' }, `Período: ${summary.startDate.slice(5)} a ${summary.endDate.slice(5)}`)
      ])
    ]);

    // Alerta de duplicatas se houver
    let dupNotice = null;
    if (summary.duplicateCount > 0) {
      dupNotice = el('div', { class: 'notice warning' }, [
        icon('note'),
        el('span', {}, ` ${summary.duplicateCount} lançamento(s) já existente(s) foram desmarcados automaticamente para evitar duplicidade.`)
      ]);
    }

    // Ações de seleção em massa
    const countLabel = el('span', { class: 'small secondary' });
    const updateCount = () => {
      const selected = candidates.filter(c => c.selected);
      countLabel.textContent = `${selected.length} de ${candidates.length} selecionados`;
      confirmBtn.disabled = selected.length === 0;
      confirmBtn.replaceChildren(icon('check'), ` Importar ${selected.length} lançamentos para ${accountName}`);
    };

    const toggleAllBtn = el('button', {
      type: 'button',
      class: 'btn ghost small',
      onClick: () => {
        const anyUnselected = candidates.some(c => !c.selected);
        candidates.forEach(c => { c.selected = anyUnselected; });
        wrap.querySelectorAll('.statement-row-check').forEach(cb => { cb.checked = anyUnselected; });
        updateCount();
      }
    }, 'Alternar todos');

    const selectBar = el('div', { class: 'statement-select-bar' }, [
      countLabel,
      toggleAllBtn
    ]);

    // Lista interativa responsiva de transações
    const listWrap = el('div', { class: 'statement-list' });

    candidates.forEach((cand, idx) => {
      const check = el('input', {
        type: 'checkbox',
        class: 'statement-row-check',
        checked: cand.selected,
        'aria-label': 'Selecionar lançamento',
        onChange: e => {
          cand.selected = e.target.checked;
          updateCount();
        }
      });

      const catSelect = el('select', {
        class: 'statement-category-select',
        'aria-label': 'Categoria',
        onChange: e => { cand.category = e.target.value; }
      }, categories.map(cat => el('option', { value: cat, selected: cat === cand.category }, cat)));

      const row = el('div', {
        class: 'statement-row ' + (cand.type === 'income' ? 'is-income' : 'is-expense') + (cand.isDuplicate ? ' is-duplicate' : '')
      }, [
        check,
        el('div', { class: 'statement-row-main' }, [
          el('div', { class: 'statement-row-top' }, [
            el('b', {}, cand.description),
            el('span', { class: 'number ' + (cand.type === 'income' ? 'positive' : 'negative') },
              (cand.type === 'income' ? '+ ' : '− ') + money(cand.amountCents, false))
          ]),
          el('div', { class: 'statement-row-sub' }, [
            el('span', { class: 'small muted' }, cand.date),
            cand.isDuplicate && el('span', { class: 'statement-dup-badge' }, 'Possível duplicata'),
            catSelect
          ])
        ])
      ]);

      listWrap.append(row);
    });

    const errorMsg = el('p', { class: 'form-error' });

    // Botões de Ação
    const backBtn = el('button', {
      type: 'button',
      class: 'btn ghost',
      onClick: () => renderInputStep()
    }, 'Voltar');

    const confirmBtn = el('button', {
      type: 'button',
      class: 'btn primary statement-confirm-btn',
      onClick: () => {
        errorMsg.textContent = '';
        try {
          const toImport = candidates
            .filter(c => c.selected)
            .map(({ id, description, amountCents, date, type, category, accountId, memberId, notes, tags, priority }) => ({
              id,
              description,
              amountCents,
              date,
              type,
              category,
              accountId,
              memberId,
              notes,
              tags,
              priority
            }));

          if (!toImport.length) throw Error('Selecione pelo menos um lançamento para importar.');

          c.dispatch('importTransactions', toImport);
          toast(`${toImport.length} lançamentos adicionados a ${accountName}!`);
          dialog.close();
          dialog.remove();
        } catch (err) {
          errorMsg.textContent = err.message;
        }
      }
    });

    updateCount();

    const actionsBar = el('div', { class: 'statement-actions-bar' }, [
      backBtn,
      confirmBtn
    ]);

    wrap.append(summaryCards, dupNotice, selectBar, listWrap, errorMsg, actionsBar);
    container.replaceChildren(wrap);
  }

  // Render inicial
  renderInputStep();

  const dialog = openDialog({
    title: 'Importar Extrato Bancário',
    content: container,
    submitLabel: 'Fechar',
    onSubmit: () => {}
  });

  // Remove o botão padrão do dialog para usar os botões interativos do fluxo
  const defaultActions = dialog.querySelector('.dialog-actions');
  if (defaultActions) defaultActions.style.display = 'none';

  return dialog;
}
