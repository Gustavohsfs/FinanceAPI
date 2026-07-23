export interface DefaultCategory {
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly type: 'INCOME' | 'EXPENSE';
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: 'Salário', icon: 'wallet-cards', color: '#F97316', type: 'INCOME' },
  { name: 'Outras entradas', icon: 'circle-plus', color: '#FDBA74', type: 'INCOME' },
  { name: 'Alimentação', icon: 'utensils', color: '#FB923C', type: 'EXPENSE' },
  { name: 'Casa', icon: 'house', color: '#EA580C', type: 'EXPENSE' },
  { name: 'Transporte', icon: 'car', color: '#C2410C', type: 'EXPENSE' },
  { name: 'Saúde', icon: 'heart-pulse', color: '#9A3412', type: 'EXPENSE' },
  { name: 'Lazer', icon: 'sparkles', color: '#7C2D12', type: 'EXPENSE' },
] as const;
