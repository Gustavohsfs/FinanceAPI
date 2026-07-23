import { mkdir, writeFile } from 'node:fs/promises';

import { createOpenApiDocument } from '../src/openapi.js';

const document = await createOpenApiDocument();
await mkdir('docs', { recursive: true });
await writeFile('docs/openapi.json', `${JSON.stringify(document, null, 2)}\n`, 'utf8');
