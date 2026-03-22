#!/usr/bin/env node
import 'dotenv/config';
import { loadConfig } from './config.js';
import { startServer } from './server.js';

const config = loadConfig(process.argv.slice(2));

startServer(config).catch((err) => {
  console.error('[notion-vibe] fatal:', err?.stack || err);
  process.exitCode = 1;
});
