import {Component, onWillStart, useEffect, useRef, useState, xml} from "@odoo/owl";
import {Dropdown} from "@web/core/dropdown/dropdown";
import {DropdownItem} from "@web/core/dropdown/dropdown_item";
import {DateTimeInput} from "@web/core/datetime/datetime_input";
import {areDatesEqual, formatDate} from "@web/core/l10n/dates";
import {Domain} from "@web/core/domain";

class DefaultSearch extends Component {
    static props = ["*"];
    static template = xml``;
}

class SearchChar extends Component {
    static template = "owl_table.SearchChar";
    static props = ["*"];

    setup() {
        this.inputRef = useRef("input_query");
        this.state = useState({query: ""});
        this.searchFieldItem = null;
    }

    get searchItems() {
        return this.env.searchModel.searchItems;
    }

    onSearchInput(ev) {
        const query = ev.target.value;
        query.trim() ? (this.state.query = query.trim()) : (this.state.query = "");
    }

    onBlur() {
        if (this.state.query.length == 0) {
            delete this.props.fieldDomain[this.props.field.name];
            this.props.filter();
            return;
        }
        this.props.fieldDomain[this.props.field.name] = new Domain([
            [this.props.field.name, "ilike", `${this.state.query}`],
        ]);
        this.props.filter();
    }

    onSearchKeydown(ev) {
        if (ev.isComposing) {
            // This case happens with an IME for example: we let it handle all key events.
            return;
        }
        switch (ev.key) {
            case "Enter":
                if (this.state.query.length == 0) {
                    delete this.props.fieldDomain[this.props.field.name];
                    this.props.filter();
                    break;
                }
                this.props.fieldDomain[this.props.field.name] = new Domain([
                    [this.props.field.name, "ilike", `${this.state.query}`],
                ]);
                this.props.filter();
                break;
        }
    }
    focusInput(ev) {
        ev.target.focus();
    }
}

class SearchDate extends Component {
    static template = "owl_table.SearchDate";
    static components = {Dropdown, DropdownItem, DateTimeInput};
    static props = ["*"];

    setup() {
        this.state = useState({
            fromDate: false,
            toDate: false,
            disabledButton: true,
            domain: [],
        });
    }

    get domainString() {
        let domainString = "";
        if (this.state.fromDate) {
            if (domainString.length > 0) {
                domainString += `>=${formatDate(this.state.fromDate)}`;
            } else {
                domainString = `>=${formatDate(this.state.fromDate)}`;
            }
        }
        if (this.state.toDate) {
            if (domainString.length > 0) {
                domainString += ` | <=${formatDate(this.state.toDate)}`;
            } else {
                domainString = `<=${formatDate(this.state.toDate)}`;
            }
        }
        return domainString.length == 0 ? "Search..." : domainString;
    }

    onFromDateChanged(date) {
        if (!areDatesEqual(this.state.fromDate || "", date)) {
            this.state.fromDate = date;
            this.state.disabledButton = [this.state.fromDate, this.state.toDate].every(
                (d) => d == false
            );
        }
    }

    onToDateChanged(date) {
        if (!areDatesEqual(this.state.toDate || "", date)) {
            this.state.toDate = date;
            this.state.disabledButton = [this.state.fromDate, this.state.toDate].every(
                (d) => d == false
            );
        }
    }

    convertDateUTC(value, type) {
        if (!value) return value;
        if (this.props.field.type == "date") {
            return {
                label: formatDate(value),
                value: value.toFormat("yyyy-MM-dd"),
            };
        }
        return type == "min"
            ? {
                  label: formatDate(value),
                  value: value
                      .set({hour: 0, minute: 0, second: 0})
                      .setZone("utc")
                      .toFormat("yyyy-MM-dd HH:mm:ss"),
              }
            : {
                  label: formatDate(value),
                  value: value
                      .set({hour: 23, minute: 59, second: 59})
                      .setZone("utc")
                      .toFormat("yyyy-MM-dd HH:mm:ss"),
              };
    }

    onApply() {
        if (!this.state.fromDate && !this.state.toDate) return;
        let description = this.props.field.string;
        const domain = [];
        const name = this.props.field.name;
        const fromDate = this.convertDateUTC(this.state.fromDate, "min");
        const toDate = this.convertDateUTC(this.state.toDate, "max");
        if (fromDate && !toDate) {
            description = description + " >= " + fromDate.label;
            domain.push([name, ">=", fromDate.value]);
        } else if (!fromDate && toDate) {
            description = description + " <= " + toDate.label;
            domain.push([name, "<=", toDate.value]);
        } else {
            domain.push([name, ">=", fromDate.value], [name, "<=", toDate.value]);
            if (this.state.fromDate <= this.state.toDate) {
                description =
                    fromDate.label + " <= " + description + " <= " + toDate.label;
            } else {
                description =
                    description + " >= " + fromDate.label + " OR <= " + toDate.label;
                domain.unshift("|");
            }
        }

        this.props.fieldDomain[this.props.field.name] = new Domain(domain);
        this.props.filter();
        this.state.domain = domain.map((d) => d);
    }

    resetState() {
        this.state.fromDate = false;
        this.state.toDate = false;
        this.state.domain = [];
        this.state.disabledButton = true;
    }

    onClear() {
        const name = this.props.field.name;
        this.resetState();
        delete this.props.fieldDomain[name];
        this.props.filter();
    }
    focusInput(ev) {
        ev.target.focus();
    }
}

class SearchSelection extends Component {
    static template = "owl_table.SearchSelection";
    static components = {Dropdown, DropdownItem};
    static props = ["*"];

    setup() {
        this.state = useState({
            checkedAll: false,
            disabledButton: true,
            domain: [],
        });
        onWillStart(() => {
            if (this.props.field.type == "selection") {
                this.state.selection = this.props.field.selection.map((se) => {
                    return {label: se[1], value: se[0], checked: false};
                });
            } else {
                this.state.selection = [
                    {
                        label: "True",
                        value: "true",
                        checked: false,
                    },
                    {
                        label: "False",
                        value: "false",
                        checked: false,
                    },
                ];
            }
        });
    }

    get label() {
        return this.state.selection
            .filter((sel) => sel.checked)
            .map((sel) => sel.label)
            .join(", ");
    }

    onSelectAll() {
        this.state.checkedAll = !this.state.checkedAll;
        this.state.selection.forEach((se) => (se.checked = this.state.checkedAll));
        this.state.disabledButton =
            this.state.selection.filter((se) => se.checked).length == 0;
    }

    onSelectOne(selection) {
        selection.checked = !selection.checked;
        this.state.checkedAll = false;
        this.state.disabledButton =
            this.state.selection.filter((se) => se.checked).length == 0;
    }

    onApply() {
        const selection = this.state.selection.filter((se) => se.checked);
        const domain = [
            this.props.field.name,
            "in",
            selection.map((s) =>
                this.props.field.type == "selection" ? s.value : s.value === "true"
            ),
        ];

        this.props.fieldDomain[this.props.field.name] = new Domain([domain]);
        this.props.filter();
        this.state.domain = domain.map((d) => d);
    }

    resetState() {
        this.state.checkedAll = false;
        this.state.selection.forEach((se) => (se.checked = false));
        this.state.disabledButton = true;
        this.state.domain = [];
    }

    onClear() {
        const name = this.props.field.name;
        this.resetState();
        delete this.props.fieldDomain[name];
        this.props.filter();
    }
    focusInput(ev) {
        ev.target.focus();
    }
}

class SearchFloat extends Component {
    static template = "owl_table.SearchFloat";
    static components = {Dropdown, DropdownItem};
    static props = ["*"];

    setup() {
        this.state = useState({
            fromValue: 0,
            toValue: 0,
            disabledButton: true,
            domain: [],
        });
        useEffect(
            () => {
                this.state.disabledButton =
                    this.state.fromValue === 0 && this.state.toValue === 0;
            },
            () => [this.state.fromValue, this.state.toValue]
        );
    }

    get domainString() {
        let domainString = "";
        if (this.state.fromValue > 0) {
            if (domainString.length > 0) {
                domainString += `>=${this.state.fromValue}`;
            } else {
                domainString = `>=${this.state.fromValue}`;
            }
        }
        if (this.state.toValue > 0) {
            if (domainString.length > 0) {
                domainString += ` | <=${this.state.toValue}`;
            } else {
                domainString = `<=${this.state.toValue}`;
            }
        }
        return domainString.length == 0 ? "Search..." : domainString;
    }

    onApply() {
        let description = this.props.field.string;
        const domain = [];
        const name = this.props.field.name;
        if (!this.state.fromValue && !this.state.toValue) {
        } else if (Boolean(this.state.fromValue) && !this.state.toValue) {
            description = description + " >= " + this.state.fromValue;
            domain.push([name, ">=", this.state.fromValue]);
        } else if (!this.state.fromValue && Boolean(this.state.toValue)) {
            description = description + " <= " + this.state.toValue;
            domain.push([name, "<=", this.state.toValue]);
        } else {
            domain.push(
                [name, ">=", this.state.fromValue],
                [name, "<=", this.state.toValue]
            );
            if (this.state.fromValue < this.state.toValue) {
                description =
                    this.state.fromValue +
                    " <= " +
                    description +
                    " <= " +
                    this.state.toValue;
            } else {
                description =
                    description +
                    " >= " +
                    this.state.fromValue +
                    " OR <= " +
                    this.state.toValue;
                domain.unshift("|");
            }
        }
        this.props.fieldDomain[name] = new Domain(domain);
        this.props.filter();
        this.state.domain = domain.map((d) => d);
    }

    resetState() {
        this.state.fromValue = 0;
        this.state.toValue = 0;
        this.state.domain = [];
        this.state.disabledButton = true;
    }

    onClear() {
        const name = this.props.field.name;
        this.resetState();
        delete this.props.fieldDomain[name];
        this.props.filter();
    }

    focusInput(ev) {
        ev.target.focus();
    }
}

export class O2MFilter extends Component {
    static template = "o2m_table.O2MFilter";
    static props = {
        field: {type: Object},
        list: {type: Object},
        fieldDomain: {type: Object, optional: true},
        filter: {type: Function},
    };

    get searchColumn() {
        const res = {
            component: DefaultSearch,
            componentProps:
                {
                    field: this.props.field,
                    list: this.props.list,
                    fieldDomain: this.props.fieldDomain,
                    filter: this.props.filter,
                } || {},
        };
        if (this.props.field === undefined) return res;
        if (!this.props.field.searchable) return res;

        if (["char", "many2one", "many2many"].includes(this.props.field.type)) {
            res.component = SearchChar;
        } else if (["date", "datetime"].includes(this.props.field.type)) {
            res.component = SearchDate;
        } else if (["selection", "boolean"].includes(this.props.field.type)) {
            res.component = SearchSelection;
        } else if (["integer", "float", "monetary"].includes(this.props.field.type)) {
            res.component = SearchFloat;
        }
        return res;
    }
}
