from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'push-operator-feed.py'
SPEC = importlib.util.spec_from_file_location('push_operator_feed', SCRIPT_PATH)
push_operator_feed = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(push_operator_feed)


class OperatorFeedMarketDataTests(unittest.TestCase):
    def test_stock_snapshots_accept_wrapped_payload(self) -> None:
        payload = {'snapshots': {'AAPL': {'latestTrade': {'p': 200.0}}}}

        snapshots = push_operator_feed.normalize_stock_snapshots(payload, ['AAPL'])

        self.assertEqual(snapshots, {'AAPL': {'latestTrade': {'p': 200.0}}})

    def test_stock_snapshots_accept_direct_symbol_payload(self) -> None:
        payload = {
            'AAPL': {'latestTrade': {'p': 200.0}},
            'NVDA': {'latestTrade': {'p': 950.0}},
            'message': 'ignored metadata',
        }

        snapshots = push_operator_feed.normalize_stock_snapshots(payload, ['AAPL', 'NVDA'])

        self.assertEqual(set(snapshots), {'AAPL', 'NVDA'})

    def test_stock_fetches_pin_configured_market_data_feed(self) -> None:
        calls: list[dict] = []

        def fake_request(creds, path, *, params=None):
            calls.append({'path': path, 'params': params or {}})
            if path == '/v2/stocks/snapshots':
                return {'AAPL': {'latestTrade': {'p': 200.0}}}
            return {'bars': {'AAPL': [{'c': 100.0}, {'c': 105.0}]}}

        with patch.object(push_operator_feed, 'alpaca_data_request', side_effect=fake_request):
            push_operator_feed.fetch_stock_snapshots(['AAPL'], {'key': 'unused'})
            push_operator_feed.fetch_stock_return_20d_map(['AAPL'], {'key': 'unused'})

        self.assertEqual(calls[0]['params'].get('feed'), push_operator_feed.ALPACA_STOCK_DATA_FEED)
        self.assertEqual(calls[1]['params'].get('feed'), push_operator_feed.ALPACA_STOCK_DATA_FEED)


if __name__ == '__main__':
    unittest.main()
