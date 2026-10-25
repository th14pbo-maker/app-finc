/**
 * Finance OS — Import Payload Validation and Normalization
 * Validação rigorosa e completa no cliente e cálculo de hash SHA-256 para idempotência.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^(19\d\d|[2-9]\d{3})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_REGEX = /^(19\d\d|[2-9]\d{3})-(0[1-9]|1[0-2])$/;
const COLOR_REGEX = /^#[0-9a-f]{6}$/i;

function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidUuid(str) {
  return typeof str === 'string' && UUID_REGEX.test(str.trim());
}

/**
 * Valida integralmente o payload de importação antes do envio ao PostgreSQL.
 * Rejeita coleções ausentes/inválidas, referências fantasmas e IDs duplicados.
 */
export function validateImportPayload(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) {
    throw Error('O payload de dados está vazio ou não é um objeto JSON válido.');
  }

  const collections = ['members', 'accounts', 'cards', 'goals', 'contributions', 'transactions'];
  for (const col of collections) {
    if (!Array.isArray(s[col])) {
      throw Error(`Coleção obrigatória "${col}" ausente ou não é um array JSON.`);
    }
  }

  if (!s.preferences || typeof s.preferences !== 'object' || Array.isArray(s.preferences)) {
    throw Error('Objeto de preferências "preferences" é obrigatório.');
  }

  // 1. Members
  const memberIds = new Set();
  for (const m of s.members) {
    if (!m || typeof m.id !== 'string' || !m.id.trim()) {
      throw Error('Membro com ID inválido ou ausente.');
    }
    if (memberIds.has(m.id)) {
      throw Error(`ID duplicado na coleção de membros: "${m.id}".`);
    }
    memberIds.add(m.id);

    if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 60) {
      throw Error(`Nome do membro "${m.name || m.id}" inválido (máx. 60 caracteres).`);
    }
  }

  // Se a lista de membros for vazia no payload (ex: backup antigo sem members),
  // a regra do app infere o titular 'me'
  if (memberIds.size === 0) {
    memberIds.add('me');
  }

  // 2. Accounts
  const accountIds = new Set();
  for (const a of s.accounts) {
    if (!a || typeof a.id !== 'string' || !a.id.trim()) throw Error('Conta com ID ausente ou vazio.');
    if (accountIds.has(a.id)) throw Error(`ID duplicado na coleção de contas: "${a.id}".`);
    accountIds.add(a.id);

    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 80) {
      throw Error(`Nome de conta inválido: "${a.name}" (máx. 80 caracteres).`);
    }
    if (!Number.isSafeInteger(a.initialCents) || a.initialCents < -1e12 || a.initialCents > 1e12) {
      throw Error(`Saldo inicial inválido na conta "${a.name}".`);
    }
    if (typeof a.color !== 'string' || !COLOR_REGEX.test(a.color)) {
      throw Error(`Cor hexadecimal inválida na conta "${a.name}".`);
    }
  }

  // 3. Cards
  const cardIds = new Set();
  for (const c of s.cards) {
    if (!c || typeof c.id !== 'string' || !c.id.trim()) throw Error('Cartão com ID ausente ou vazio.');
    if (cardIds.has(c.id)) throw Error(`ID duplicado na coleção de cartões: "${c.id}".`);
    cardIds.add(c.id);

    if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 80) {
      throw Error(`Nome de cartão inválido: "${c.name}".`);
    }
    if (!Number.isSafeInteger(c.limitCents) || c.limitCents <= 0 || c.limitCents > 1e12) {
      throw Error(`Limite inválido no cartão "${c.name}".`);
    }
    if (typeof c.color !== 'string' || !COLOR_REGEX.test(c.color)) {
      throw Error(`Cor hexadecimal inválida no cartão "${c.name}".`);
    }
    if (!Number.isInteger(c.closingDay) || c.closingDay < 1 || c.closingDay > 31) {
      throw Error(`Dia de fechamento inválido no cartão "${c.name}".`);
    }
    if (!Number.isInteger(c.dueDay) || c.dueDay < 1 || c.dueDay > 31) {
      throw Error(`Dia de vencimento inválido no cartão "${c.name}".`);
    }
  }

  // 4. Goals
  const goalIds = new Set();
  for (const g of s.goals) {
    if (!g || typeof g.id !== 'string' || !g.id.trim()) throw Error('Meta com ID ausente ou vazio.');
    if (goalIds.has(g.id)) throw Error(`ID duplicado na coleção de metas: "${g.id}".`);
    goalIds.add(g.id);

    if (typeof g.name !== 'string' || !g.name.trim() || g.name.length > 80) {
      throw Error(`Nome de meta inválido: "${g.name}".`);
    }
    if (!['general', 'car', 'home'].includes(g.kind)) {
      throw Error(`Tipo de meta inválido: "${g.kind}".`);
    }
    if (!Number.isSafeInteger(g.targetCents) || g.targetCents <= 0 || g.targetCents > 1e12) {
      throw Error(`Valor de objetivo inválido na meta "${g.name}".`);
    }
    if (!Number.isSafeInteger(g.initialCents) || g.initialCents < 0 || g.initialCents > 1e12) {
      throw Error(`Reserva inicial inválida na meta "${g.name}".`);
    }
    if (typeof g.targetDate !== 'string' || !isCalendarDate(g.targetDate)) {
      throw Error(`Data alvo inválida na meta "${g.name}".`);
    }
  }

  // 5. Contributions
  const contributionIds = new Set();
  for (const c of s.contributions) {
    if (!c || typeof c.id !== 'string' || !c.id.trim()) throw Error('Aporte com ID ausente ou vazio.');
    if (contributionIds.has(c.id)) throw Error(`ID duplicado na coleção de aportes: "${c.id}".`);
    contributionIds.add(c.id);

    if (!c.goalId || typeof c.goalId !== 'string' || !goalIds.has(c.goalId)) {
      throw Error(`Aporte "${c.id}" referencia meta inexistente no payload (goalId: "${c.goalId}").`);
    }
    if (typeof c.date !== 'string' || !isCalendarDate(c.date)) {
      throw Error(`Data inválida no aporte (${c.date}).`);
    }
    if (!Number.isSafeInteger(c.amountCents) || c.amountCents <= 0 || c.amountCents > 1e12) {
      throw Error(`Valor de aporte inválido (${c.amountCents} centavos).`);
    }
  }

  // 6. Transactions
  const transactionIds = new Set();
  for (const t of s.transactions) {
    if (!t || typeof t.id !== 'string' || !t.id.trim()) throw Error('Transação com ID ausente ou vazio.');
    if (transactionIds.has(t.id)) throw Error(`ID duplicado na coleção de transações: "${t.id}".`);
    transactionIds.add(t.id);

    if (typeof t.description !== 'string' || !t.description.trim() || t.description.length > 140) {
      throw Error(`Descrição de lançamento inválida: "${t.description}".`);
    }
    if (t.notes != null && (typeof t.notes !== 'string' || t.notes.length > 2000)) {
      throw Error('Observações da transação excedem 2.000 caracteres.');
    }
    if (!Number.isSafeInteger(t.amountCents) || t.amountCents <= 0 || t.amountCents > 1e12) {
      throw Error(`Valor inválido no lançamento "${t.description}".`);
    }
    if (typeof t.date !== 'string' || !isCalendarDate(t.date)) {
      throw Error(`Data inválida no lançamento "${t.description}".`);
    }
    if (!['income', 'expense', 'transfer', 'cardPurchase', 'cardPayment'].includes(t.type)) {
      throw Error(`Tipo de movimentação desconhecido: "${t.type}".`);
    }

    // memberId: se informado, deve existir no payload (sem fallback para outro membro)
    if (t.memberId !== undefined && t.memberId !== null && String(t.memberId).trim() !== '') {
      if (!memberIds.has(t.memberId)) {
        throw Error(`Transação "${t.description}" referencia memberId inexistente no payload: "${t.memberId}".`);
      }
    } else {
      // Se ausente, valida que há membro titular disponível conforme a regra do aplicativo
      const defaultMember = memberIds.has('me') ? 'me' : [...memberIds][0];
      if (!defaultMember) {
        throw Error(`Transação "${t.description}" sem membro associável.`);
      }
    }

    // Validação estrita de referências informadas (sem converter em NULL silenciosamente)
    if (t.accountId !== undefined && t.accountId !== null) {
      if (typeof t.accountId !== 'string' || !accountIds.has(t.accountId)) {
        throw Error(`Transação "${t.description}" referencia accountId inexistente no payload: "${t.accountId}".`);
      }
    }
    if (t.toAccountId !== undefined && t.toAccountId !== null) {
      if (typeof t.toAccountId !== 'string' || !accountIds.has(t.toAccountId)) {
        throw Error(`Transação "${t.description}" referencia toAccountId inexistente no payload: "${t.toAccountId}".`);
      }
    }
    if (t.cardId !== undefined && t.cardId !== null) {
      if (typeof t.cardId !== 'string' || !cardIds.has(t.cardId)) {
        throw Error(`Transação "${t.description}" referencia cardId inexistente no payload: "${t.cardId}".`);
      }
    }

    // Regras estritas por tipo de transação (espelho fiel do SQL / domain.mjs)
    if (['income', 'expense'].includes(t.type)) {
      if (!t.accountId || !accountIds.has(t.accountId)) {
        throw Error(`Lançamento "${t.description}" (${t.type}) exige conta bancária válida existente.`);
      }
      if (t.toAccountId != null || t.cardId != null || t.invoiceMonth != null) {
        throw Error(`Lançamento "${t.description}" possui campos incompatíveis com seu tipo (${t.type}).`);
      }
    } else if (t.type === 'transfer') {
      if (!t.accountId || !accountIds.has(t.accountId)) {
        throw Error(`Transferência "${t.description}" sem conta de origem válida.`);
      }
      if (!t.toAccountId || !accountIds.has(t.toAccountId)) {
        throw Error(`Transferência "${t.description}" sem conta de destino válida.`);
      }
      if (t.accountId === t.toAccountId) {
        throw Error(`Transferência "${t.description}" não pode ter a mesma conta como origem e destino.`);
      }
      if (t.cardId != null || t.invoiceMonth != null) {
        throw Error(`Transferência "${t.description}" não pode conter cartão ou fatura.`);
      }
    } else if (t.type === 'cardPurchase') {
      if (!t.cardId || !cardIds.has(t.cardId)) {
        throw Error(`Compra no cartão "${t.description}" sem cartão válido existente.`);
      }
      if (t.accountId != null || t.toAccountId != null || t.invoiceMonth != null) {
        throw Error(`Compra no cartão "${t.description}" possui campos de conta ou fatura indevidos.`);
      }
    } else if (t.type === 'cardPayment') {
      if (!t.accountId || !accountIds.has(t.accountId)) {
        throw Error(`Pagamento de fatura "${t.description}" exige conta de pagamento válida.`);
      }
      if (!t.cardId || !cardIds.has(t.cardId)) {
        throw Error(`Pagamento de fatura "${t.description}" exige cartão de crédito válido.`);
      }
      if (t.toAccountId != null) {
        throw Error(`Pagamento de fatura "${t.description}" não permite conta de destino.`);
      }
      if (!t.invoiceMonth || typeof t.invoiceMonth !== 'string' || !MONTH_REGEX.test(t.invoiceMonth)) {
        throw Error(`Pagamento de fatura "${t.description}" exige o mês da fatura obrigatório no formato YYYY-MM.`);
      }
    }
  }

  return true;
}

/**
 * Gera hash SHA-256 estável em formato hexadecimal de 64 caracteres para idempotência.
 */
export async function computePayloadHash(payload) {
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  const nodeCrypto = await import('node:crypto');
  return nodeCrypto.createHash('sha256').update(json).digest('hex');
}
