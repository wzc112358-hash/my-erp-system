import { normalizeText } from './text.js';

export const ERP_HISTORY_TERMS = ['凡士林脂', '引发剂', '白油'];

export const CHAT_HISTORY_TERMS = [
  '亚硫酸钠',
  '抗静电剂',
  '脱硝催化剂',
  '焦亚硫酸钠',
  '起泡剂',
  '捕收剂',
  '二氧化碳脱硫催化剂',
  '脱氢催化剂',
  '二甲基二硫',
  "4,4'-亚甲基二(N-仲-丁基环己胺)",
  '紫外线吸收剂',
  'DMPP硝化抑制剂',
  '碳酸铵',
  '阻聚剂',
  '碳酸氢钠',
  '苯基三甲氧基硅烷',
  '六甲基二硅氧烷',
  '碳酸二甲酯',
  '2-硝基二苯胺',
  '磷酸二氢镁',
  '表面活性剂ST-80',
];

export const CURATED_PRODUCT_TERMS = [
  '缓蚀阻垢剂',
  '缓蚀剂',
  '阻垢剂',
  '杀菌剂',
  '絮凝剂',
  '聚丙烯酰胺',
  '破乳剂',
  '消泡剂',
  '除垢剂',
  '清洗剂',
  '化工助剂',
  '油田助剂',
  '水处理剂',
];

export const GENERAL_CHEMICAL_TERMS = [
  '催化剂',
  '抑制剂',
  '吸收剂',
  '阻聚剂',
  '表面活性剂',
  '起泡剂',
  '捕收剂',
  '助剂',
  '油田助剂',
  '水处理剂',
  '化学品',
  '药剂',
  '药品',
  '氨水',
  '液碱',
  '烧碱',
  '盐酸',
  '硫酸',
  '氢氧化钠',
  '油品',
  '树脂',
  '危化品',
  '化工',
  '钠',
  '酸',
  '碱',
  '酯',
  '醇',
  '胺',
  '烷',
  '烯',
  '酮',
  '醚',
  '酚',
  '盐',
  '硫',
  '磷',
  '氯',
  '氟',
  '硅',
];

export const NEGATIVE_TERMS = [
  '办公用品',
  '电脑',
  '打印机',
  '家具',
  '物业',
  '保洁',
  '绿化',
  '土建',
  '土建工程',
  '建设工程',
  '建筑工程',
  '施工',
  '维修工程',
  '检维修',
  '大修',
  '技改',
  '改造工程',
  '信息化',
  '运维服务',
  '运行维护',
  '维保',
  '工作餐服务',
  '餐饮服务',
  '试验服务',
  '日常维护',
  '维护服务',
  '电气设备',
  '设备租赁',
  '车辆租赁',
  '租赁服务',
  '运输服务',
  '物流服务',
  '附属工程',
  '管网工程',
  '更换工程',
  '监理',
  '设计服务',
  '咨询服务',
  '培训',
  '审计',
];

const configuredKeywords = (sourceKeywords = '') => String(sourceKeywords)
  .split(/[,，、\s]+/)
  .map((keyword) => normalizeText(keyword))
  .filter(Boolean);

const addTerms = (map, terms, source, weight) => {
  for (const term of terms) {
    const normalized = normalizeText(term);
    if (!normalized) continue;
    const existing = map.get(normalized);
    if (!existing || existing.weight < weight) {
      map.set(normalized, { term: normalized, source, weight });
    }
  }
};

export const buildProductVocabulary = (sourceKeywords = '') => {
  const terms = new Map();
  addTerms(terms, GENERAL_CHEMICAL_TERMS, 'general_chemical', 0.55);
  addTerms(terms, CURATED_PRODUCT_TERMS, 'curated', 0.78);
  addTerms(terms, CHAT_HISTORY_TERMS, 'chat_history', 0.78);
  addTerms(terms, ERP_HISTORY_TERMS, 'erp_history', 0.9);
  addTerms(terms, configuredKeywords(sourceKeywords), 'source_config', 0.82);
  return [...terms.values()].sort((a, b) => b.term.length - a.term.length || b.weight - a.weight);
};

export const findTermMatches = (text = '', vocabulary = buildProductVocabulary()) => {
  const normalized = normalizeText(text).toLowerCase();
  const matchedTerms = [];
  const matchedSources = new Set();

  for (const item of vocabulary) {
    if (normalized.includes(item.term.toLowerCase())) {
      matchedTerms.push(item);
      matchedSources.add(item.source);
    }
  }

  return {
    matchedTerms,
    matchedSources: [...matchedSources],
  };
};

export const findNegativeTerms = (text = '') => {
  const normalized = normalizeText(text);
  return NEGATIVE_TERMS.filter((term) => normalized.includes(term));
};
