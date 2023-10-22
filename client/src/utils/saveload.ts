import React from "react";
import { CrudFilter, CrudSort } from "@refinedev/core";
import { isLocalStorageAvailable } from "./support";

interface Pagination {
  current: number;
  pageSize: number;
}

export interface TableState {
  sorters: CrudSort[];
  filters: CrudFilter[];
  pagination: Pagination;
  showColumns?: string[];
}

export function useInitialTableState(tableId: string): TableState {
  const [initialState] = React.useState(() => {
    const savedSorters = hasHashProperty(`${tableId}-sorters`) ? getHashProperty(`${tableId}-sorters`) : isLocalStorageAvailable ? localStorage.getItem(`${tableId}-sorters`) : null;
    const savedFilters = hasHashProperty(`${tableId}-filters`) ? getHashProperty(`${tableId}-filters`) : isLocalStorageAvailable ? localStorage.getItem(`${tableId}-filters`) : null;
    const savedPagination = hasHashProperty(`${tableId}-pagination`) ? getHashProperty(`${tableId}-pagination`) : isLocalStorageAvailable ? localStorage.getItem(`${tableId}-pagination`) : null;
    const savedShowColumns = hasHashProperty(`${tableId}-showColumns`) ? getHashProperty(`${tableId}-showColumns`) : isLocalStorageAvailable ? localStorage.getItem(`${tableId}-showColumns`) : null;

    const sorters = savedSorters ? JSON.parse(savedSorters) : [{ field: "id", order: "asc" }];
    const filters = savedFilters ? JSON.parse(savedFilters) : [];
    const pagination = savedPagination ? JSON.parse(savedPagination) : { page: 1, pageSize: 20 };
    const showColumns = savedShowColumns ? JSON.parse(savedShowColumns) : undefined;
    window.location.hash = "";
    return { sorters, filters, pagination, showColumns };
  });
  return initialState;
}

export function useStoreInitialState(tableId: string, state: TableState) {
  React.useEffect(() => {
    if (isLocalStorageAvailable) {
      localStorage.setItem(`${tableId}-sorters`, JSON.stringify(state.sorters));
    }
  }, [tableId, state.sorters]);

  React.useEffect(() => {
    if (isLocalStorageAvailable) {
      localStorage.setItem(`${tableId}-filters`, JSON.stringify(state.filters));
    }
  }, [tableId, state.filters]);

  React.useEffect(() => {
    if (isLocalStorageAvailable) {
      localStorage.setItem(`${tableId}-pagination`, JSON.stringify(state.pagination));
    }
  }, [tableId, state.pagination]);

  React.useEffect(() => {
    if (isLocalStorageAvailable) {
      if (state.showColumns === undefined) {
        localStorage.removeItem(`${tableId}-showColumns`);
      } else {
        localStorage.setItem(`${tableId}-showColumns`, JSON.stringify(state.showColumns));
      }
    }
  }, [tableId, state.showColumns]);
}

export function useSavedState<T>(id: string, defaultValue: T) {
  const [state, setState] = React.useState<T>(() => {
    const savedState = isLocalStorageAvailable ? localStorage.getItem(`savedStates-${id}`) : null;
    return savedState ? JSON.parse(savedState) : defaultValue;
  });

  React.useEffect(() => {
    if (isLocalStorageAvailable) {
      localStorage.setItem(`savedStates-${id}`, JSON.stringify(state));
    }
  }, [id, state]);

  return [state, setState] as const;
}

export function shareSavedState(tableId: string): string {
  const tableStates = ['sorters', 'filters', 'pagination', 'showColumns'];
  const params = new URLSearchParams();
  tableStates.forEach(s => {
    let l = localStorage.getItem(`${tableId}-${s}`);
    if (l) {
      params.append(`${tableId}-${s}`, l);
    }
  })
  return `${window.location.origin}${window.location.pathname}#${params.toString()}`
}

function getHashProperty(Id: string) {
  const hash = new URLSearchParams(window.location.hash.substring(1));
  return hash.get(Id);
}

function hasHashProperty(property: string): boolean {
  const hash = new URLSearchParams(window.location.hash.substring(1));
  return hash.has(property);
}