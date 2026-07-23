export interface DefaultCategory {
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly type: 'INCOME' | 'EXPENSE';
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: 'Mercado', icon: 'shopping-cart', color: '#FF6A00', type: 'EXPENSE' },
  { name: 'Transporte', icon: 'bus', color: '#FF8A2B', type: 'EXPENSE' },
  { name: 'Moradia', icon: 'house', color: '#A1A1AA', type: 'EXPENSE' },
  { name: 'Saúde', icon: 'heart-pulse', color: '#2FBF71', type: 'EXPENSE' },
  { name: 'Lazer', icon: 'party-popper', color: '#FF6A00', type: 'EXPENSE' },
  { name: 'Educação', icon: 'graduation-cap', color: '#FF8A2B', type: 'EXPENSE' },
  { name: 'Assinaturas', icon: 'repeat', color: '#A1A1AA', type: 'EXPENSE' },
  { name: 'Outros', icon: 'ellipsis', color: '#52525B', type: 'EXPENSE' },
  { name: 'Salário', icon: 'wallet', color: '#2FBF71', type: 'INCOME' },
  { name: 'Freela', icon: 'laptop', color: '#FF8A2B', type: 'INCOME' },
  { name: 'Rendimentos', icon: 'trending-up', color: '#2FBF71', type: 'INCOME' },
  { name: 'Outros', icon: 'ellipsis', color: '#52525B', type: 'INCOME' },
] as const;
