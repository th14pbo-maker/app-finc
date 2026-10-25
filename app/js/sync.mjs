/**
 * Finance OS — User Isolation & Cloud Sync Manager
 * Enforces strict per-user memory isolation, offline queues, and Supabase PostgREST sync.
 */

import { validateState } from './domain.mjs';
import { initialState } from './initial-state.mjs';
import { validateImportPayload } from './import-payload.mjs';

export const VISITOR_KEY = 'finance-os:personal:v1';

export function getUserStorageKey(userId) {
  return `finance-os:user:${userId}:v1`;
}

export function getUserQueueKey(userId) {
  return `finance-os:sync-queue:${userId}:v1`;
}

export class SyncManager {
  constructor(store, client, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
    this.store = store;
    this.client = client;
    this.storage = storage;
    this.currentEpoch = 0;
    this.currentAbortController = null;
    this.currentUser = client.getUser();
    this.status = this.currentUser ? 'syncing' : 'local';
    this.listeners = new Set();
    this.isProcessingQueue = false;

    // Listen to Auth state changes
    this.client.onAuthStateChange((event, session) => {
      this.handleAuthChange(session?.user || null);
    });

    // Process queue if online
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.processQueue());
    }

    // Trigger initial synchronization if an authenticated user already exists on boot
    if (this.currentUser) {
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => {
          if (this.currentUser) {
            this.handleAuthChange(this.currentUser);
          }
        });
      } else {
        setTimeout(() => {
          if (this.currentUser) {
            this.handleAuthChange(this.currentUser);
          }
        }, 0);
      }
    }
  }

  subscribeStatus(fn) {
    this.listeners.add(fn);
    fn(this.status, this.currentUser);
    return () => this.listeners.delete(fn);
  }

  _setStatus(nextStatus) {
    if (this.status !== nextStatus) {
      this.status = nextStatus;
      this.listeners.forEach(fn => {
        try { fn(this.status, this.currentUser); } catch {}
      });
    }
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getStatus() {
    return this.status;
  }

  async handleAuthChange(newUser) {
    // 1. Advance epoch and cancel any ongoing network requests
    this.currentEpoch += 1;
    const epoch = this.currentEpoch;
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    const previousUser = this.currentUser;
    this.currentUser = newUser;

    // 2. Switching accounts or Logging out: Clean memory completely and switch store key
    if (this.store && typeof this.store.setUser === 'function') {
      this.store.setUser(newUser, initialState());
    }

    if (!newUser) {
      // Returned to Visitor mode: load visitor data
      this._setStatus('local');
      this._loadVisitorState();
      return;
    }

    // Authenticated as newUser
    this._setStatus('syncing');

    // 3. Load user's local cache if available, or initialize empty state
    const cachedState = this._loadUserCache(newUser.id);
    if (cachedState) {
      this.store.reset(cachedState);
    } else {
      // Fresh clean user space (never inherit previous user's data)
      this.store.reset(initialState());
    }

    // 4. Fetch authoritative state from Supabase
    try {
      this.currentAbortController = new AbortController();
      const remoteState = await this.client.fetchUserState();

      // Guard against race conditions: abort if user switched again
      if (epoch !== this.currentEpoch) return;

      if (validateState(remoteState)) {
        this._saveUserCache(newUser.id, remoteState);
        this.store.reset(remoteState);
        this._setStatus('synced');
      } else {
        this._setStatus('synced');
      }
    } catch (err) {
      if (epoch !== this.currentEpoch) return;
      console.warn('Could not fetch remote user state; staying in local cache:', err.message);
      this._setStatus(this.getPendingQueue(newUser.id).length > 0 ? 'pending' : 'offline');
    }
  }

  _loadVisitorState() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(VISITOR_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (validateState(parsed)) {
          this.store.reset(parsed);
          return;
        }
      }
    } catch {}
    this.store.reset(initialState());
  }

  _loadUserCache(userId) {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(getUserStorageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (validateState(parsed)) return parsed;
      }
    } catch {}
    return null;
  }

  _saveUserCache(userId, state) {
    if (!this.storage) return;
    try {
      this.storage.setItem(getUserStorageKey(userId), JSON.stringify(state));
    } catch {}
  }

  getPendingQueue(userId = this.currentUser?.id) {
    if (!userId || !this.storage) return [];
    try {
      const raw = this.storage.getItem(getUserQueueKey(userId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  _setPendingQueue(userId, queue) {
    if (!userId || !this.storage) return;
    try {
      this.storage.setItem(getUserQueueKey(userId), JSON.stringify(queue));
    } catch {}
  }

  queueMutation(action, payload) {
    if (!this.currentUser) return; // In visitor mode, mutations are purely local

    const userId = this.currentUser.id;
    const queue = this.getPendingQueue(userId);
    queue.push({
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `mut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action,
      payload,
      timestamp: Date.now()
    });
    this._setPendingQueue(userId, queue);
    this._setStatus('pending');

    // Trigger processing
    this.processQueue();
  }

  async processQueue() {
    if (!this.currentUser) return;
    if (this.currentQueuePromise) {
      return this.currentQueuePromise;
    }

    const userId = this.currentUser.id;
    const initialQueue = this.getPendingQueue(userId);
    if (!initialQueue.length) {
      if (this.status === 'pending') this._setStatus('synced');
      return;
    }

    this.currentQueuePromise = (async () => {
      this.isProcessingQueue = true;
      this._setStatus('syncing');
      const epoch = this.currentEpoch;

      try {
        while (true) {
          if (epoch !== this.currentEpoch || !this.currentUser || this.currentUser.id !== userId) {
            break;
          }

          const queue = this.getPendingQueue(userId);
          if (!queue.length) break;

          const item = queue[0];
          try {
            await this.client.syncMutation(item.action, item.payload);
            // Mutation succeeded: remove from storage queue
            const currentQueue = this.getPendingQueue(userId);
            if (currentQueue.length > 0) {
              currentQueue.shift();
              this._setPendingQueue(userId, currentQueue);
            }
          } catch (err) {
            console.warn('Sync mutation failed, will retry later:', err.message);
            this._setStatus('offline');
            break;
          }
        }
      } finally {
        this.isProcessingQueue = false;
        this.currentQueuePromise = null;
      }

      if (epoch === this.currentEpoch && this.currentUser?.id === userId) {
        const remaining = this.getPendingQueue(userId);
        if (remaining.length === 0) {
          this._setStatus('synced');
        } else {
          this._setStatus('pending');
        }
      }
    })();

    return this.currentQueuePromise;
  }

  /**
   * Has visitor data to import?
   */
  hasVisitorData() {
    if (!this.storage) return false;
    try {
      const raw = this.storage.getItem(VISITOR_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      return (s?.accounts?.length > 0 || s?.transactions?.length > 0 || s?.goals?.length > 0 || s?.cards?.length > 0);
    } catch {
      return false;
    }
  }

  getVisitorData() {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(VISITOR_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  clearVisitorData() {
    if (!this.storage) return;
    try {
      this.storage.removeItem(VISITOR_KEY);
    } catch {}
  }

  /**
   * Performs atomic assisted import to remote Supabase database via import_user_state RPC.
   * Keeps local visitor backup safe.
   */
  async performAssistedImport(customPayload = null) {
    if (!this.currentUser) {
      throw new Error('Você precisa estar conectado a uma conta para importar dados para a nuvem.');
    }

    const payload = customPayload || this.getVisitorData();
    if (!payload) {
      throw new Error('Nenhum dado local de visitante foi encontrado para importar.');
    }

    // Validate payload client-side before sending
    validateImportPayload(payload);

    this._setStatus('syncing');
    const importId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Call PostgreSQL RPC import_user_state atomically
    const result = await this.client.rpc('import_user_state', {
      payload,
      p_import_id: importId
    });

    if (!result?.success) {
      this._setStatus('error');
      throw new Error(result?.error || 'A importação não pôde ser confirmada pelo banco de dados.');
    }

    // Database confirmed! Fetch fresh authoritative state from database
    const remoteState = await this.client.fetchUserState();
    this._saveUserCache(this.currentUser.id, remoteState);
    this.store.reset(remoteState);
    this._setStatus('synced');

    return result;
  }
}

let defaultSyncManager = null;
export function initSyncManager(store, client) {
  defaultSyncManager = new SyncManager(store, client);
  return defaultSyncManager;
}

export function getSyncManager() {
  return defaultSyncManager;
}
