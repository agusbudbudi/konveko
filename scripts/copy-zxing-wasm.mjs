// Self-host the ZXing wasm so the scanner does not depend on a third-party CDN.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm', 'public/vendor/zxing_reader.wasm');
