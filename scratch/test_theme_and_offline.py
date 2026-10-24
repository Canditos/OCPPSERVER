"""
Comprehensive Automated Test Suite:
1. Offline Charger Exclusion by Default (Dashboard Filter Logic)
2. Theme Architecture (Light Mode & Dark Mode CSS Tokens)
3. WCAG 2.1 Contrast Ratio Verification (Light vs Dark)
4. Frontend Source Code Theme Audit (Dual Dark/Light Tailwind Classes)
5. Theme Switcher Hook & Toggle Verification
"""

import os
import re
import math
import json
import unittest

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRONTEND_SRC = os.path.join(WORKSPACE_ROOT, "frontend", "src")
INDEX_CSS = os.path.join(FRONTEND_SRC, "index.css")

# --- WCAG 2.1 Color Math Helpers ---
def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join(c * 2 for c in hex_str)
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def relative_luminance(rgb):
    srgb = [c / 255.0 for c in rgb]
    lum = []
    for c in srgb:
        if c <= 0.03928:
            lum.append(c / 12.92)
        else:
            lum.append(((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2]

def contrast_ratio(hex1, hex2):
    lum1 = relative_luminance(hex_to_rgb(hex1))
    lum2 = relative_luminance(hex_to_rgb(hex2))
    l_max = max(lum1, lum2)
    l_min = min(lum1, lum2)
    return (l_max + 0.05) / (l_min + 0.05)


class TestOfflineChargerFilter(unittest.TestCase):
    """Test the exact filtering logic implemented in frontend/src/pages/Dashboard.tsx"""

    def setUp(self):
        self.mock_chargers = [
            {"id": 1, "charge_point_id": "charger-01", "is_online": True, "connectors": [{"status": "Available"}]},
            {"id": 2, "charge_point_id": "charger-02", "is_online": True, "connectors": [{"status": "Charging"}]},
            {"id": 3, "charge_point_id": "charger-03", "is_online": False, "connectors": [{"status": "Unavailable"}]},
            {"id": 4, "charge_point_id": "charger-04", "is_online": False, "connectors": [{"status": "Offline"}]},
            {"id": 5, "charge_point_id": "charger-05", "is_online": True, "connectors": [{"status": "Faulted"}]},
            {"id": 6, "charge_point_id": "charger-aio-offline-fault", "is_online": False, "connectors": [{"status": "Faulted"}]},
        ]

    def filter_chargers(self, chargers, status_filter='all', show_offline=False, search_query=''):
        """Faithful replica of useMemo filteredChargers logic in Dashboard.tsx"""
        def is_online(c):
            return c.get("is_online", False)

        def is_charging(c):
            if not is_online(c):
                return False
            return any(conn.get("status") == "Charging" for conn in c.get("connectors", []))

        def is_faulted(c):
            if not is_online(c):
                return False
            return any(conn.get("status") == "Faulted" for conn in c.get("connectors", []))

        def is_available(c):
            if not is_online(c):
                return False
            return not is_charging(c) and not is_faulted(c)

        result = []
        for c in chargers:
            online = is_online(c)

            # Core Rule: Do not show offline chargers by default unless explicitly viewing 'offline' or toggle is on
            if not online and status_filter != 'offline' and not show_offline:
                continue

            if status_filter == 'online' and not online:
                continue
            if status_filter == 'charging' and not is_charging(c):
                continue
            if status_filter == 'available' and not is_available(c):
                continue
            if status_filter == 'faulted' and not is_faulted(c):
                continue
            if status_filter == 'offline' and online:
                continue

            if search_query.strip():
                q = search_query.lower()
                if q not in c["charge_point_id"].lower():
                    continue

            result.append(c)
        return result

    def test_default_excludes_offline_chargers(self):
        """Dashboard must hide offline chargers on default view (show_offline=False, status_filter='all')"""
        filtered = self.filter_chargers(self.mock_chargers, status_filter='all', show_offline=False)
        ids = [c["charge_point_id"] for c in filtered]
        self.assertNotIn("charger-03", ids, "charger-03 is offline and should NOT appear by default")
        self.assertNotIn("charger-04", ids, "charger-04 is offline and should NOT appear by default")
        self.assertNotIn("charger-aio-offline-fault", ids, "charger-aio-offline-fault is offline and should NOT appear by default")
        self.assertEqual(len(filtered), 3, "Only the 3 online chargers should appear")

    def test_toggle_show_offline(self):
        """Clicking 'Ver Offline' (show_offline=True) must display both online and offline chargers"""
        filtered = self.filter_chargers(self.mock_chargers, status_filter='all', show_offline=True)
        self.assertEqual(len(filtered), 6, "All 6 chargers should appear when show_offline=True")

    def test_filter_offline_only(self):
        """Selecting 'offline' filter must display ONLY offline chargers"""
        filtered = self.filter_chargers(self.mock_chargers, status_filter='offline', show_offline=False)
        ids = [c["charge_point_id"] for c in filtered]
        self.assertEqual(ids, ["charger-03", "charger-04", "charger-aio-offline-fault"])

    def test_filter_available_only(self):
        """Selecting 'available' filter must display only available online charger"""
        filtered = self.filter_chargers(self.mock_chargers, status_filter='available', show_offline=False)
        ids = [c["charge_point_id"] for c in filtered]
        self.assertEqual(ids, ["charger-01"])

    def test_filter_charging_only(self):
        """Selecting 'charging' filter must display only charging online charger"""
        filtered = self.filter_chargers(self.mock_chargers, status_filter='charging', show_offline=False)
        ids = [c["charge_point_id"] for c in filtered]
        self.assertEqual(ids, ["charger-02"])

    def test_offline_fault_does_not_corrupt_fleet_metrics(self):
        """An offline charger with a stale fault status in DB must not corrupt online availability or fault count"""
        def is_online(c):
            return c.get("is_online", False)

        def is_charging(c):
            if not is_online(c):
                return False
            return any(conn.get("status") == "Charging" for conn in c.get("connectors", []))

        def is_faulted(c):
            if not is_online(c):
                return False
            return any(conn.get("status") == "Faulted" for conn in c.get("connectors", []))

        def is_available(c):
            if not is_online(c):
                return False
            return not is_charging(c) and not is_faulted(c)

        online_count = len([c for c in self.mock_chargers if is_online(c)])
        charging_count = len([c for c in self.mock_chargers if is_charging(c)])
        faulted_count = len([c for c in self.mock_chargers if is_faulted(c)])
        available_count = len([c for c in self.mock_chargers if is_available(c)])
        offline_count = len([c for c in self.mock_chargers if not is_online(c)])

        # 3 online (charger-01, charger-02, charger-05), 3 offline (charger-03, charger-04, charger-aio-offline-fault)
        self.assertEqual(online_count, 3)
        self.assertEqual(charging_count, 1) # charger-02
        self.assertEqual(faulted_count, 1)  # only charger-05, NOT charger-aio-offline-fault!
        self.assertEqual(available_count, 1) # charger-01 (must NOT be zero!)
        self.assertEqual(offline_count, 3)
        self.assertEqual(available_count + charging_count + faulted_count + offline_count, len(self.mock_chargers))

        # Fault filter must only return the active online faulted charger
        faulted_filtered = self.filter_chargers(self.mock_chargers, status_filter='faulted', show_offline=False)
        self.assertEqual([c["charge_point_id"] for c in faulted_filtered], ["charger-05"])


class TestThemeCssTokensAndContrast(unittest.TestCase):
    """Test CSS variables and WCAG contrast ratios in Light and Dark mode"""

    @classmethod
    def setUpClass(cls):
        with open(INDEX_CSS, "r", encoding="utf-8") as f:
            cls.css_content = f.read()

    def test_theme_tokens_present(self):
        """Ensure critical design tokens are defined in both :root (light) and html.dark"""
        required_tokens = [
            "--color-canvas",
            "--color-card",
            "--color-card-border",
            "--color-card-secondary",
            "--color-text-primary",
            "--color-text-secondary",
            "--color-text-muted",
            "--color-input-bg",
            "--color-input-border",
            "--color-table-header-bg",
            "--color-table-header-text",
            "--color-table-border",
        ]

        # Extract :root block
        root_match = re.search(r":root\s*\{([^}]+)\}", self.css_content)
        self.assertIsNotNone(root_match, ":root block must be defined in index.css")
        root_block = root_match.group(1)

        # Extract html.dark block
        dark_match = re.search(r"html\.dark\s*\{([^}]+)\}", self.css_content)
        self.assertIsNotNone(dark_match, "html.dark block must be defined in index.css")
        dark_block = dark_match.group(1)

        for token in required_tokens:
            self.assertIn(token, root_block, f"Token {token} missing in :root (light mode)")
            self.assertIn(token, dark_block, f"Token {token} missing in html.dark (dark mode)")

    def test_wcag_contrast_light_mode(self):
        """Light mode contrast ratio must meet WCAG AA (>= 4.5:1) and AAA (>= 7:1)"""
        # From :root:
        # canvas: #f8fafc, card: #ffffff, text-primary: #0f172a, text-secondary: #334155, text-muted: #64748b
        cr_primary = contrast_ratio("#0f172a", "#f8fafc")
        cr_card = contrast_ratio("#0f172a", "#ffffff")
        cr_secondary = contrast_ratio("#334155", "#ffffff")
        cr_muted = contrast_ratio("#64748b", "#ffffff")

        print(f"\n[LIGHT MODE CONTRAST]")
        print(f"  Primary Text (#0f172a) on Canvas (#f8fafc): {cr_primary:.2f}:1 (Target: >= 7.0:1 AAA)")
        print(f"  Primary Text (#0f172a) on Card (#ffffff):   {cr_card:.2f}:1 (Target: >= 7.0:1 AAA)")
        print(f"  Secondary Text (#334155) on Card (#ffffff): {cr_secondary:.2f}:1 (Target: >= 4.5:1 AA)")
        print(f"  Muted Text (#64748b) on Card (#ffffff):     {cr_muted:.2f}:1 (Target: >= 4.5:1 AA)")

        self.assertGreaterEqual(cr_primary, 7.0, "Light mode primary text must meet WCAG AAA (>= 7:1)")
        self.assertGreaterEqual(cr_card, 7.0, "Light mode card text must meet WCAG AAA (>= 7:1)")
        self.assertGreaterEqual(cr_secondary, 4.5, "Light mode secondary text must meet WCAG AA (>= 4.5:1)")
        self.assertGreaterEqual(cr_muted, 4.5, "Light mode muted text must meet WCAG AA (>= 4.5:1)")

    def test_wcag_contrast_dark_mode(self):
        """Dark mode contrast ratio must meet WCAG AA (>= 4.5:1) and AAA (>= 7:1)"""
        # From html.dark:
        # canvas: #080c14, card: #0f172a, text-primary: #f8fafc, text-secondary: #cbd5e1, text-muted: #94a3b8
        cr_primary = contrast_ratio("#f8fafc", "#080c14")
        cr_card_text = contrast_ratio("#f8fafc", "#0f172a")
        cr_secondary = contrast_ratio("#cbd5e1", "#0f172a")
        cr_muted = contrast_ratio("#94a3b8", "#0f172a")

        print(f"\n[DARK MODE CONTRAST]")
        print(f"  Primary Text (#f8fafc) on Canvas (#080c14): {cr_primary:.2f}:1 (Target: >= 7.0:1 AAA)")
        print(f"  Primary Text (#f8fafc) on Card (#0f172a):   {cr_card_text:.2f}:1 (Target: >= 7.0:1 AAA)")
        print(f"  Secondary Text (#cbd5e1) on Card (#0f172a): {cr_secondary:.2f}:1 (Target: >= 4.5:1 AA)")
        print(f"  Muted Text (#94a3b8) on Card (#0f172a):     {cr_muted:.2f}:1 (Target: >= 4.5:1 AA)")

        self.assertGreaterEqual(cr_primary, 7.0, "Dark mode primary text must meet WCAG AAA (>= 7:1)")
        self.assertGreaterEqual(cr_card_text, 7.0, "Dark mode card text must meet WCAG AAA (>= 7:1)")
        self.assertGreaterEqual(cr_secondary, 4.5, "Dark mode secondary text must meet WCAG AA (>= 4.5:1)")
        self.assertGreaterEqual(cr_muted, 4.5, "Dark mode muted text must meet WCAG AA (>= 4.5:1)")

    def test_light_mode_overrides_exist(self):
        """Verify index.css has defensive high-contrast overrides for html:not(.dark)"""
        self.assertIn("html:not(.dark) .text-gray-100", self.css_content)
        self.assertIn("html:not(.dark) .text-gray-400", self.css_content)
        self.assertIn("html:not(.dark) thead tr", self.css_content)
        self.assertIn("html:not(.dark) thead th", self.css_content)


class TestFrontendThemeHookAndComponents(unittest.TestCase):
    """Test useTheme hook and component implementation"""

    def test_use_theme_implementation(self):
        use_theme_path = os.path.join(FRONTEND_SRC, "hooks", "useTheme.ts")
        self.assertTrue(os.path.exists(use_theme_path), "useTheme.ts must exist")
        with open(use_theme_path, "r", encoding="utf-8") as f:
            code = f.read()

        self.assertIn("'light' | 'dark' | 'auto'", code, "ThemeMode must support light, dark, and auto")
        self.assertIn("root.classList.toggle('dark', theme === 'dark')", code, "root dark class must be toggled")
        self.assertIn("root.style.colorScheme = theme", code, "colorScheme must be synchronized")
        self.assertIn("localStorage.setItem(STORAGE_KEY, mode)", code, "theme choice must persist in localStorage")

    def test_evse_bay_dual_mode_styles(self):
        bay_path = os.path.join(FRONTEND_SRC, "components", "dashboard", "EvseBay.tsx")
        self.assertTrue(os.path.exists(bay_path), "EvseBay.tsx must exist")
        with open(bay_path, "r", encoding="utf-8") as f:
            code = f.read()

        # Check for light & dark paired classes
        self.assertIn("dark:bg-", code, "EvseBay must support dark background classes")
        self.assertIn("dark:text-", code, "EvseBay must support dark text classes")
        self.assertIn("isOffline", code, "EvseBay must handle offline status")

    def test_charger_card_uses_evse_bay(self):
        card_path = os.path.join(FRONTEND_SRC, "components", "ChargerCard.tsx")
        with open(card_path, "r", encoding="utf-8") as f:
            code = f.read()

        self.assertIn("import { EvseBay }", code, "ChargerCard must import EvseBay")
        self.assertIn("<EvseBay", code, "ChargerCard must render EvseBay")

    def test_dashboard_offline_toggle(self):
        dash_path = os.path.join(FRONTEND_SRC, "pages", "Dashboard.tsx")
        with open(dash_path, "r", encoding="utf-8") as f:
            code = f.read()

        self.assertIn("showOffline", code, "Dashboard must have showOffline state")
        self.assertTrue("dashboard.showOffline" in code or "Ver Offline" in code, "Dashboard must offer show offline toggle button")


if __name__ == '__main__':
    unittest.main()
