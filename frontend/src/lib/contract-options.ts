export interface ContractListOptions {
  filter?: string;
  sort?: string;
}

export interface FullContractListSource<T> {
  getFullList(options?: ContractListOptions): Promise<T[]>;
}

export const loadAllContractRecords = <T>(
  source: FullContractListSource<T>,
  options: ContractListOptions = { sort: '-created_at' },
): Promise<T[]> => source.getFullList(options);
