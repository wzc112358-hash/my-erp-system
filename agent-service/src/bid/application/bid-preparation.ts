import type { BidBusinessAssessment } from '../domain/tender-screening.ts';

export type ErpRegion = 'beijing' | 'lanzhou';
export type BidResult = 'pending' | 'won' | 'lost';
export type HistoryMatchType = 'exact_product' | 'product_family' | 'same_buyer';

export type PreparationNotice = {
  id: string;
  fingerprint: string;
  sourceKey: string;
  sourceName: string;
  kind: 'current' | 'attention';
  title: string;
  url: string;
  buyerName: string;
  deadlineAt: string;
  matchedProducts: string[];
  evidence: string;
  assessment?: BidBusinessAssessment;
};

export type HistoricalBidRecord = {
  region: ErpRegion;
  id: string;
  biddingCompany: string;
  biddingNo: string;
  productName: string;
  quantity?: number;
  quantityUnit: string;
  specification: string;
  purity: string;
  packaging: string;
  quotedUnitPrice?: number;
  quotedTotalAmount?: number;
  currency: string;
  tenderFee?: number;
  bidBond?: number;
  winningUnitPrice?: number;
  winningTotalAmount?: number;
  winningSupplier: string;
  brand: string;
  bidResult: BidResult;
  openDate: string;
  lossReason: string;
  qualificationSnapshot: string[];
};

export type HistoricalBidMatch = HistoricalBidRecord & {
  matchType: HistoryMatchType;
  matchLabel: string;
  score: number;
  reasons: string[];
};

export type BidDraftFields = {
  biddingCompany: string;
  biddingNo: string;
  productName: string;
  quantity?: number;
  quantityUnit: string;
  specification: string;
  purity: string;
  packaging: string;
  quotedUnitPrice?: number;
  quotedTotalAmount?: number;
  currency: string;
  tenderFee?: number;
  bidBond?: number;
  openDate: string;
  bidResult: 'pending';
  qualificationSnapshot: string[];
  remark: string;
  sourceNoticeId: string;
  sourceNoticeFingerprint: string;
  sourceNoticeTitle: string;
  sourceNoticeUrl: string;
  sourceName: string;
};

export type DraftFieldName = Exclude<keyof BidDraftFields,
  | 'bidResult'
  | 'sourceNoticeId'
  | 'sourceNoticeFingerprint'
  | 'sourceNoticeTitle'
  | 'sourceNoticeUrl'
  | 'sourceName'
>;

export type ExtractedBidDraft = Partial<Omit<BidDraftFields,
  | 'bidResult'
  | 'sourceNoticeId'
  | 'sourceNoticeFingerprint'
  | 'sourceNoticeTitle'
  | 'sourceNoticeUrl'
  | 'sourceName'
>> & {
  evidence?: Partial<Record<DraftFieldName, string>>;
  warnings?: string[];
};

export type ExistingBidRecord = {
  id: string;
  biddingNo: string;
  productName: string;
};

export type BidPreparation = {
  notice: PreparationNotice;
  historicalMatches: HistoricalBidMatch[];
  draft: BidDraftFields;
  fieldEvidence: Partial<Record<DraftFieldName, string>>;
  warnings: string[];
  existingRecord?: ExistingBidRecord;
};

export type BidPreparationData = {
  getNotice(id: string): Promise<PreparationNotice | null>;
  listHistoricalBids(): Promise<HistoricalBidRecord[]>;
  findExisting(region: ErpRegion, sourceFingerprint: string): Promise<ExistingBidRecord | undefined>;
};

export type BidDraftExtractor = {
  extract(input: {
    notice: PreparationNotice;
    historicalMatches: HistoricalBidMatch[];
  }): Promise<ExtractedBidDraft>;
};

const compact = (value = '') => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase('zh-CN')
  .replace(/[^\p{L}\p{N}]+/gu, '');

const companyKey = (value = '') => compact(value)
  .replace(/中国石油天然气股份有限公司|中国石油|中石油/g, '')
  .replace(/股份有限公司|有限责任公司|有限公司|分公司|公司/g, '');

const productIdentityKeys = (value = '') => {
  const text = String(value || '').normalize('NFKC').toLocaleLowerCase('zh-CN');
  const keys = new Set<string>();
  if (/乙二胺四乙酸四钠|edta\s*-?\s*4na/.test(text)) keys.add('edta_4na');
  if (/对苯二酚单甲醚|mehq/.test(text)) keys.add('mehq');
  if (/对苯二酚/.test(text) && !/单甲醚/.test(text)) keys.add('hydroquinone');
  if (/tbc/.test(text)) keys.add('tbc');
  if (/协同阻聚剂/.test(text)) keys.add('synergistic_inhibitor');
  if (/凡士林/.test(text)) keys.add('petrolatum');
  if (/吊白块|雕白块/.test(text)) keys.add('rongalite');
  const normalized = compact(text);
  if (normalized.length >= 4) keys.add(`literal:${normalized}`);
  return keys;
};

const productFamilyKeys = (value = '') => {
  const text = String(value || '').normalize('NFKC').toLocaleLowerCase('zh-CN');
  const keys = new Set<string>();
  if (/白油/.test(text)) keys.add('white_oil');
  if (/丁二烯/.test(text) && /阻聚/.test(text)) keys.add('butadiene_inhibitor');
  if (/苯乙烯/.test(text) && /阻聚|真阻/.test(text)) keys.add('styrene_inhibitor');
  if (/阻聚剂/.test(text)) keys.add('inhibitor');
  if (/抗氧剂/.test(text)) keys.add('antioxidant');
  if (/消泡剂/.test(text)) keys.add('defoamer');
  if (/催化剂/.test(text)) keys.add('catalyst');
  return keys;
};

const intersects = (left: Set<string>, right: Set<string>) => [...left].some((item) => right.has(item));

const noticeProductText = (notice: PreparationNotice) => [
  notice.assessment?.productSummary || '',
  ...notice.matchedProducts,
  notice.title,
].join(' ');

export const matchHistoricalBids = (
  notice: PreparationNotice,
  records: HistoricalBidRecord[],
  limit = 6,
): HistoricalBidMatch[] => {
  const currentProduct = noticeProductText(notice);
  const currentIdentities = productIdentityKeys(currentProduct);
  const currentFamilies = productFamilyKeys(currentProduct);
  const currentBuyer = companyKey(notice.buyerName || notice.title);

  return records.map((record) => {
    const historicalIdentities = productIdentityKeys(record.productName);
    const historicalFamilies = productFamilyKeys(record.productName);
    const historicalBuyer = companyKey(record.biddingCompany);
    const literalCurrent = [...currentIdentities].filter((item) => item.startsWith('literal:'));
    const literalHistorical = [...historicalIdentities].filter((item) => item.startsWith('literal:'));
    const exactProduct = intersects(currentIdentities, historicalIdentities)
      || literalCurrent.some((left) => literalHistorical.some((right) => {
        const a = left.slice(8);
        const b = right.slice(8);
        const shorter = Math.min(a.length, b.length);
        const longer = Math.max(a.length, b.length);
        return shorter >= 4 && shorter / longer >= 0.75 && (a.includes(b) || b.includes(a));
      }));
    const sameFamily = !exactProduct && intersects(currentFamilies, historicalFamilies);
    const sameBuyer = currentBuyer.length >= 4 && historicalBuyer.length >= 4
      && (currentBuyer.includes(historicalBuyer) || historicalBuyer.includes(currentBuyer));
    if (!exactProduct && !sameFamily && !sameBuyer) return null;
    const matchType: HistoryMatchType = exactProduct
      ? 'exact_product'
      : sameFamily
        ? 'product_family'
        : 'same_buyer';
    const score = (exactProduct ? 100 : sameFamily ? 70 : 40) + (sameBuyer ? 20 : 0)
      + (record.bidResult === 'won' ? 6 : 0);
    const reasons = [
      exactProduct ? '相同产品' : sameFamily ? '同类产品' : '',
      sameBuyer ? '相同采购方' : '',
      record.bidResult === 'won' ? '历史中标' : record.bidResult === 'lost' ? '历史未中标' : '结果待更新',
    ].filter(Boolean);
    return {
      ...record,
      matchType,
      matchLabel: matchType === 'exact_product'
        ? '相同产品'
        : matchType === 'product_family'
          ? '同类产品'
          : '相同采购方',
      score,
      reasons,
    };
  }).filter((item): item is HistoricalBidMatch => Boolean(item))
    .sort((left, right) => right.score - left.score || right.openDate.localeCompare(left.openDate))
    .slice(0, limit);
};

const measuredQuantity = (value = '') => {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*(万?吨|千克|公斤|kg|桶|袋|箱|批|套)/i);
  if (!match) return {};
  return { quantity: Number(match[1]), quantityUnit: match[2] };
};

const measuredPurity = (values: Array<string | undefined>) => {
  for (const rawValue of values) {
    const value = String(rawValue || '').normalize('NFKC');
    const match = value.match(/(?:纯度|含量)\s*(?:为|[:：])?\s*((?:≥|≤|>|<|不低于|不高于)?\s*\d+(?:\.\d+)?\s*%)/i);
    if (match) return { value: match[1].replace(/\s+/g, ''), evidence: match[0].replace(/\s+/g, '') };
  }
  return { value: '', evidence: '' };
};

const sourceTextFor = (notice: PreparationNotice) => [
  notice.title,
  notice.buyerName,
  notice.evidence,
  notice.assessment?.productSummary,
  notice.assessment?.quantity,
  ...(notice.assessment?.specifications || []),
  ...(notice.assessment?.deliveryTerms || []),
  ...(notice.assessment?.commercialTerms || []),
  ...(notice.assessment?.qualificationChecks || []).flatMap((item) => [item.requirement, item.basis]),
].filter(Boolean).join('\n');

const validEvidence = (sourceText: string, evidence: unknown) => {
  const source = compact(sourceText);
  const fragment = compact(String(evidence || ''));
  return fragment.length >= 2 && source.includes(fragment);
};

const validNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

const supportedUnits = new Set(['吨', '万吨', '千克', '公斤', 'kg', 'KG', '桶', '袋', '箱', '批', '套']);

const mergeExtractedDraft = ({
  notice,
  extracted,
}: {
  notice: PreparationNotice;
  extracted: ExtractedBidDraft;
}) => {
  const sourceText = sourceTextFor(notice);
  const evidence = extracted.evidence || {};
  const accepts = (field: DraftFieldName) => validEvidence(sourceText, evidence[field]);
  const baseQuantity = measuredQuantity(notice.assessment?.quantity || '');
  const extractedQuantity = accepts('quantity') ? validNumber(extracted.quantity) : undefined;
  const extractedUnit = accepts('quantityUnit') && supportedUnits.has(String(extracted.quantityUnit || ''))
    ? String(extracted.quantityUnit)
    : '';
  const derivedPurity = measuredPurity([
    notice.title,
    notice.evidence,
    notice.assessment?.productSummary,
    ...(notice.assessment?.specifications || []),
  ]);
  const qualificationSnapshot = (notice.assessment?.qualificationChecks || [])
    .filter((item) => item.status === 'met')
    .map((item) => `${item.requirement}${item.basis ? `：${item.basis}` : ''}`)
    .slice(0, 10);
  const fieldEvidence = Object.fromEntries(
    Object.entries(evidence).filter(([field, fragment]) => (
      validEvidence(sourceText, fragment) && field in ({
        biddingCompany: 1, biddingNo: 1, productName: 1, quantity: 1, quantityUnit: 1,
        specification: 1, purity: 1, packaging: 1, quotedUnitPrice: 1,
        quotedTotalAmount: 1, currency: 1, tenderFee: 1, bidBond: 1,
        openDate: 1, qualificationSnapshot: 1, remark: 1,
      })
    )),
  ) as Partial<Record<DraftFieldName, string>>;
  if (!fieldEvidence.purity && derivedPurity.evidence) fieldEvidence.purity = derivedPurity.evidence;
  const textValue = (field: DraftFieldName, value: unknown) => accepts(field) ? String(value || '').trim() : '';
  const moneyValue = (field: DraftFieldName, value: unknown) => accepts(field) ? validNumber(value) : undefined;
  const openDate = accepts('openDate') && /开标/.test(String(evidence.openDate || ''))
    && Number.isFinite(Date.parse(String(extracted.openDate || '')))
    ? String(extracted.openDate)
    : '';
  return {
    fields: {
      biddingCompany: textValue('biddingCompany', extracted.biddingCompany) || notice.buyerName,
      biddingNo: textValue('biddingNo', extracted.biddingNo),
      productName: textValue('productName', extracted.productName)
        || notice.assessment?.productSummary
        || notice.matchedProducts.join('、'),
      quantity: extractedQuantity ?? baseQuantity.quantity,
      quantityUnit: extractedQuantity !== undefined && extractedUnit
        ? extractedUnit
        : String(baseQuantity.quantityUnit || ''),
      specification: textValue('specification', extracted.specification)
        || (notice.assessment?.specifications || []).join('；'),
      purity: textValue('purity', extracted.purity) || derivedPurity.value,
      packaging: textValue('packaging', extracted.packaging),
      quotedUnitPrice: moneyValue('quotedUnitPrice', extracted.quotedUnitPrice),
      quotedTotalAmount: moneyValue('quotedTotalAmount', extracted.quotedTotalAmount),
      currency: textValue('currency', extracted.currency),
      tenderFee: moneyValue('tenderFee', extracted.tenderFee),
      bidBond: moneyValue('bidBond', extracted.bidBond),
      openDate,
      qualificationSnapshot,
      remark: '',
    },
    fieldEvidence,
  };
};

export const createBidPreparationModule = ({
  data,
  extractor,
}: {
  data: BidPreparationData;
  extractor: BidDraftExtractor;
}) => {
  const historyFor = async (noticeId: string) => {
    const notice = await data.getNotice(noticeId);
    if (!notice) throw new Error('招投标公告不存在');
    const records = await data.listHistoricalBids();
    return { notice, historicalMatches: matchHistoricalBids(notice, records) };
  };

  return {
    async history(noticeId: string) {
      return historyFor(noticeId);
    },

    async prepare(noticeId: string, region: ErpRegion): Promise<BidPreparation> {
      const { notice, historicalMatches } = await historyFor(noticeId);
      if (notice.kind !== 'current') throw new Error('已截止信息不能创建投标草稿');
      if (notice.assessment?.decision === 'likely_cannot_do') {
        throw new Error(`当前公告存在明确阻断条件：${notice.assessment.decisionSummary}`);
      }
      const [existingRecord, extracted] = await Promise.all([
        data.findExisting(region, notice.fingerprint),
        extractor.extract({ notice, historicalMatches }).catch(() => ({ warnings: ['LLM 提取失败，已保留公告中的确定信息。'] })),
      ]);
      const merged = mergeExtractedDraft({ notice, extracted });
      return {
        notice,
        historicalMatches,
        draft: {
          ...merged.fields,
          bidResult: 'pending',
          sourceNoticeId: notice.id,
          sourceNoticeFingerprint: notice.fingerprint,
          sourceNoticeTitle: notice.title,
          sourceNoticeUrl: notice.url,
          sourceName: notice.sourceName,
        },
        fieldEvidence: merged.fieldEvidence,
        warnings: [
          ...(extracted.warnings || []),
          ...(!merged.fields.biddingNo ? ['公告中没有确认到招标编号，请人工核对。'] : []),
          ...(!merged.fields.openDate ? ['公告中没有确认到明确开标时间，未使用截止时间代替。'] : []),
        ],
        existingRecord,
      };
    },
  };
};
