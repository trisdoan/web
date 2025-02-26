import {useState} from "@odoo/owl";

import {createTable} from "@tanstack/table-core";

export function useOwlTable(options) {
    const resolvedOptions = {
        state: {}, // Dummy state
        renderFallbackValue: null,
        ...options,
    };
    const table = createTable(resolvedOptions);
    const state = useState({...table.initialState, ...options.state});
    table.setOptions((prev) => ({
        ...prev,
        state: state,
        onSortingChange: (updater) => {
            if (updater instanceof Function) {
                state.sorting = updater(state.sorting);
            } else {
                state.sorting = updater;
            }
        },
        onRowSelectionChange: (updater) => {
            if (updater instanceof Function) {
                state.rowSelection = updater(state.rowSelection);
            } else {
                state.rowSelection = updater;
            }
        },
        onPaginationChange: (updater) => {
            if (updater instanceof Function) {
                state.pagination = updater(state.pagination);
            } else {
                state.pagination = updater;
            }
        },
        onColumnSizingChange: (updater) => {
            if (updater instanceof Function) {
                state.columnSizing = updater(state.columnSizing);
            } else {
                state.columnSizing = updater;
            }
        },
        onColumnSizingInfoChange: (updater) => {
            if (updater instanceof Function) {
                state.columnSizingInfo = updater(state.columnSizingInfo);
            } else {
                state.columnSizingInfo = updater;
            }
        },
        onColumnVisibilityChange: (updater) => {
            if (updater instanceof Function) {
                state.columnVisibility = updater(state.columnVisibility);
            } else {
                state.columnVisibility = updater;
            }
        },
        onColumnPinningChange: (updater) => {
            if (updater instanceof Function) {
                state.columnPinning = updater(state.columnPinning);
            } else {
                state.columnPinning = updater;
            }
        },
    }));
    return table;
}
