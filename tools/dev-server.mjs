// ローカルで遊ぶための開発サーバ： npm start
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serve } from '../tests/server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8123);
await serve(root, port);
console.log(`結晶の中の虹の目  →  http://localhost:${port}/`);
