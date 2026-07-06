import { loadConfig } from './config.js';
import { runPipeline } from './run.js';

runPipeline(loadConfig())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[job-scout] run failed:', err);
    process.exit(1);
  });
