import unittest

from fastapi.testclient import TestClient

from app import main


HTML = """
<html>
  <body>
    <a href="/notice/1.html">宁夏煤业聚丙烯酰胺采购询价公告</a>
  </body>
</html>
"""


class CollectorApiTests(unittest.TestCase):
    def setUp(self):
        self.original_fetch_text = main.fetch_text
        self.client = TestClient(main.app)

    def tearDown(self):
        main.fetch_text = self.original_fetch_text

    def test_health_endpoint(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ok"], True)

    def test_collect_url_returns_candidate_bundle(self):
        async def fake_fetch_text(url):
            self.assertEqual(url, "https://example.com/list.html")
            return HTML

        main.fetch_text = fake_fetch_text

        response = self.client.post(
            "/collect/url",
            json={
                "url": "https://example.com/list.html",
                "source_name": "国能网",
                "owner_name": "小杨",
                "mode": "http_html",
            },
        )

        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["status"], "success")
        self.assertEqual(body["source_name"], "国能网")
        self.assertEqual(len(body["candidates"]), 1)
        self.assertIn("聚丙烯酰胺", body["candidates"][0]["title"])

    def test_collect_source_returns_structured_error(self):
        async def fake_fetch_text(_url):
            raise RuntimeError("blocked by upstream")

        main.fetch_text = fake_fetch_text

        response = self.client.post(
            "/collect/source",
            json={
                "source": {
                    "id": "src1",
                    "source_name": "测试源",
                    "owner_name": "小白",
                    "source_url": "https://example.com/list.html",
                },
                "mode": "http_html",
            },
        )

        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["status"], "failed")
        self.assertEqual(body["candidates"], [])
        self.assertIn("blocked by upstream", body["error"])


if __name__ == "__main__":
    unittest.main()
