// Side-effect module. Importing this installs the async-handler patch on
// express.Router before any route module builds its own router.
//
// It must be imported ahead of ./routes/* in server.js — ESM evaluates modules in
// import order, so placing this import first is what makes the patch take effect.
import express from 'express';
import { installExpressAsyncPatch } from '../utils/express.js';

installExpressAsyncPatch(express);

export default express;
