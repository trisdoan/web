# Copyright 2025 Camptocamp
# License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl)

{
    "name": "Web Improved x2 Widget",
    "version": "18.0.1.0.0",
    "author": "Camptocamp, Odoo Community Association (OCA)",
    "maintainers": ["trisdoan"],
    "website": "https://github.com/OCA/web",
    "license": "LGPL-3",
    "category": "Extra Tools",
    "depends": ["web"],
    "assets": {
        "web.assets_backend": [
            "web_improved_x2_widget/static/lib/table-core/**/*",
            "web_improved_x2_widget/static/src/hook/**/*",
            "web_improved_x2_widget/static/src/o2m_table/**/*",
            "web_improved_x2_widget/static/src/o2m_filter/**/*",
        ]
    },
    "installable": True,
}
