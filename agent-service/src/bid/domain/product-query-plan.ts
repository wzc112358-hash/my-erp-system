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

export const productLabelsForQuery = (query: string) => {
  const normalized = String(query || '').trim().toLocaleLowerCase('zh-CN');
  const product = activeProducts().find((term) => (
    term.term.toLocaleLowerCase('zh-CN') === normalized ||
    (term.aliases || []).some((alias) => alias.toLocaleLowerCase('zh-CN') === normalized)
  ));
  return product
    ? [...new Set([product.term, ...(product.aliases || [])].map((label) => String(label).trim()).filter(Boolean))]
    : [String(query || '').trim()].filter(Boolean);
};

export const buildProductQueryPlan = ({
  preferredTerms = [],
  limit = 10,
  preservePreferredLabels = false,
}: {
  preferredTerms?: string[];
  limit?: number;
  preservePreferredLabels?: boolean;
} = {}) => {
  const catalog = activeProducts();
  const canonical = new Map(catalog.flatMap((term) => [
    [term.term.toLocaleLowerCase('zh-CN'), term.term] as const,
    ...(term.aliases || []).map((alias) => [alias.toLocaleLowerCase('zh-CN'), term.term] as const),
  ]));
  const preferred = preferredTerms
    .map((term) => {
      const label = String(term).trim();
      return preservePreferredLabels
        ? label
        : canonical.get(label.toLocaleLowerCase('zh-CN')) || label;
    })
    .filter(Boolean);
  return [...new Set([...preferred, ...catalog.map((term) => term.term)])]
    .slice(0, Math.max(0, limit));
};
