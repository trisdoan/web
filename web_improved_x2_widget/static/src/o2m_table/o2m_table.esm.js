import {browser} from "@web/core/browser/browser";
import {evaluateBooleanExpr} from "@web/core/py_js/py";
import {useSortable} from "@web/core/utils/sortable_owl";
import {registry} from "@web/core/registry";
import {standardFieldProps} from "@web/views/fields/standard_field_props";
import {computeViewClassName, getClassNameFromDecoration} from "@web/views/utils";
import {Domain} from "@web/core/domain";
import {DropdownItem} from "@web/core/dropdown/dropdown_item";
import {ViewButton} from "@web/views/view_button/view_button";
import {DROPDOWN} from "@web/core/dropdown/dropdown";
import {pick} from "@web/core/utils/objects";
import {X2ManyField} from "@web/views/fields/x2many/x2many_field";
import {CheckBox} from "@web/core/checkbox/checkbox";

import {
    useActiveActions,
    useOpenX2ManyRecord,
    useX2ManyCrud,
} from "@web/views/fields/relational_utils";

import {getActiveHotkey} from "@web/core/hotkeys/hotkey_service";
import {getTabableElements} from "@web/core/utils/ui";
import {
    Component,
    onMounted,
    onPatched,
    onWillPatch,
    onWillUpdateProps,
    toRaw,
    useRef,
    useState,
} from "@odoo/owl";
import {useOwlTable} from "../hook/hook.esm.js";
import {
    createColumnHelper,
    getCoreRowModel,
    getExpandedRowModel,
    getFilteredRowModel,
    getGroupedRowModel,
    getPaginationRowModel,
    getSortedRowModel,
} from "@tanstack/table-core";
import {Field, getPropertyFieldInfo} from "@web/views/fields/field";
import {O2MFilter} from "../o2m_filter/o2m_filter.esm.js";

const FIELD_CLASSES = {
    char: "o_list_char",
    float: "o_list_number",
    integer: "o_list_number",
    monetary: "o_list_number",
    text: "o_list_text",
    many2one: "o_list_many2one",
};
const minHeightDiv = 300;

/**
 * @param {HTMLElement} parent
 */
function containsActiveElement(parent) {
    const {activeElement} = document;
    return parent !== activeElement && parent.contains(activeElement);
}

const styleToString = (style) => {
    return Object.keys(style).reduce(
        (acc, key) =>
            acc +
            key
                .split(/(?=[A-Z])/)
                .join("-")
                .toLowerCase() +
            ":" +
            style[key] +
            ";",
        ""
    );
};

export class O2MTableField extends Component {
    static template = "owl_table.O2MTableField";
    static components = {
        Field,
        O2MFilter,
        CheckBox,
        Dropdown,
        DropdownItem,
        ViewButton,
        X2ManyField,
    };
    static props = {
        ...standardFieldProps,
        addLabel: {type: String, optional: true},
        editable: {type: String, optional: true},
        viewMode: {type: String, optional: true},
        widget: {type: String, optional: true},
        crudOptions: {type: Object, optional: true},
        string: {type: String, optional: true},
        relatedFields: {type: Object, optional: true},
        views: {type: Object, optional: true},
        domain: {type: [Array, Function], optional: true},
        context: {type: Object},
    };

    setup() {
        const {saveRecord, updateRecord, removeRecord} = useX2ManyCrud(
            () => this.list,
            false
        );

        this.originalIds = toRaw(this.props.record.data[this.props.name].currentIds);
        this.tableRef = useRef("table");
        this.archInfo = this.props.views.list || {};
        this.creates = this.archInfo.creates.length
            ? this.archInfo.creates
            : [{type: "create", string: _t("Add")}];
        this.allColumns = this.processAllColumn(this.archInfo.columns, this.list);
        this.cellClassByColumn = {};
        this.cellToFocus = null;
        this.activeRowId = null;

        const {activeActions} = this.archInfo;
        const subViewActiveActions = activeActions;
        this.activeActions = useActiveActions({
            crudOptions: Object.assign({}, this.props.crudOptions, {
                onDelete: removeRecord,
            }),
            fieldType: "one2many",
            subViewActiveActions,
            getEvalParams: (props) => {
                return {
                    evalContext: props.record.evalContext,
                    readonly: props.readonly,
                };
            },
        });

        const openRecord = useOpenX2ManyRecord({
            resModel: this.list.resModel,
            activeField: this.activeField,
            activeActions: this.activeActions,
            getList: () => this.list,
            saveRecord,
            updateRecord,
            isMany2Many: false,
        });

        this._openRecord = (params) => {
            const activeElement = document.activeElement;
            openRecord({
                ...params,
                onClose: () => {
                    if (activeElement) {
                        activeElement.focus();
                    }
                },
            });
        };

        this.state = useState({
            columns: this.getActiveColumns(this.list),
            pageSizes: [
                ["40", 40],
                ["80", 80],
                ["160", 160],
                ["All", this.list.count],
            ],
            filterIds: this.list.currentIds.map((id) => id),
            o2mFieldDomain: {},
        });
        this.withHandleColumn = this.state.columns.some(
            (col) => col.widget === "handle"
        );
        this.keyColumnSizing = `${this.props.id}.${this.env.config.viewId}`;
        let _cacheColumnSizing = {};
        try {
            _cacheColumnSizing =
                JSON.parse(browser.localStorage.getItem(this.keyColumnSizing)) || {};
        } catch {}

        this.table = useOwlTable({
            data: this.state.filterIds,
            columns: this.columns,
            columnResizeMode: "onChange",
            columnResizeDirection: "ltr",
            getCoreRowModel: getCoreRowModel(),
            getSortedRowModel: getSortedRowModel(),
            getFilteredRowModel: getFilteredRowModel(),
            getPaginationRowModel: getPaginationRowModel(),
            getExpandedRowModel: getExpandedRowModel(),
            getGroupedRowModel: getGroupedRowModel(),
            enableRowSelection: true,
            enablePinning: true,
            state: Object.assign({}, _cacheColumnSizing, {
                pagination: {
                    pageIndex: 0,
                    pageSize: 40,
                },
            }),
        });

        this.resizeObserver = new ResizeObserver((entries) => {
            const tableRef = entries[0];
            if (tableRef.contentRect.height > minHeightDiv) {
                browser.localStorage.setItem(
                    `${this.keyColumnSizing}-height`,
                    tableRef.contentRect.height
                );
            }
        });

        const classes = ["o_field_x2many", "o_field_table"];

        this.className = computeViewClassName("list", this.archInfo.xmlDoc, classes);
        this.archInfo = this.props.views?.list || {};

        let dataRowId;
        this.resequencePromise = Promise.resolve();
        useSortable({
            enable: () => this.canResequenceRows,
            // Params
            ref: this.tableRef,
            elements: ".o_row_draggable",
            handle: ".o_handle_cell",
            cursor: "grabbing",
            // Hooks
            onDragStart: (params) => {
                const {element} = params;
                dataRowId = element.id;
            },
            onDrop: (params) => this.sortDrop(dataRowId, params),
        });

        onWillUpdateProps(async (nextProps) => {
            this.allColumns = this.processAllColumn(
                this.archInfo.columns,
                nextProps.record.data[nextProps.name]
            );
            this.state.columns = this.getActiveColumns(
                nextProps.record.data[nextProps.name]
            );
            const {pageIndex, pageSize} = this.table.getState().pagination;
            const newCurrentIds = [...nextProps.record.data[nextProps.name].currentIds];
            this.state.pageSizes = this.state.pageSizes.map((p) => {
                return p[0] === "All" ? ["All", newCurrentIds.length] : p;
            });
            if (this.o2mDomain.length > 0) {
                const addIds = newCurrentIds.filter(
                    (e) => !this.originalIds.includes(e)
                );
                const removeIds = this.originalIds.filter(
                    (e) => !newCurrentIds.includes(e)
                );
                if (addIds.length > 0) {
                    this.state.filterIds = [...addIds, ...this.state.filterIds];
                }
                if (removeIds.length > 0) {
                    this.state.filterIds = this.state.filterIds.filter(
                        (id) => !removeIds.includes(id)
                    );
                }
                if (addIds.length > 0 || removeIds.length > 0) {
                    this.originalIds = newCurrentIds;
                    this.table.options.data = [...this.state.filterIds];
                }
            } else {
                this.originalIds = newCurrentIds;
                this.state.filterIds = newCurrentIds;
                this.table.options.data = [...this.state.filterIds];
            }
            await this.loadRecordByPage(pageIndex, pageSize);
        });

        onWillPatch(() => {
            // Const activeRow = document.activeElement.closest(".o_edit");
            // this.activeRowId = activeRow ? activeRow.dataset.id : null;
        });

        onPatched(async () => {
            await Promise.resolve();

            let _cacheColumnSizing = {};
            try {
                _cacheColumnSizing =
                    JSON.parse(browser.localStorage.getItem(this.keyColumnSizing)) ||
                    {};
            } catch {}
            const tableState = Object.assign(
                {},
                _cacheColumnSizing,
                this.table.getState()
            );
            browser.localStorage.setItem(
                this.keyColumnSizing,
                JSON.stringify(tableState)
            );

            // Const editedRecord = this.list.editedRecord;
            // if (editedRecord && this.activeRowId !== editedRecord.id) {
            //     if (this.cellToFocus && this.cellToFocus.record === editedRecord) {
            //         const column = this.cellToFocus.column;
            //         const forward = this.cellToFocus.forward;
            //         this.focusCell(column, forward);
            //     } else if (this.lastEditedCell) {
            //         this.focusCell(this.lastEditedCell.column, true);
            //     } else {
            //         this.focusCell(this.state.columns[0]);
            //     }
            // }
            // this.cellToFocus = null;
        });

        onMounted(() => {
            if (this.props.viewMode == "list") {
                const heightTable = browser.localStorage.getItem(
                    `${this.keyColumnSizing}-height`
                );
                this.tableRef.el.style.height = `${heightTable > minHeightDiv ? heightTable : minHeightDiv}px`;
                this.resizeObserver.observe(this.tableRef.el);
            }
        });
    }

    sortRecordFn(rowA, rowB, _columnId) {
        const type = this.getRecord(rowA.original).fields[_columnId].type;
        const dataA = this.getRecord(rowA.original).data[_columnId];
        const dataB = this.getRecord(rowB.original).data[_columnId];

        if (["integer", "float", "monetary"].includes(type)) {
            return dataA - dataB;
        } else if (["char", "text", "json", "selection", "html"].includes(type)) {
            return dataA.localeCompare(dataB, undefined, {numeric: true});
        } else if (type == "boolean") {
            return dataA === dataB ? 0 : dataA ? -1 : 1;
        } else if (type == "many2one") {
            return dataA[1].localeCompare(dataB[1], undefined, {numeric: true});
        } else if (type == "many2many") {
            if (!dataA.records.length && !dataB.records.length) return 0;
            if (dataA.records.length && !dataB.records.length) return -1;
            if (!dataA.records.length && dataB.records.length) return 1;
            return dataA.records[0].data.display_name.localeCompare(
                dataB.records[0].data.display_name,
                undefined,
                {numeric: true}
            );
        } else if (["datetime", "date"].includes(type)) {
            if (!dataA && !dataB) return 0;
            if (dataA < dataB) return -1;
            return 1;
        }
        return 0;
    }

    get canResequenceRows() {
        if (!this.list.canResequence()) {
            return false;
        }
        const {handleField, orderBy} = this.list;
        return !orderBy.length || (orderBy.length && orderBy[0].name === handleField);
    }

    /**
     * @param {String} dataRowId
     * @param {Object} params
     * @param {HTMLElement} params.element
     * @param {HTMLElement} [params.group]
     * @param {HTMLElement} [params.next]
     * @param {HTMLElement} [params.parent]
     * @param {HTMLElement} [params.previous]
     */
    async sortDrop(dataRowId, {element, previous}) {
        await this.list.leaveEditMode();
        element.classList.remove("o_row_draggable");
        const refId = previous ? previous.id : null;
        this.resequencePromise = this.list.resequence(dataRowId, refId, {
            handleField: this.list.handleField,
        });
        await this.resequencePromise;
        element.classList.add("o_row_draggable");
    }

    get list() {
        return this.props.record.data[this.props.name];
    }

    getColumnVisible(id) {
        return this.state.columns.find((col) => col.name == id);
    }

    get columns() {
        const columnHelper = createColumnHelper();
        let _cacheColumnSizing = {};
        try {
            _cacheColumnSizing =
                JSON.parse(browser.localStorage.getItem(this.keyColumnSizing)) || {};
        } catch {}
        return this.state.columns.map((col) => {
            return columnHelper.accessor(col.name, {
                id: col.name,
                cell: col,
                header: col.label,
                size: _cacheColumnSizing.columnSizing
                    ? _cacheColumnSizing.columnSizing[col.name]
                    : 200,
                sortingFn: this.sortRecordFn.bind(this),
                minWidth: 100,
            });
        });
    }

    get activeField() {
        return {
            fields: this.props.relatedFields,
            views: this.props.views,
            viewMode: this.props.viewMode,
            string: this.props.string,
        };
    }

    get displayCreate() {
        return !this.props.readonly && this.archInfo.activeActions.create;
    }

    get displayDelete() {
        return (
            !this.props.readonly &&
            (this.archInfo.activeActions.delete || this.archInfo.activeActions.unlink)
        );
    }

    get nbCols() {
        return this.state.columns.length + 1;
    }

    get o2mDomain() {
        const domains = [];
        for (const [key, value] of Object.entries(this.state.o2mFieldDomain)) {
            domains.push(value);
        }
        return Domain.and(domains).toList();
    }

    get selectedRecords() {
        const rowSelection = this.table.getState().rowSelection;
        const recordIDS = [];
        for (const [recordIndex, isCheck] of Object.entries(rowSelection)) {
            if (isCheck) {
                recordIDS.push(this.state.filterIds[recordIndex]);
            }
        }
        return recordIDS;
    }

    getCommonPinningStyles(column, ev) {
        const isPinned = column.getIsPinned();
        const style = {
            opacity: isPinned ? 0.95 : 1,
            position: isPinned ? "sticky" : "relative",
            width: `${column.getSize()}px`,
        };
        if (isPinned === "left") {
            style.left = `${column.getStart("left") + 22}px`;
            style["background-color"] = "#f0f0f0";
            style["z-index"] = 1;
        }
        if (isPinned === "right") {
            style.right = `${column.getAfter("right")}px`;
            style["background-color"] = "#f0f0f0";
            style["z-index"] = 1;
        }

        return styleToString(style);
    }

    resizeStyle(header) {
        if (header.column.getIsResizing()) {
            return `transform: translateX(${this.table.getState().columnSizingInfo.deltaOffset}px)`;
        }
        return `transform: translateX(0)`;
    }

    // ///////////////////////// Actions //////////////////////////////
    getResParams() {
        const params = pick(
            this.list,
            "context",
            "evalContext",
            "resModel",
            "resId",
            "resIds"
        );
        params.resIds = this.selectedRecords;
        return params;
    }
    async onClickButtonGroup(clickParams) {
        this.env.onClickViewButton({
            clickParams: clickParams,
            getResParams: () => this.getResParams(),
            beforeExecute: () => {
                if (this.env[DROPDOWN]) {
                    this.env[DROPDOWN].close();
                }
            },
        });
    }

    async addNewRecord(context) {
        if (this.archInfo.editable) {
            const proms = [];
            this.list.model.bus.trigger("NEED_LOCAL_CHANGES", {proms});
            await this.list.records.forEach((record) => {
                if (record.isInEdition) record.switchMode("readonly");
            });
            return this.list.addNewRecord({
                mode: "edit",
                position: "top",
                context: context || {},
            });
        }
        return this._openRecord({context: context || {}});
    }

    async onDeleteRecord() {
        this.selectedRecords.forEach((recordID) =>
            this.list.delete(this.getRecord(recordID))
        );
        this.table.toggleAllRowsSelected(false);
    }

    // //////////////////////////// Pining//////////////////////////////////////
    pinColumnToLeft(header, ev) {
        const {column} = header;
        const isPinned = column.getIsPinned();
        if (isPinned !== "left") {
            column.pin("left");
        } else {
            column.pin(false);
        }
    }

    pinColumnToRight(header, ev) {
        const {column} = header;
        const isPinned = column.getIsPinned();
        if (isPinned !== "right") {
            column.pin("right");
        } else {
            column.pin(false);
        }
    }

    // //////////////////////////////////////////////////////////////////
    getRecord(id) {
        return this.list._cache[id];
    }

    processAllColumn(allColumns, list) {
        return allColumns.flatMap((column) => {
            if (
                column.type === "field" &&
                list.fields[column.name].type === "properties"
            ) {
                return this.getPropertyFieldColumns(column, list);
            }
            return [column];
        });
    }

    getPropertyFieldColumns(column, list) {
        return Object.values(list.fields)
            .filter(
                (field) =>
                    field.relatedPropertyField &&
                    field.relatedPropertyField.fieldName === column.name
            )
            .map((propertyField) => {
                return {
                    ...getPropertyFieldInfo(propertyField),
                    id: `${column.id}_${propertyField.name}`,
                    column_invisible: combineModifiers(
                        propertyField.column_invisible,
                        column.column_invisible,
                        "OR"
                    ),
                    classNames: column.classNames,
                    optional: "hide",
                    type: "field",
                    hasLabel: true,
                    label: propertyField.string,
                    sortable: false,
                    attrs: ["integer", "float"].includes(propertyField.type)
                        ? {sum: propertyField.string}
                        : {},
                };
            });
    }

    get buttonGroups() {
        return this.allColumns.filter((col) => col.type === "button_group");
    }

    getActiveColumns(list) {
        const seen = new Set();
        const res = this.allColumns.filter((col) => {
            const duplicate = seen.has(col.name);
            if (duplicate) {
                return false;
            }
            if (list.isGrouped && col.widget === "handle") {
                return false; // No handle column if the list is grouped
            }
            if (this.evalColumnInvisible(col.column_invisible)) {
                return false;
            }
            if (col.type === "button_group" || col.type === "widget") {
                return false;
            }
            seen.add(col.name);
            return true;
        });
        return res;
    }

    evalInvisible(invisible, record) {
        return evaluateBooleanExpr(invisible, record.evalContextWithVirtualIds);
    }

    evalInvisibleButtonGroup(invisible) {
        if (!invisible) return false;
        return this.selectedRecords.some(
            (recordID) =>
                !evaluateBooleanExpr(
                    invisible,
                    this.getRecord(recordID).evalContextWithVirtualIds
                )
        );
    }

    evalColumnInvisible(columnInvisible) {
        return evaluateBooleanExpr(columnInvisible, this.list.evalContext);
    }

    getCellClass(column, record) {
        if (column.relatedPropertyField && !(column.name in record.data)) {
            return "";
        }

        if (!this.cellClassByColumn[column.id]) {
            const classNames = ["o_data_cell"];
            if (column.type === "button_group") {
                classNames.push("o_list_button");
            } else if (column.type === "field") {
                classNames.push("o_field_cell");
                if (
                    column.attrs &&
                    column.attrs.class &&
                    this.canUseFormatter(column, record)
                ) {
                    classNames.push(column.attrs.class);
                }
                const typeClass = FIELD_CLASSES[this.list.fields[column.name].type];
                if (typeClass) {
                    classNames.push(typeClass);
                }
                if (column.widget) {
                    classNames.push(`o_${column.widget}_cell`);
                }
            }
            this.cellClassByColumn[column.id] = classNames;
        }
        const classNames = [...this.cellClassByColumn[column.id]];
        if (column.type === "field") {
            if (
                evaluateBooleanExpr(column.required, record.evalContextWithVirtualIds)
            ) {
                classNames.push("o_required_modifier");
            }
            if (record.isFieldInvalid(column.name)) {
                classNames.push("o_invalid_cell");
            }
            if (this.isCellReadonly(column, record)) {
                classNames.push("o_readonly_modifier");
            }
            if (this.canUseFormatter(column, record)) {
                // Generate field decorations classNames (only if field-specific decorations
                // have been defined in an attribute, e.g. decoration-danger="other_field = 5")
                // only handle the text-decoration.
                const {decorations} = column;
                for (const decoName in decorations) {
                    if (
                        evaluateBooleanExpr(
                            decorations[decoName],
                            record.evalContextWithVirtualIds
                        )
                    ) {
                        classNames.push(getClassNameFromDecoration(decoName));
                    }
                }
            }
        }

        if (Object.keys(record._changes).includes(column.name) && !record.isNew) {
            classNames.push("o_change_data");
        }

        return classNames.join(" ");
    }

    getRowClass(record) {
        const classNames = [];
        if (record.isInEdition) {
            classNames.push("o_edit");
        }
        if (this.canResequenceRows) {
            classNames.push("o_row_draggable");
        }
        return classNames.join(" ");
    }

    getFieldClass(column) {
        return column.attrs && column.attrs.class;
    }

    isInlineEditable(record) {
        // /!\ the keyboard navigation works under the hypothesis that all or
        // none records are editable.
        return Boolean(this.props.editable);
    }

    isRecordReadonly(record) {
        if (record.isNew) {
            return false;
        }
        if (this.props.activeActions?.edit === false) {
            return true;
        }
        if (
            record.isInEdition &&
            !this.isInlineEditable(record) &&
            !record.model.multiEdit
        ) {
            // In a x2many non editable list, a record is in edition when it is opened in a dialog,
            // but in the list we want it to still be displayed in readonly.
            return true;
        }
        return false;
    }

    isCellReadonly(column, record) {
        return Boolean(
            this.isRecordReadonly(record) ||
                (column.relatedPropertyField &&
                    record.selected &&
                    record.model.multiEdit) ||
                evaluateBooleanExpr(column.readonly, record.evalContextWithVirtualIds)
        );
    }

    getFieldProps(record, column) {
        return {readonly: false};
    }

    canUseFormatter(column, record) {
        if (column.widget) {
            return false;
        }
        if (
            record.isInEdition &&
            (record.model.multiEdit || this.isInlineEditable(record))
        ) {
            // In a x2many non editable list, a record is in edition when it is opened in a dialog,
            // but in the list we want it to still be displayed in readonly.
            return false;
        }
        return true;
    }

    // /////////////////////// Navigator /////////////////////////
    /**
     * @param {HTMLOrSVGElement} el
     */
    focus(el) {
        if (!el) {
            return;
        }
        el.focus();
        if (
            ["text", "search", "url", "tel", "password", "textarea"].includes(
                el.type
            ) &&
            el.selectionStart === el.selectionEnd
        ) {
            el.selectionStart = 0;
            el.selectionEnd = el.value.length;
        }
    }

    async onCellClicked(id, column, ev) {
        if (ev.target.special_click) {
            return;
        }
        await this.list.records.forEach((record) => {
            if (record.isInEdition) record.switchMode("readonly");
        });
        const record = this.list.records.find(
            (record) => record.resId == id || record._virtualId == id
        );
        if (record) {
            this.list.enterEditMode(record).then((canProceed) => {
                if (canProceed && !this.isCellReadonly(column, record)) {
                    // Const cell = this.tableRef.el.querySelector(
                    //     `.o_edit td[name='${column.name}']`
                    // );
                    // if (cell) {
                    //     const toFocus = getElementToFocus(cell);
                    //     if (cell !== toFocus) {
                    //         this.focus(toFocus);
                    //     }
                    // }
                }
            });
        }
    }

    toggleFocusInsideCell(hotkey, cell) {
        if (!["tab", "shift+tab"].includes(hotkey) || !containsActiveElement(cell)) {
            return false;
        }
        const focusableEls = getTabableElements(cell).filter(
            (el) =>
                el === document.activeElement ||
                ["INPUT", "TEXTAREA"].includes(el.tagName)
        );
        const index = focusableEls.indexOf(document.activeElement);
        return (
            (hotkey === "tab" && index < focusableEls.length - 1) ||
            (hotkey === "shift+tab" && index > 0)
        );
    }

    onCellKeydown(ev, recordID) {
        if (this.list.model.useSampleModel) {
            return;
        }
        const hotkey = getActiveHotkey(ev);

        if (ev.target.tagName === "TEXTAREA" && hotkey === "enter") {
            return;
        }

        const closestCell = ev.target.closest("td", "th");
        if (this.toggleFocusInsideCell(hotkey, closestCell)) {
            return;
        }
    }

    // /////////////////////// Show/Hide columns /////////////////////////

    // /////////////////////// Column filter /////////////////////////
    async filterO2M() {
        const filterIds = await this.list.model.orm.call(
            this.list.resModel,
            "web_filtered_domain",
            [
                this.list.currentIds.filter((id) => typeof id !== "string"),
                this.o2mDomain,
            ],
            {}
        );
        const newFilterIds = this.list.currentIds.filter(
            (id) => typeof id === "string" || filterIds.includes(id)
        );
        if (newFilterIds.length) {
            const resIds = this.list._getResIdsToLoad(newFilterIds);
            const records = await this.list.model._loadRecords(
                {...this.list.config, resIds},
                this.list.evalContext
            );
            for (const record of records) {
                this.list._createRecordDatapoint(record);
            }
        }
        this.list.records = this.state.filterIds.map((id) => this.list._cache[id]);
        this.state.filterIds = newFilterIds;
        this.table.options.data = [...this.state.filterIds];
    }

    // /////////////////////// Sorting /////////////////////////
    async toggleSorting(header, ev) {
        const resIds = this.list._getResIdsToLoad(this.state.filterIds);
        const records = await this.list.model._loadRecords(
            {...this.list.config, resIds},
            this.list.evalContext
        );
        for (const record of records) {
            this.list._createRecordDatapoint(record);
        }
        this.list.records = this.state.filterIds.map((id) => this.list._cache[id]);
        header.column.getToggleSortingHandler()(ev);
    }

    // /////////////////////// Pagination /////////////////////////
    async loadRecordByPage(page, pageSize) {
        const offset = page * pageSize;
        const resIds = this.list._getResIdsToLoad(
            this.state.filterIds.slice(offset, offset + pageSize)
        );
        if (resIds.length) {
            const records = await this.list.model._loadRecords(
                {...this.list.config, resIds},
                this.list.evalContext
            );
            for (const record of records) {
                this.list._createRecordDatapoint(record);
            }
            this.list.records = this.state.filterIds
                .slice(offset, offset + pageSize)
                .map((id) => this.list._cache[id]);
        }
    }

    async goToPage(ev) {
        const page = ev.target.value ? Number(ev.target.value) - 1 : 0;
        const {pageIndex, pageSize} = this.table.getState().pagination;
        await this.loadRecordByPage(page, pageSize);
        this.table.setPageIndex(page);
    }

    async setPageSize(ev) {
        const {pageIndex, pageSize} = this.table.getState().pagination;
        await this.loadRecordByPage(pageIndex, Number(ev.target.value));
        this.table.setPageSize(Number(ev.target.value));
    }

    async nextPage() {
        const {pageIndex, pageSize} = this.table.getState().pagination;
        await this.loadRecordByPage(pageIndex + 1, pageSize);
        this.table.nextPage();
    }

    async previousPage() {
        const {pageIndex, pageSize} = this.table.getState().pagination;
        await this.loadRecordByPage(pageIndex - 1, pageSize);
        this.table.previousPage();
    }

    async lastPage() {
        if (this.table.getCanNextPage()) {
            const {pageIndex, pageSize} = this.table.getState().pagination;
            await this.loadRecordByPage(this.table.getPageCount() - 1, pageSize);
            this.table.lastPage();
        }
    }

    // /////////////////////// Row selection /////////////////////////
}

export const o2mTableField = {
    component: O2MTableField,
    displayName: _t("Relational table"),
    supportedTypes: ["one2many", "many2many"],
    useSubView: true,
    extractProps: (
        {attrs, relatedFields, viewMode, views, widget, options, string},
        dynamicInfo
    ) => {
        const props = {
            addLabel: attrs["add-label"],
            context: dynamicInfo.context,
            domain: dynamicInfo.domain,
            crudOptions: options,
            string,
        };
        if (viewMode) {
            props.views = views;
            props.viewMode = viewMode;
            props.relatedFields = relatedFields;
        }
        if (widget) {
            props.widget = widget;
        }
        return props;
    },
};

registry.category("fields").add("o2m_table", o2mTableField);
