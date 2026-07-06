import express from 'express';
import cron from 'node-cron';
import { loadConfig } from './config.js';
import { runPipeline } from './run.js';

const cfg = loadConfig();
const app = express();

let running = false;
async function triggerRun(label) {
  if (running) {
    console.log(`[job-scout] ${label} skipped — a run is already in progress`);
    return { skipped: true };
  }
  running = true;
  try {
    console.log(`[job-scout] starting run (${label})`);
    return await runPipeline(cfg);
  } catch (err) {
    console.error(`[job-scout] run (${label}) failed:`, err);
    throw err;
  } finally {
    running = false;
  }
}

// Mirrors "Refresh Webhook" (path: job-scout-refresh).
app.post('/job-scout-refresh', async (req, res) => {
  try {
    const summary = await triggerRun('webhook');
    res.json({ ok: true, ...summary });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Mirrors "Every 4h 8am-8pm IST" (cron: 0 0 8,12,16,20 * * * in n8n's 6-field
// format == minute 0, hour 8/12/16/20 in 5-field cron below).
cron.schedule('0 8,12,16,20 * * *', () => triggerRun('schedule'), { timezone: cfg.CRON_TIMEZONE });

app.listen(cfg.PORT, () => {
  console.log(`[job-scout] pipeline webhook listening on http://localhost:${cfg.PORT}/job-scout-refresh`);
  console.log(`[job-scout] scheduled for 8am/12pm/4pm/8pm ${cfg.CRON_TIMEZONE}`);
});
