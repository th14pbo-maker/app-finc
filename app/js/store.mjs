import {validateState} from './domain.mjs';

export const VISITOR_KEY = 'finance-os:personal:v1';

export function createStore(storage, seed, initialUser = null) {
  let currentUser = initialUser;
  let activeKey = currentUser ? `finance-os:user:${currentUser.id}:v1` : VISITOR_KEY;
  let state = structuredClone(seed);
  let error = '';
  let locked = false;
  const listeners = new Set();

  function loadFromStorage(key) {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!validateState(parsed)) throw Error('schema');
        state = parsed;
        error = '';
        locked = false;
        return true;
      }
    } catch {
      error = 'Não foi possível ler os dados locais. Seus dados originais foram preservados.';
      locked = true;
      return false;
    }
    return false;
  }

  // Initial load
  loadFromStorage(activeKey);

  const api = {
    getState: () => structuredClone(state),
    get error() { return error; },
    getCurrentKey: () => activeKey,
    getCurrentUser: () => currentUser,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setUser(user, defaultState = null) {
      currentUser = user;
      activeKey = user ? `finance-os:user:${user.id}:v1` : VISITOR_KEY;
      error = '';
      locked = false;
      const loaded = loadFromStorage(activeKey);
      if (!loaded) {
        state = structuredClone(defaultState || seed);
      }
      listeners.forEach(f => f());
    },
    save(next) {
      if (locked) return { ok: false, error };
      if (!validateState(next)) return { ok: false, error: 'Os dados não são válidos.' };
      try {
        storage.setItem(activeKey, JSON.stringify(next));
        state = structuredClone(next);
        error = '';
        listeners.forEach(f => f());
        return { ok: true };
      } catch {
        error = 'Não foi possível salvar neste navegador. A alteração não foi aplicada.';
        return { ok: false, error };
      }
    },
    reset(next) {
      const wasLocked = locked;
      locked = false;
      const result = api.save(next);
      if (!result.ok) locked = wasLocked;
      return result;
    }
  };

  return api;
}
