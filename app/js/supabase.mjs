/**
 * Finance OS — Lean ESM Supabase Client
 * Auth (GoTrue) + Database (PostgREST) + RPC (import_user_state)
 * Works in browser and test environments (Node.js).
 */

import { getSupabaseConfig } from './supabase-config.mjs';

const SESSION_KEY = 'finance-os:session:v1';

export class SupabaseClient {
  constructor(options = {}) {
    this.storage = options.storage || (typeof window !== 'undefined' ? window.localStorage : null);
    this.fetchFn = options.fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : globalThis.fetch);
    this.config = options.config || getSupabaseConfig(this.storage);
    this.listeners = new Set();
    this.currentSession = this._loadSession();
  }

  _loadSession() {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s?.access_token && s?.user?.id) {
        // If expired by more than 60s, return null
        if (s.expires_at && Date.now() / 1000 > s.expires_at) {
          this.storage.removeItem(SESSION_KEY);
          return null;
        }
        return s;
      }
    } catch {}
    return null;
  }

  _saveSession(session) {
    this.currentSession = session;
    if (this.storage) {
      if (session) {
        this.storage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        this.storage.removeItem(SESSION_KEY);
      }
    }
    this._notifyAuth(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
  }

  _notifyAuth(event, session) {
    this.listeners.forEach(fn => {
      try { fn(event, session); } catch (e) { console.error('Auth listener error:', e); }
    });
  }

  onAuthStateChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getSession() {
    return this.currentSession;
  }

  getUser() {
    return this.currentSession?.user || null;
  }

  async signUp({ email, password, displayName }) {
    const url = `${this.config.url}/auth/v1/signup`;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (displayName || '').trim().slice(0, 60) || 'Você';

    let res;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'apikey': this.config.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          data: { displayName: cleanName }
        })
      });
    } catch (err) {
      throw new Error(`Falha de conexão com o servidor de autenticação: ${err.message}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.msg || data.message || data.error_description || '';
      if (
        msg.includes('convite') ||
        msg.includes('allowed_emails') ||
        msg.includes('Database error') ||
        msg.includes('saving new user') ||
        msg.includes('não autorizado') ||
        msg.includes('restrito') ||
        res.status >= 400
      ) {
        throw new Error('Acesso restrito: este e-mail não possui convite autorizado na lista da família.');
      }
      throw new Error(msg || 'Não foi possível concluir o cadastro.');
    }

    if (data.session) {
      this._saveSession(data.session);
    }
    return { user: data.user, session: data.session };
  }

  async signInWithPassword({ email, password }) {
    const url = `${this.config.url}/auth/v1/token?grant_type=password`;
    const cleanEmail = (email || '').trim().toLowerCase();

    let res;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'apikey': this.config.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: cleanEmail, password })
      });
    } catch (err) {
      throw new Error(`Falha de conexão ao entrar: ${err.message}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.msg || data.error_description || data.message || '';
      if (msg.includes('Invalid login') || res.status === 400) {
        throw new Error('E-mail ou senha incorretos.');
      }
      throw new Error(msg || 'Falha ao autenticar.');
    }

    this._saveSession(data);
    return { user: data.user, session: data };
  }

  async resetPasswordForEmail(email, redirectTo = null) {
    const defaultRedirect = (typeof window !== 'undefined' && window.location?.origin)
      ? window.location.origin
      : 'https://app-finc.vercel.app';
    const targetRedirect = redirectTo || defaultRedirect;
    const url = `${this.config.url}/auth/v1/recover?redirect_to=${encodeURIComponent(targetRedirect)}`;
    const cleanEmail = (email || '').trim().toLowerCase();

    let res;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'apikey': this.config.anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: cleanEmail })
      });
    } catch (err) {
      throw new Error(`Falha de conexão para recuperação de senha: ${err.message}`);
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.msg || data.message || 'Não foi possível enviar o link de recuperação.');
    }
    return { ok: true };
  }

  setSession(session) {
    this._saveSession(session);
    return session;
  }

  async updateUser({ password, data: userMetadata }) {
    const session = this.currentSession;
    if (!session?.access_token) {
      throw new Error('Sessão expirada ou inválida para atualização de senha.');
    }

    const url = `${this.config.url}/auth/v1/user`;
    const body = {};
    if (password) body.password = password;
    if (userMetadata) body.data = userMetadata;

    let res;
    try {
      res = await this.fetchFn(url, {
        method: 'PUT',
        headers: {
          'apikey': this.config.anonKey,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    } catch (err) {
      throw new Error(`Falha de conexão ao atualizar usuário: ${err.message}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.msg || data.message || 'Não foi possível atualizar os dados.');
    }

    if (data.id) {
      this.currentSession.user = data;
      this._saveSession(this.currentSession);
    }
    return { user: data };
  }

  async signOut() {
    if (this.currentSession?.access_token) {
      const url = `${this.config.url}/auth/v1/logout`;
      try {
        await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'apikey': this.config.anonKey,
            'Authorization': `Bearer ${this.currentSession.access_token}`
          }
        });
      } catch {}
    }
    this._saveSession(null);
    return { ok: true };
  }

  async rpc(functionName, params = {}) {
    const session = this.currentSession;
    if (!session?.access_token) {
      throw new Error('Usuário não autenticado.');
    }

    const url = `${this.config.url}/rest/v1/rpc/${functionName}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'apikey': this.config.anonKey,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message || data?.details || `Erro RPC ${functionName} (${res.status})`);
    }
    return data;
  }

  async fetchUserState() {
    const session = this.currentSession;
    if (!session?.access_token) {
      throw new Error('Sessão expirada ou usuário não autenticado.');
    }

    const headers = {
      'apikey': this.config.anonKey,
      'Authorization': `Bearer ${session.access_token}`,
      'Accept': 'application/json'
    };

    const get = async (table, query = '') => {
      const res = await this.fetchFn(`${this.config.url}/rest/v1/${table}${query}`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Erro ao carregar ${table} (${res.status})`);
      }
      return res.json();
    };

    const [profiles, members, accounts, cards, goals, contributions, transactions] = await Promise.all([
      get('profiles', '?select=*&limit=1'),
      get('members', '?select=*&order=created_at.asc'),
      get('accounts', '?select=*&order=created_at.asc'),
      get('cards', '?select=*&order=created_at.asc'),
      get('goals', '?select=*&order=created_at.asc'),
      get('contributions', '?select=*&order=date.asc'),
      get('transactions', '?select=*&order=date.desc')
    ]);

    const prof = profiles?.[0] || {};
    const memberList = (members && members.length > 0)
      ? members.map(m => ({ id: m.id, name: m.name }))
      : [{ id: 'me', name: prof.display_name || 'Você' }];

    return {
      version: 1,
      members: memberList,
      accounts: (accounts || []).map(a => ({
        id: a.id,
        name: a.name,
        initialCents: Number(a.initial_cents),
        color: a.color
      })),
      cards: (cards || []).map(c => ({
        id: c.id,
        name: c.name,
        limitCents: Number(c.limit_cents),
        color: c.color,
        closingDay: c.closing_day,
        dueDay: c.due_day
      })),
      goals: (goals || []).map(g => ({
        id: g.id,
        name: g.name,
        kind: g.kind,
        targetCents: Number(g.target_cents),
        initialCents: Number(g.initial_cents),
        targetDate: g.target_date
      })),
      contributions: (contributions || []).map(c => ({
        id: c.id,
        goalId: c.goal_id,
        date: c.date,
        amountCents: Number(c.amount_cents)
      })),
      transactions: (transactions || []).map(t => ({
        id: t.id,
        description: t.description,
        notes: t.notes ?? undefined,
        type: t.type,
        amountCents: Number(t.amount_cents),
        date: t.date,
        accountId: t.account_id ?? undefined,
        toAccountId: t.to_account_id ?? undefined,
        cardId: t.card_id ?? undefined,
        invoiceMonth: t.invoice_month ?? undefined,
        category: t.category,
        memberId: t.member_id || memberList[0].id,
        tags: Array.isArray(t.tags) ? t.tags : []
      })),
      preferences: {
        displayName: prof.display_name || session.user?.user_metadata?.displayName || 'Você',
        theme: prof.theme || 'dark',
        hideAmounts: !!prof.hide_amounts,
        avatarPreset: (prof.avatar_preset && prof.avatar_preset !== 'user') ? prof.avatar_preset : 'man-light',
        emoji: prof.avatar_emoji || '',
        avatar: prof.avatar_data || '',
        flowChartType: prof.flow_chart_type || 'line'
      }
    };
  }

  async syncMutation(action, payload) {
    const session = this.currentSession;
    if (!session?.access_token) {
      throw new Error('Usuário não autenticado.');
    }

    const headers = {
      'apikey': this.config.anonKey,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal, resolution=merge-duplicates'
    };

    const req = async (method, path, body = null) => {
      const res = await this.fetchFn(`${this.config.url}/rest/v1/${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Erro de sincronização ${method} ${path} (${res.status})`);
      }
      return true;
    };

    switch (action) {
      case 'saveAccount':
        return req('POST', 'accounts?on_conflict=id', {
          id: payload.id,
          name: payload.name,
          initial_cents: payload.initialCents,
          color: payload.color
        });
      case 'deleteAccount':
        return req('DELETE', `accounts?id=eq.${payload}`);
      case 'saveCard':
        return req('POST', 'cards?on_conflict=id', {
          id: payload.id,
          name: payload.name,
          limit_cents: payload.limitCents,
          color: payload.color,
          closing_day: payload.closingDay,
          due_day: payload.dueDay
        });
      case 'deleteCard':
        return req('DELETE', `cards?id=eq.${payload}`);
      case 'saveGoal':
        return req('POST', 'goals?on_conflict=id', {
          id: payload.id,
          name: payload.name,
          kind: payload.kind,
          target_cents: payload.targetCents,
          initial_cents: payload.initialCents,
          target_date: payload.targetDate
        });
      case 'deleteGoal':
        return req('DELETE', `goals?id=eq.${payload}`);
      case 'contribute':
        return req('POST', 'contributions?on_conflict=id', {
          id: payload.id,
          goal_id: payload.goalId,
          date: payload.date,
          amount_cents: payload.amountCents
        });
      case 'deleteContribution':
        return req('DELETE', `contributions?id=eq.${payload}`);
      case 'saveTransaction':
        return req('POST', 'transactions?on_conflict=id', {
          id: payload.id,
          description: payload.description,
          notes: payload.notes || null,
          type: payload.type,
          amount_cents: payload.amountCents,
          date: payload.date,
          account_id: payload.accountId || null,
          to_account_id: payload.toAccountId || null,
          card_id: payload.cardId || null,
          invoice_month: payload.invoiceMonth || null,
          category: payload.category,
          member_id: payload.memberId || null,
          tags: payload.tags || []
        });
      case 'deleteTransaction':
        return req('DELETE', `transactions?id=eq.${payload}`);
      case 'preferences':
        return req('PATCH', `profiles?user_id=eq.${session.user.id}`, {
          display_name: payload.displayName,
          theme: payload.theme,
          hide_amounts: payload.hideAmounts,
          avatar_preset: payload.avatarPreset,
          avatar_emoji: payload.emoji,
          avatar_data: payload.avatar,
          flow_chart_type: payload.flowChartType
        });
      default:
        throw new Error(`Ação desconhecida de sincronização: ${action}`);
    }
  }
}

// Singleton client instance for application use
let defaultClient = null;
export function getSupabaseClient() {
  if (!defaultClient) {
    defaultClient = new SupabaseClient();
  }
  return defaultClient;
}
