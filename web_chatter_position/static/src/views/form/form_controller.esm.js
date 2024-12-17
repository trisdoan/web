/** @odoo-module **/
/*
    Copyright 2023 Camptocamp SA (https://www.camptocamp.com).
    License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
*/

import {SIZES} from "@web/core/ui/ui_service";
import {append, combineAttributes} from "@web/core/utils/xml";
import {FormController} from "@web/views/form/form_controller";
import {patch} from "@web/core/utils/patch";
import {onMounted, onPatched, useRef, useState} from "@odoo/owl";

/**
 * So, you've landed here and you have no idea what this is about. Don't worry, you're
 * not the only one. Here's a quick summary of what's going on:
 *
 * In core, the chatter position depends on the size of the screen and wether there is
 * an attachment viewer or not. There are 3 possible positions, and for each position a
 * different chatter instance is displayed.
 *
 * So, in fact, we have 3 chatter instances running, and we switch their visibility
 * depending on the desired position.
 *
 * A) Bottom position
 *    https://github.com/odoo/odoo/blob/2ef010907/addons/mail/static/src/views/form/form_compiler.js#L160
 *    Condition: `!this.props.hasAttachmentViewer and uiService.size < ${SIZES.XXL}`
 *
 *    This is the bottom position you would except. However it can only be there until
 *    XXL screen sizes, because the container is a flexbox and changes from row to
 *    column display. It's hidden in the presence of an attachment viewer.
 *
 * B) Bottom In-sheet position
 *    https://github.com/odoo/odoo/blob/2ef010907/addons/mail/static/src/views/form/form_compiler.js#L181
 *    Condition: `this.props.hasAttachmentViewer`
 *
 *    This is the bottom position that's used when there's an attachment viewer in place.
 *    It's rendered within the form sheet, possibly to by-pass the flexbox issue
 *    beforementioned. It's only instanciated when there's an attachment viewer.
 *
 * C) Sided position
 *    https://github.com/odoo/odoo/blob/2ef010907/addons/mail/static/src/views/form/form_compiler.js#L83
 *    Condition: `!hasAttachmentViewer() and uiService.size >= ${SIZES.XXL}`
 *
 *    This is the sided position, hidden in the presence of an attachment viewer.
 *    It's the better half of `A`.
 *
 * The patches and overrides you see below are here to alter these conditions to force
 * a specific position regardless of the screen size, depending on an user setting.

 * The chatter is always positioned aside by default.
 * If no chatter is present, no need to patch.
 * If an attachment viewer is present, the chatter is forced to the bottom.
 * When user's preference 'sided'.
    - Transitioning from 'bottom' to 'sided' involves hiding the in-form chatter and revealing the original chatter.
 * When his preference is 'bottom', the original chatter is duplicated and hidden, and the clone is moved to the bottom.

 */

patch(FormController.prototype, "web_chatter_position", {
    setup() {
        this._super();
        this.state = useState({
            currentPosition: odoo.web_chatter_position,
        });

        this.rootRef = useRef("root");

        onMounted(() => {
            this._updateChatterPosition();
        });

        /*
         * Native chatter is added when resize
         * which conflicts with our customized chatter
         * Hide that native one while resizing
         */
        onPatched(() => {
            if (this.hasAttachmentViewerInArch) {
                return;
            }

            const rootEl = this.rootRef.el;
            const bottomChatter = rootEl.querySelector(`.web_chatter_position`);
            const isSmallScreen = this.ui.size < SIZES.XXL;
            const position =
                this.state.currentPosition === "sided"
                    ? "o-isInFormSheetBg"
                    : "o-aside";
            const redundantChatter = rootEl.querySelector(
                `div.o_FormRenderer_chatterContainer.oe_chatter.${position}`
            );

            if (bottomChatter) {
                bottomChatter.style.display = isSmallScreen ? "none" : "contents";
            }
            if (redundantChatter) {
                redundantChatter.style.display = "none";
            }
        });
    },

    //* *
    // * Change position in-place: either Bottom or Sided
    // */
    onClickChangePosition() {
        const newPosition =
            this.state.currentPosition === "bottom" ? "sided" : "bottom";
        this.state.currentPosition = newPosition;
        this._updateChatterPosition();
    },

    _updateChatterPosition() {
        if (this.hasAttachmentViewerInArch) {
            return;
        }
        const rootEl = this.rootRef.el;
        if (!rootEl) {
            return;
        }
        const currentChatter = rootEl.querySelector(
            "div.o_FormRenderer_chatterContainer.oe_chatter"
        );
        if (!currentChatter) {
            return;
        }
        const formSheetBg = rootEl.querySelector(".o_form_sheet_bg");
        if (!formSheetBg) return;
        const formSheet = formSheetBg.querySelector(".o_form_sheet");
        if (!formSheet) return;

        if (this.state.currentPosition === "bottom") {
            this._moveChatterToBottom(rootEl, currentChatter, formSheetBg);
        } else if (this.state.currentPosition === "sided") {
            this._moveChatterToSided(rootEl);
        }
    },

    _moveChatterToBottom(rootEl, currentChatter, form) {
        const inFormChatter = rootEl.querySelector(
            "div.o_FormRenderer_chatterContainer.oe_chatter.o-isInFormSheetBg"
        );
        if (!inFormChatter) {
            const newChatter = currentChatter.cloneNode(true);
            newChatter.classList.replace("o-aside", "o-isInFormSheetBg");
            combineAttributes(newChatter, "class", ["web_chatter_position"]);

            append(form, newChatter);
            currentChatter.style.display = "none";
        }

        const formChatter =
            inFormChatter ||
            rootEl.querySelector(
                "div.o_FormRenderer_chatterContainer.oe_chatter.o-isInFormSheetBg"
            );

        if (formChatter) {
            formChatter.style.display = "contents";

            const chatterContainer = formChatter.querySelector(
                "div.o_ChatterContainer"
            );

            const hasClassOIsInFormSheetBg =
                chatterContainer.classList.contains("o-isInFormSheetBg");
            const hasClassMxAuto = chatterContainer.classList.contains("mx-auto");

            if (!hasClassOIsInFormSheetBg && !hasClassMxAuto)
                combineAttributes(chatterContainer, "class", [
                    "o-isInFormSheetBg",
                    "mx-auto",
                ]);
        }
    },

    _moveChatterToSided(rootEl) {
        const inFormChatter = rootEl.querySelector(
            "div.o_FormRenderer_chatterContainer.oe_chatter.o-isInFormSheetBg"
        );
        if (inFormChatter) {
            inFormChatter.style.display = "none";
        }
        const sideFormChatter = rootEl.querySelector(
            "div.o_FormRenderer_chatterContainer.oe_chatter.o-aside"
        );
        if (sideFormChatter) {
            sideFormChatter.style.display = "contents";
        }
    },
});
