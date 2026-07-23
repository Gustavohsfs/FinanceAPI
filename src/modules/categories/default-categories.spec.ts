import { describe, expect, it } from 'vitest';

import { DEFAULT_CATEGORIES } from './default-categories.js';

describe('DEFAULT_CATEGORIES', () => {
  it('matches the categories expected by the mobile brief', () => {
    expect(
      DEFAULT_CATEGORIES.filter((category) => category.type === 'EXPENSE').map(
        (category) => category.name,
      ),
    ).toEqual([
      'Mercado',
      'Transporte',
      'Moradia',
      'Saúde',
      'Lazer',
      'Educação',
      'Assinaturas',
      'Outros',
    ]);
    expect(
      DEFAULT_CATEGORIES.filter((category) => category.type === 'INCOME').map(
        (category) => category.name,
      ),
    ).toEqual(['Salário', 'Freela', 'Rendimentos', 'Outros']);
  });
});
