import type { FieldFormat } from '@/types/layout';

export function formatField(value: unknown, format?: FieldFormat): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (format) {
    case 'date': {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    case 'currency': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return String(value);
      return n.toLocaleString(undefined, {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return String(value);
      return n.toLocaleString();
    }
    case 'text':
    default:
      return String(value);
  }
}
