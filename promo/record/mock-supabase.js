// Test-only stand-in for @supabase/supabase-js, used only by promo/record.js.
// Tabs of one browser context share a room through BroadcastChannel, so the
// recorded host phone and scripted demo players (presence-only bots) meet in
// the same room without any backend. The app itself is not changed.

const uid = () => Math.random().toString(36).slice(2, 10);

class MockChannel {
  constructor(name, opts = {}) {
    this.name = name;
    this.key = opts.config?.presence?.key ?? uid();
    this.listeners = [];
    this.presence = {};
    this.own = null;
    this.bc = new BroadcastChannel(`mock-supabase:${name}`);
    this.bc.onmessage = ({ data }) => this.receive(data);
  }

  on(type, filter, cb) {
    this.listeners.push({ type, event: filter.event, cb });
    return this;
  }

  subscribe(cb) {
    queueMicrotask(() => {
      cb?.('SUBSCRIBED');
      this.bc.postMessage({ kind: 'hello' });
    });
    return this;
  }

  send({ type, event, payload }) {
    if (type === 'broadcast') this.bc.postMessage({ kind: 'broadcast', event, payload });
    return Promise.resolve('ok');
  }

  async track(meta) {
    this.own = meta;
    this.presence[this.key] = [meta];
    this.bc.postMessage({ kind: 'presence', key: this.key, meta });
    this.emit('presence', 'sync');
    return 'ok';
  }

  async untrack() {
    this.own = null;
    delete this.presence[this.key];
    this.bc.postMessage({ kind: 'leave', key: this.key });
    this.emit('presence', 'sync');
    return 'ok';
  }

  presenceState() {
    return structuredClone(this.presence);
  }

  receive(msg) {
    if (msg.kind === 'broadcast') {
      this.emit('broadcast', msg.event, { payload: msg.payload });
    } else if (msg.kind === 'presence') {
      this.presence[msg.key] = [msg.meta];
      this.emit('presence', 'sync');
    } else if (msg.kind === 'leave') {
      delete this.presence[msg.key];
      this.emit('presence', 'sync');
    } else if (msg.kind === 'hello' && this.own) {
      this.bc.postMessage({ kind: 'presence', key: this.key, meta: this.own });
    }
  }

  emit(type, event, payload) {
    for (const l of this.listeners) {
      if (l.type === type && (l.event === event || l.event === undefined)) l.cb(payload);
    }
  }

  close() {
    this.bc.close();
  }
}

export function createClient() {
  return {
    channel: (name, opts) => new MockChannel(name, opts),
    removeChannel: async (ch) => {
      await ch.untrack();
      ch.close();
      return 'ok';
    },
  };
}
