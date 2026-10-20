import { BY_ID } from '../data/archive.js';
/* tiny shared state + event bus (no backend: persisted to localStorage) */
const L = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('ca.' + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('ca.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const ev = new Map();
const priorSaved = L.get('saved', []);
const validSaved = (Array.isArray(priorSaved) ? priorSaved : []).filter((id) => BY_ID.has(id));
L.set('saved', validSaved);

export const store = {
  /** archive ids the user saved */
  saved: new Set(validSaved),
  /**
   * cargo queued for the inference page. item shape:
   * { id, name, kind: 'doc'|'code'|'patch'|'text'|'record', size (bytes), text, lang?, from? }
   */
  cargo: [],
  booted: sessionStorage.getItem('ca.booted') === '1',

  on(name, fn) { if (!ev.has(name)) ev.set(name, new Set()); ev.get(name).add(fn); return () => ev.get(name).delete(fn); },
  emit(name, data) { ev.get(name)?.forEach((f) => f(data)); },

  toggleSave(id) {
    if (!BY_ID.has(id)) return false;
    this.saved.has(id) ? this.saved.delete(id) : this.saved.add(id);
    L.set('saved', [...this.saved]);
    this.emit('saved', id);
    return this.saved.has(id);
  },
  addCargo(item) {
    if (this.cargo.some((c) => c.id === item.id)) return false;
    this.cargo.push(item);
    this.emit('cargo', this.cargo);
    return true;
  },
  markBooted() { this.booted = true; sessionStorage.setItem('ca.booted', '1'); },
};
