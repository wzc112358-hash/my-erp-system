import { buildProductQueryPlan } from './product-query-plan.ts';

export type SiteSearchScope = {
  productTerms: string[];
  familyTerms: string[];
  exploratoryTerms: string[];
  exploratoryTermsPerRun: number;
};

export const CHEMICAL_FAMILY_TERMS = Object.freeze([
  '化工原料', '化学品', '化工助剂', '添加剂', '油品', '润滑油',
  '有机酸', '脂肪酸', '酯类', '羟胺', '醛类', '酮类',
  '醚类', '烃类溶剂', '水处理剂', '表面活性剂', '树脂原料',
]);

export const CHEMICAL_EXPLORATORY_TERMS = Object.freeze([
  '油', '酸', '酯', '脂', '醇', '胺', '醛', '酮', '醚', '烃', '盐', '碱', '胶', '剂',
]);

const unique = (items: string[]) => [...new Set(items)];

const normalizeTerms = (
  values: unknown,
  { minimumLength, limit }: { minimumLength: number; limit: number },
) => unique((Array.isArray(values) ? values : [])
  .map((value) => String(value || '').normalize('NFKC').trim())
  .filter((value) => value.length >= minimumLength && value.length <= 40))
  .slice(0, limit);

export const normalizeSiteSearchScope = (
  value: Partial<SiteSearchScope> | null | undefined,
  fallback?: SiteSearchScope,
): SiteSearchScope => ({
  productTerms: normalizeTerms(value?.productTerms ?? fallback?.productTerms ?? [], {
    minimumLength: 2,
    limit: 64,
  }),
  familyTerms: normalizeTerms(value?.familyTerms ?? fallback?.familyTerms ?? [], {
    minimumLength: 2,
    limit: 24,
  }),
  exploratoryTerms: normalizeTerms(value?.exploratoryTerms ?? fallback?.exploratoryTerms ?? [], {
    minimumLength: 1,
    limit: 20,
  }),
  exploratoryTermsPerRun: Math.min(
    4,
    Math.max(0, Math.floor(Number(value?.exploratoryTermsPerRun ?? fallback?.exploratoryTermsPerRun ?? 2))),
  ),
});

export const storedSiteSearchScope = (
  value: unknown,
  fallback: SiteSearchScope | undefined,
): SiteSearchScope | undefined => {
  if (!fallback) return undefined;
  if (typeof value !== 'string' || !value.trim()) return normalizeSiteSearchScope(fallback);
  try {
    const parsed = JSON.parse(value) as Partial<SiteSearchScope>;
    const normalized = normalizeSiteSearchScope(parsed, fallback);
    return normalized.productTerms.length ? normalized : normalizeSiteSearchScope(fallback);
  } catch {
    return normalizeSiteSearchScope(fallback);
  }
};

export const serializedSiteSearchScope = (scope: SiteSearchScope) => JSON.stringify(
  normalizeSiteSearchScope(scope),
);

export const buildSiteSearchScope = ({
  preferredProductTerms,
  productLimit,
  familyTerms = [],
  familyLimit = 6,
  exploratoryTerms = [],
  exploratoryTermsPerRun = 2,
}: {
  preferredProductTerms: string[];
  productLimit: number;
  familyTerms?: readonly string[];
  familyLimit?: number;
  exploratoryTerms?: readonly string[];
  exploratoryTermsPerRun?: number;
}): SiteSearchScope => normalizeSiteSearchScope({
  productTerms: buildProductQueryPlan({
    preferredTerms: preferredProductTerms,
    limit: productLimit,
    preservePreferredLabels: true,
  }),
  familyTerms: [...familyTerms].slice(0, familyLimit),
  exploratoryTerms: [...exploratoryTerms],
  exploratoryTermsPerRun,
});

const shanghaiDateKey = (now: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);

const hash = (value: string) => {
  let result = 0;
  for (const character of value) result = ((result << 5) - result + character.charCodeAt(0)) | 0;
  return Math.abs(result);
};

export const rotatingExploratoryTerms = (
  scope: SiteSearchScope,
  sourceName: string,
  now = new Date(),
) => {
  const terms = scope.exploratoryTerms;
  const count = Math.min(scope.exploratoryTermsPerRun, terms.length);
  if (!count) return [];
  const start = hash(`${sourceName}|${shanghaiDateKey(now)}`) % terms.length;
  return Array.from({ length: count }, (_, index) => terms[(start + index) % terms.length]);
};

export const effectiveSearchTerms = (
  scope: SiteSearchScope,
  sourceName: string,
  now = new Date(),
) => unique([
  ...scope.productTerms,
  ...scope.familyTerms,
  ...rotatingExploratoryTerms(scope, sourceName, now),
]);

export const searchScopeText = (
  scope: SiteSearchScope,
  sourceName: string,
  now = new Date(),
) => effectiveSearchTerms(scope, sourceName, now).join(',');
