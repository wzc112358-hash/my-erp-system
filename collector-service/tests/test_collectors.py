import unittest

from app.collectors import collect_from_html, collect_from_json_text, urls_for_source


HTML = """
<html>
  <body>
    <a href="/notice/1.html">平庄煤业供应公司2026年二水氯化钙、抑尘剂公开招标项目招标公告</a>
    <a href="/notice/2.html">榆林化工环储厂2026年偏铝酸钠采购公开招标项目招标公告</a>
    <a href="/about.html">公司简介</a>
  </body>
</html>
"""

CHNENERGY_HTML = """
<ul class="right-items">
  <li class="right-item clearfix">
    <div class="r-block l">
      <a href="/bidweb/001/001002/001002001/20260527/abc.html" class="infolink" title="榆林化工聚丙烯酰胺采购公开招标项目招标公告" target="_blank">
        榆林化工聚丙烯酰胺采购公开招标项目招标公告
      </a>
    </div>
    <span class="r">2026-05-27</span>
  </li>
  <li class="right-item clearfix">
    <div class="r-block l">
      <a href="/bidweb/001/001006/moreinfo.html" class="left-link">中标公告</a>
    </div>
  </li>
</ul>
"""

SINOPEC_HTML = """
<div id="middle">
  <a href="/f/supp/notice/bidNotice.do?id=AAA" title="石家庄炼化分公司化工部分其他建筑用五金产品采购公告" target="_blank">查看</a>
  <a href="/f/supp/notice/bidNotice.do?id=BBB" title="中压旋塞阀【利安德2302550652需求】公开询比采购公告" target="_blank">查看</a>
  <a href="/f/supp/notice/bidNotice.do?id=CCC" title="中原石油工程2026-2027年度框架协议橡胶板评标结果公示" target="_blank">查看</a>
  <a href="/f/supp/notice/viewNotice.do?id=DDD" title="关于2025年1-3月供应商处理的通知" target="_blank">查看</a>
  <a href="http://www.sinopecgroup.com/" target="_blank">中国石化集团公司网站</a>
</div>
"""

NEEP_JSON = """
{
  "respCode": "0000",
  "messages": "success",
  "title": "询价采购公告",
  "rows": [
    {
      "title": "煤制油公司化工三剂2026年亚硫酸氢钠询价采购",
      "link": "https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/article/inquireOne/10166184.html",
      "publishTime": "2026-05-27 18:18:05",
      "quotDeadline": "2026-05-31 11:00:00",
      "publishArea": "化工中心"
    }
  ]
}
"""


class CollectorTests(unittest.TestCase):
    def test_urls_for_source_prefers_category_urls(self):
        source = {
            "source_url": "https://example.com/root",
            "category_urls": "https://example.com/a, https://example.com/b\nhttps://example.com/c",
        }

        self.assertEqual(
            urls_for_source(source),
            ["https://example.com/a", "https://example.com/b", "https://example.com/c"],
        )

    def test_urls_for_source_falls_back_to_source_url(self):
        self.assertEqual(
            urls_for_source({"source_url": "https://example.com/root", "category_urls": ""}),
            ["https://example.com/root"],
        )

    def test_collect_from_html_returns_candidate_bundle_shape(self):
        bundle = collect_from_html(
            source={
                "source_id": "src-guoneng",
                "source_name": "国能网",
                "owner_name": "小杨",
                "source_url": "https://example.com/list.html",
            },
            url="https://example.com/list.html",
            html=HTML,
            mode="http_html",
        )

        self.assertEqual(bundle["source_name"], "国能网")
        self.assertEqual(bundle["owner_name"], "小杨")
        self.assertEqual(bundle["mode"], "http_html")
        self.assertEqual(bundle["status"], "success")
        self.assertEqual(len(bundle["candidates"]), 2)
        self.assertEqual(bundle["candidates"][0]["url"], "https://example.com/notice/1.html")
        self.assertIn("二水氯化钙", bundle["candidates"][0]["title"])
        self.assertEqual(bundle["candidates"][0]["extraction_confidence"], 0.72)

    def test_collect_from_html_returns_no_new_for_empty_notice_page(self):
        bundle = collect_from_html(
            source={"source_name": "裕龙招投标网", "owner_name": "小白"},
            url="https://example.com/list.html",
            html="<a href='/about.html'>平台介绍</a>",
            mode="http_html",
        )

        self.assertEqual(bundle["status"], "no_new")
        self.assertEqual(bundle["candidates"], [])

    def test_collect_from_html_uses_chnenergy_list_adapter(self):
        bundle = collect_from_html(
            source={"source_name": "国能E招", "owner_name": "小杨"},
            url="https://www.chnenergybidding.com.cn/bidweb/001/001002/moreinfo.html",
            html=CHNENERGY_HTML,
            mode="http_html",
        )

        self.assertEqual(bundle["status"], "success")
        self.assertEqual(len(bundle["candidates"]), 1)
        self.assertEqual(bundle["candidates"][0]["published_at"], "2026-05-27")
        self.assertIn("聚丙烯酰胺", bundle["candidates"][0]["title"])
        self.assertNotIn("中标公告", [item["title"] for item in bundle["candidates"]])

    def test_collect_from_html_uses_sinopec_list_adapter(self):
        bundle = collect_from_html(
            source={"source_name": "易派克", "owner_name": "小冯"},
            url="https://ec.sinopec.com/supp/index.shtml",
            html=SINOPEC_HTML,
            mode="http_html",
        )

        titles = [item["title"] for item in bundle["candidates"]]
        self.assertEqual(bundle["status"], "success")
        # 两条可投标公告保留，结果公示与"通知"被过滤，集团官网外链被过滤。
        self.assertEqual(len(bundle["candidates"]), 2)
        self.assertIn("其他建筑用五金产品采购公告", titles[0])
        self.assertTrue(any("公开询比采购公告" in title for title in titles))
        self.assertFalse(any("评标结果公示" in title for title in titles))
        self.assertFalse(any("供应商处理的通知" in title for title in titles))
        self.assertEqual(
            bundle["candidates"][0]["url"],
            "https://ec.sinopec.com/f/supp/notice/bidNotice.do?id=AAA",
        )
        self.assertEqual(bundle["candidates"][0]["extraction_confidence"], 0.84)

    def test_collect_from_json_text_extracts_neep_rows(self):
        bundle = collect_from_json_text(
            source={"source_name": "国能E购", "owner_name": "小杨"},
            url="https://gd-prod.cn-beijing.oss.aliyuncs.com/upload/cms/column/inquireOne/index.json",
            text=NEEP_JSON,
            mode="http_json",
        )

        self.assertEqual(bundle["status"], "success")
        self.assertEqual(len(bundle["candidates"]), 1)
        self.assertIn("亚硫酸氢钠", bundle["candidates"][0]["title"])
        self.assertEqual(bundle["candidates"][0]["published_at"], "2026-05-27")
        self.assertEqual(bundle["candidates"][0]["deadline_at"], "2026-05-31")
        self.assertEqual(bundle["candidates"][0]["buyer_name"], "化工中心")


if __name__ == "__main__":
    unittest.main()
