const config = require('../config');

const slots = Math.max(1, Math.round(config.quota.cpu * config.requestSlotsPerCpu));
const quantum = config.quantumMs;
const firstBurst = 50;
const lanes = new Map();
const average = new Map();
const counters = { served: 0, rejected: 0 };

function lane(userId) {
  if (!lanes.has(userId)) lanes.set(userId, { active: 0, queues: new Map(), order: [], lastServed: null, last: null });
  return lanes.get(userId);
}

function burstOf(projectId) {
  return average.get(projectId) || firstBurst;
}

function learn(projectId, ms) {
  const old = average.get(projectId) || ms;
  average.set(projectId, Math.min(10000, Math.max(1, Math.round(old * 0.7 + ms * 0.3))));
}

function pickIds(l) {
  const ids = [...l.queues.keys()].filter(id => l.queues.get(id).length > 0);
  const at = ids.indexOf(l.lastServed);
  if (at < 0) return ids;
  return ids.slice(at + 1).concat(ids.slice(0, at + 1));
}

function handOut(l, id, doneMs, given) {
  const queue = l.queues.get(id);
  const upTo = Math.min(queue.length, Math.ceil(doneMs / burstOf(id)));
  for (let k = given[id] || 0; k < upTo; k++) l.order.push(queue[k]);
  given[id] = upTo;
}

function plan(l) {
  const ids = pickIds(l);
  const given = {};
  const n = ids.length;
  let i, time = 0, remain;
  const bt = [], rt = [], ct = [], wt = [], tat = [];
  let avgWt = 0, avgTat = 0;

  l.order = [];
  remain = n;

  for (i = 0; i < n; i++) {
    bt[i] = l.queues.get(ids[i]).length * burstOf(ids[i]);
    rt[i] = bt[i];
  }

  while (remain > 0) {
    for (i = 0; i < n; i++) {
      if (rt[i] > 0) {
        if (rt[i] > quantum) {
          time += quantum;
          rt[i] -= quantum;
          handOut(l, ids[i], bt[i] - rt[i], given);
        } else {
          time += rt[i];
          rt[i] = 0;
          ct[i] = time;
          handOut(l, ids[i], bt[i], given);
          remain--;
        }
      }
    }
  }

  for (i = 0; i < n; i++) {
    tat[i] = ct[i];
    wt[i] = tat[i] - bt[i];

    avgWt += wt[i];
    avgTat += tat[i];
  }

  if (n > 0) {
    l.last = {
      at: Date.now(),
      quantum,
      rows: ids.map((id, k) => ({ projectId: id, bt: bt[k], ct: ct[k], wt: wt[k], tat: tat[k] })),
      avgWt: Number((avgWt / n).toFixed(2)),
      avgTat: Number((avgTat / n).toFixed(2)),
    };
  }
}

function dispatch(l) {
  while (l.active < slots) {
    if (l.order.length === 0) plan(l);
    const job = l.order.shift();
    if (!job) return;
    const queue = l.queues.get(job.projectId);
    queue.splice(queue.indexOf(job), 1);
    clearTimeout(job.timer);
    l.lastServed = job.projectId;
    l.active++;
    counters.served++;
    const started = Date.now();
    let released = false;
    job.resolve({
      waitMs: started - job.at,
      release() {
        if (released) return;
        released = true;
        l.active--;
        learn(job.projectId, Date.now() - started);
        dispatch(l);
      },
    });
  }
}

function acquire(userId, projectId) {
  const l = lane(userId);
  return new Promise((resolve, reject) => {
    let queue = l.queues.get(projectId);
    if (!queue) {
      queue = [];
      l.queues.set(projectId, queue);
    }
    if (queue.length >= config.queueLimit) {
      counters.rejected++;
      return reject(new Error('queue is full'));
    }
    const job = { at: Date.now(), projectId, resolve };
    job.timer = setTimeout(() => {
      const i = queue.indexOf(job);
      if (i >= 0) queue.splice(i, 1);
      const k = l.order.indexOf(job);
      if (k >= 0) l.order.splice(k, 1);
      counters.rejected++;
      reject(new Error('waited too long in the queue'));
    }, config.queueTimeoutMs);
    queue.push(job);
    plan(l);
    dispatch(l);
  });
}

function stats(userId) {
  const l = lane(userId);
  return {
    algorithm: 'round-robin',
    quantumMs: quantum,
    slots,
    active: l.active,
    queued: Object.fromEntries([...l.queues].map(([id, q]) => [id, q.length])),
    served: counters.served,
    rejected: counters.rejected,
    lastRound: l.last,
  };
}

module.exports = { acquire, stats, slots };
