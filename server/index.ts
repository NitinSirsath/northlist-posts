import { config } from './config.js';
import { createApp } from './app.js';
import { logEvent } from './log.js';
import { startPostingWorker } from './posting.js';

const c = config();
const app = createApp();
startPostingWorker();
app.listen(c.port, () => {
  logEvent('server_started', { port: c.port, fakeSocial: c.fakeSocial, devLogin: c.devLogin });
});
