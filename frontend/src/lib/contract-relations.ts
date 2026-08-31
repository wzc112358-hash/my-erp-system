export interface RelationSalesContract {
  id: string;
  purchase_contract?: string | string[];
  total_quantity?: number;
}

export interface RelationPurchaseContract {
  id: string;
  sales_contract?: string | string[];
}

export interface ContractRelationEdge {
  salesId: string;
  purchaseId: string;
}

export interface ContractRelationIndex {
  edges: ContractRelationEdge[];
  purchaseIdsBySales: Map<string, string[]>;
  salesIdsByPurchase: Map<string, string[]>;
}

export type ContractRelationFilter = 'all' | 'unlinked' | 'linked';

const relationIds = (value?: string | string[]) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
};

export const hasSalesContractRelation = (
  salesContract: RelationSalesContract,
  purchaseContracts: RelationPurchaseContract[],
) => (
  relationIds(salesContract.purchase_contract).length > 0
  || purchaseContracts.some((purchase) => relationIds(purchase.sales_contract).includes(salesContract.id))
);

export const hasPurchaseContractRelation = (
  purchaseContract: RelationPurchaseContract,
  salesContracts: RelationSalesContract[],
) => (
  relationIds(purchaseContract.sales_contract).length > 0
  || salesContracts.some((sales) => relationIds(sales.purchase_contract).includes(purchaseContract.id))
);

export const matchesContractRelationFilter = (
  hasRelation: boolean,
  filter: ContractRelationFilter,
) => filter === 'all' || (filter === 'linked' ? hasRelation : !hasRelation);

/**
 * Contract links exist in both legacy directions:
 * purchase.sales_contract and sales.purchase_contract.  Treat their union as
 * the business relation and deduplicate the mirrored edge written by hooks.
 */
export const buildContractRelationIndex = (
  salesContracts: RelationSalesContract[],
  purchaseContracts: RelationPurchaseContract[],
): ContractRelationIndex => {
  const salesIds = new Set(salesContracts.map((contract) => contract.id));
  const purchaseIds = new Set(purchaseContracts.map((contract) => contract.id));
  const purchaseSetsBySales = new Map(
    salesContracts.map((contract) => [contract.id, new Set<string>()]),
  );

  const addEdge = (salesId: string, purchaseId: string) => {
    if (!salesIds.has(salesId) || !purchaseIds.has(purchaseId)) return;
    purchaseSetsBySales.get(salesId)?.add(purchaseId);
  };

  purchaseContracts.forEach((purchase) => {
    relationIds(purchase.sales_contract).forEach((salesId) => addEdge(salesId, purchase.id));
  });
  salesContracts.forEach((sales) => {
    relationIds(sales.purchase_contract).forEach((purchaseId) => addEdge(sales.id, purchaseId));
  });

  const purchaseOrder = new Map(purchaseContracts.map((contract, index) => [contract.id, index]));
  const salesOrder = new Map(salesContracts.map((contract, index) => [contract.id, index]));
  const purchaseIdsBySales = new Map<string, string[]>();
  const salesSetsByPurchase = new Map(
    purchaseContracts.map((contract) => [contract.id, new Set<string>()]),
  );

  salesContracts.forEach((sales) => {
    const relatedPurchaseIds = Array.from(purchaseSetsBySales.get(sales.id) || [])
      .sort((left, right) => (purchaseOrder.get(left) || 0) - (purchaseOrder.get(right) || 0));
    purchaseIdsBySales.set(sales.id, relatedPurchaseIds);
    relatedPurchaseIds.forEach((purchaseId) => salesSetsByPurchase.get(purchaseId)?.add(sales.id));
  });

  const salesIdsByPurchase = new Map<string, string[]>();
  purchaseContracts.forEach((purchase) => {
    salesIdsByPurchase.set(
      purchase.id,
      Array.from(salesSetsByPurchase.get(purchase.id) || [])
        .sort((left, right) => (salesOrder.get(left) || 0) - (salesOrder.get(right) || 0)),
    );
  });

  const edges = salesContracts.flatMap((sales) => (
    (purchaseIdsBySales.get(sales.id) || []).map((purchaseId) => ({
      salesId: sales.id,
      purchaseId,
    }))
  ));

  return { edges, purchaseIdsBySales, salesIdsByPurchase };
};

export const getPurchaseAllocationRatio = (
  index: ContractRelationIndex,
  salesContracts: RelationSalesContract[],
  purchaseId: string,
  salesId: string,
) => {
  const relatedSalesIds = index.salesIdsByPurchase.get(purchaseId) || [];
  if (!relatedSalesIds.includes(salesId)) return 0;
  if (relatedSalesIds.length === 1) return 1;

  const salesById = new Map(salesContracts.map((contract) => [contract.id, contract]));
  const totalQuantity = relatedSalesIds.reduce(
    (sum, id) => sum + (Number(salesById.get(id)?.total_quantity) || 0),
    0,
  );
  if (totalQuantity > 0) {
    return (Number(salesById.get(salesId)?.total_quantity) || 0) / totalQuantity;
  }
  return 1 / relatedSalesIds.length;
};
