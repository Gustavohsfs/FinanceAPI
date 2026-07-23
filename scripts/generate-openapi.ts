import { mkdir, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';

import { createOpenApiDocument } from '../src/openapi.js';

const document = await createOpenApiDocument();
const outputPath = 'docs/openapi.json';
const prettierConfig = (await resolveConfig(outputPath)) ?? {};
const contents = await format(JSON.stringify(document), { ...prettierConfig, parser: 'json' });
await mkdir('docs', { recursive: true });
await writeFile(outputPath, contents, 'utf8');
