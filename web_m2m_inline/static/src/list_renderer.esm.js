/** @odoo-module **/

import {Domain} from "@web/core/domain";
import {useX2ManyCrud} from "@web/views/fields/relational_utils";
import {useService} from "@web/core/utils/hooks";
import {ListRenderer} from "@web/views/list/list_renderer";
import {CustomMany2XAutocomplete} from "./autocomplete";

export class AutoCompleteListRenderer extends ListRenderer {
    static components = {
        ...ListRenderer,
        CustomMany2XAutocomplete,
    };

    setup() {
        super.setup();
        this.orm = useService("orm");
        const {saveRecord, removeRecord} = useX2ManyCrud(() => this.props.list, true);
        this.update = (recordlist) => {
            if (!recordlist || !Array.isArray(recordlist)) {
                return;
            }
            // TODO: docs here
            if (this.selectedRecord) {
                removeRecord(this.selectedRecord);
            }
            const resIds = recordlist.map((rec) => rec.id);
            saveRecord(resIds);
            return this.props.list.leaveEditMode();
        };

        if (this.props.canQuickCreate) {
            this.quickCreate = async (name) => {
                const created = await this.orm.call(
                    this.relation,
                    "name_create",
                    [name],
                    {
                        context: this.props.context,
                    }
                );
                saveRecord([created[0]]);
                return this.props.list.leaveEditMode();
            };
        }
    }

    get showM2OSelectionField() {
        return !this.props.readonly;
    }

    get relation() {
        return this.props.list.records[0].resModel;
    }

    get string() {
        return this.record.fields[this.column.name].string || "";
    }

    getDomain() {
        const domain =
            typeof this.props.domain === "function"
                ? this.props.domain()
                : this.props.domain;
        const currentIds = this.props.list._currentIds.filter(
            (id) => typeof id === "number"
        );
        return Domain.and([domain, Domain.not([["id", "in", currentIds]])]).toList(
            this.props.context
        );
    }

    async onCellClicked(record, column, ev) {
        await super.onCellClicked(record, column, ev);
        if (!record.isNew) {
            this.selectedRecord = record;
        }
    }
}

AutoCompleteListRenderer.recordRowTemplate =
    "c2c_governance.AutoCompleteListRenderer.recordRowTemplate";

AutoCompleteListRenderer.props = [
    ...ListRenderer.props,
    "canCreate?",
    "canQuickCreate?",
    "canCreateEdit?",
    "createDomain?",
    "context?",
    "domain?",
    "readonly?",
];
