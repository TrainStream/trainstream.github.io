// Checks _data/streams.json (written by the submit tool, the original
// trainstream-editor, or by hand) so a broken or unsafe edit shows up as a red check.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rules = require('../assets/js/stream-rules.js');

const raw = readFileSync(new URL('../_data/streams.json', import.meta.url), 'utf8');
const tags = JSON.parse(readFileSync(new URL('../_data/tags.json', import.meta.url), 'utf8')).map((t) => t.slug);

let file;
try {
    file = JSON.parse(raw);
} catch (error) {
    console.error(`::error file=_data/streams.json::Not valid JSON: ${error.message}`);
    process.exit(1);
}

const errors = rules.validateFile(file, tags);
for (const message of errors) console.error(`::error file=_data/streams.json::${message}`);

if (rules.serializeFile(file) !== raw.replace(/\n$/, '')) {
    console.warn('::warning file=_data/streams.json::Formatting differs from JSON.stringify(data, null, 4). Fine, but the next save by a tool will reformat it.');
}

if (errors.length) process.exit(1);
console.log(`streams.json OK: ${file.data.length} streams.`);
