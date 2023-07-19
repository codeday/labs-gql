/* eslint-disable import/first */
// Define gloabls/etc before other imports can happen.
import 'reflect-metadata';
import { registerDi } from './di';
registerDi();

// Main app
import { startAutomation } from './automation';
import { startServer } from './server';
startAutomation();
startServer();