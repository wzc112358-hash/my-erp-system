import seedTerms from '../data/product-terms.seed.json' with { type: 'json' };
import type { ProductTerm } from './tender-screening.ts';

const terms = seedTerms as ProductTerm[];
const NON_PRODUCT_SOURCES = new Set(['negative_guard', 'broad_guard']);

const activeProducts = () => terms
  .filter((term) => term.status !== 'disabled')
  .filter((term) => !(term.sources || []).some((source) => NON_PRODUCT_SOURCES.has(source)))
  .filter((term) => String(term.term || '').trim())
  .sort((left, right) => Number(right.weight || 0) - Number(left.weight || 0));

export const productFocusTerms = () => activeProducts().map((term) => term.term);

export const buildProductQueryPlan = ({
  preferredTerms = [],
  limit = 10,
}: {
  preferredTerms?: string[];
  limit?: number;
} = {}) => {
  const catalog = activeProducts();
  const canonical = new Map(catalog.flatMap((term) => [
    [term.term.toLocaleLowerCase('zh-CN'), term.term] as const,
    ...(term.aliases || []).map((alias) => [alias.toLocaleLowerCase('zh-CN'), term.term] as const),
  ]));
  const preferred = preferredTerms
    .map((term) => canonical.get(String(term).trim().toLocaleLowerCase('zh-CN')) || String(term).trim())
    .filter(Boolean);
  return [...new Set([...preferred, ...catalog.map((term) => term.term)])]
    .slice(0, Math.max(0, limit));
};
