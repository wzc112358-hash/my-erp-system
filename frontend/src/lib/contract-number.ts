export const normalizeContractNumber = (value: string): string => (
  value.replace(/\s+/gu, '').toLocaleLowerCase()
);

export const findDuplicateContractNumber = <T extends { no: string }>(
  contracts: T[],
  candidate: string,
): T | undefined => {
  const normalized = normalizeContractNumber(candidate);
  if (!normalized) return undefined;
  return contracts.find((contract) => normalizeContractNumber(contract.no) === normalized);
};
