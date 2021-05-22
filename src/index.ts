/* eslint-disable import/first */
import 'reflect-metadata';
import { registerDi } from './di';

registerDi();

import emailHandler from './email';

emailHandler();

import server from './server';

server();
