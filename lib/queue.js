// Fila persistente (data/queue.json), 1 worker sequencial, sobrevive a restart, cancelar/retry.
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { DATA_DIR } from './config.js';
import { runJob, makeId, nameFor } from './pipeline.js';

const FILE = path.join(DATA_DIR, 'queue.json');

export class Queue extends EventEmitter {
  constructor() {
    super();
    this.jobs = [];
    this.running = null;
    this.load();
    // jobs que estavam "rodando" quando o processo caiu voltam pra fila
    for (const j of this.jobs) if (j.status === 'rodando') { j.status = 'na fila'; j.log.push('↻ retomado após reinício'); }
    this.save();
  }
  load() { try { this.jobs = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { this.jobs = []; } }
  save() { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(this.jobs, null, 1)); }
  list() { return this.jobs; }
  get(id) { return this.jobs.find(j => j.id === id); }

  add({ source, options = {}, name }) {
    const job = { id: makeId(source), name: name || nameFor(source), source, options, status: 'na fila', progress: 0, step: 'aguardando', log: [], createdAt: new Date().toISOString(), cancel: false };
    this.jobs.unshift(job); this.save(); this.emit('change');
    setImmediate(() => this.tick());
    return job;
  }
  cancel(id) { const j = this.get(id); if (!j) return; if (j.status === 'na fila') { j.status = 'cancelado'; j.step = 'cancelado'; } else if (j.status === 'rodando') j.cancel = true; this.save(); this.emit('change'); }
  retry(id) { const j = this.get(id); if (!j || j.status === 'rodando') return; j.status = 'na fila'; j.progress = 0; j.step = 'aguardando'; j.cancel = false; delete j.error; j.log.push('↻ reenfileirado'); this.save(); this.emit('change'); setImmediate(() => this.tick()); }
  remove(id) { const j = this.get(id); if (!j || j.status === 'rodando') return false; this.jobs = this.jobs.filter(x => x.id !== id); this.save(); this.emit('change'); return true; }
  clearDone() { this.jobs = this.jobs.filter(j => !['concluído', 'erro', 'cancelado'].includes(j.status)); this.save(); this.emit('change'); }

  async tick() {
    if (this.running) return;
    const job = [...this.jobs].reverse().find(j => j.status === 'na fila');
    if (!job) return;
    this.running = job; job.status = 'rodando'; job.startedAt = new Date().toISOString(); this.save(); this.emit('change');
    const log = m => { const line = `${new Date().toTimeString().slice(0, 8)} ${m}`; job.log.push(line); if (job.log.length > 400) job.log.shift(); this.save(); this.emit('log', job.id, line); };
    const progress = (p, step) => { job.progress = Math.round(p); job.step = step; this.save(); this.emit('change'); };
    try {
      const manifest = await runJob(job, { log, progress, isCancelled: () => job.cancel });
      job.status = 'concluído'; job.dir = manifest.dir; job.products = manifest.products.length;
      log(`✔ concluído: ${manifest.dir}`);
    } catch (e) {
      job.status = job.cancel ? 'cancelado' : 'erro'; job.error = e.message; job.step = job.status;
      log(`✖ ${e.message}`);
      if (!job.cancel) console.error(e);
    }
    job.finishedAt = new Date().toISOString();
    this.running = null; this.save(); this.emit('change');
    setImmediate(() => this.tick());
  }
}
