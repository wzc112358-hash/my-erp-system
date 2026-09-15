export const normalizeContractNumber = (value: string): string => (
  value.replace(/\s+/gu, '').toLocaleLowerCase()
);

export const findDuplicateContractNumber = <T extends { no: string; product_name: string }>(
  contracts: T[],
  candidateNumber: string,
  candidateProductName: string,
): T | undefined => {
  const normalizedNumber = normalizeContractNumber(candidateNumber);
  const normalizedProductName = normalizeContractNumber(candidateProductName);
  if (!normalizedNumber || !normalizedProductName) return undefined;
  return contracts.find((contract) => (
    normalizeContractNumber(contract.no) === normalizedNumber
    && normalizeContractNumber(contract.product_name) === normalizedProductName
  ));
};
