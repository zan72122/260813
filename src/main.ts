/**
 * Entry point. All real work lives in src/app/bootstrap.ts — see that
 * module's doc comment for the full construction/wiring order. `<script
 * type="module">` is deferred by spec (runs after the document has been
 * parsed), so `#app`/`#scene`/`#boot-loading` are guaranteed to already
 * exist in the DOM by the time this executes.
 */
import { bootstrap } from './app/bootstrap';

bootstrap();
