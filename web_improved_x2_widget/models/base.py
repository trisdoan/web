# Copyright 2025 Camptocamp
# License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl)

from odoo import models


class Base(models.AbstractModel):
    _inherit = "base"

    def web_filtered_domain(self, domain):
        return self.filtered_domain(domain).ids
