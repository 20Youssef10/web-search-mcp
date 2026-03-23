# 🌐 web-search-mcp-server

**MCP Server** يمنح الـ LLMs القدرة على البحث في الويب عبر **20 أداة** تدعم Google, Bing, DuckDuckGo, Yahoo, Yandex, Baidu.

مبني بـ TypeScript وقابل للنشر على **Vercel** أو تشغيله محلياً مع **Claude Desktop**.

---

## 🚀 النشر على Vercel

### الطريقة الأسرع: Vercel CLI

```bash
npm install
npm i -g vercel
vercel login
vercel --prod
```

### من GitHub Dashboard
1. ادفع الكود لـ GitHub
2. من vercel.com → **Add New Project** → اختر الـ repo
3. أضف Environment Variables (جدول أدناه)
4. اضغط **Deploy**

### متغيرات البيئة المطلوبة على Vercel

| المتغير | القيمة | مطلوب؟ |
|---------|--------|--------|
| `SERPAPI_API_KEY` | مفتاح من [serpapi.com](https://serpapi.com) | ✅ لـ 19 أداة |
| `MCP_API_KEY` | مفتاح سري تختاره (للحماية) | ✅ موصى |

```bash
# توليد MCP_API_KEY:
openssl rand -hex 32
```

### اختبار بعد النشر

```bash
# Health check
curl https://your-project.vercel.app/health

# اختبار بحث Google
curl -X POST https://your-project.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":"google_search","arguments":{"query":"Claude AI","num":5}}}'
```

---

## 🔗 الاتصال من Claude Desktop (Remote MCP)

```bash
npm install -g mcp-remote
```

`claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "web-search": {
      "command": "mcp-remote",
      "args": [
        "https://your-project.vercel.app/mcp",
        "--header", "Authorization: Bearer YOUR_MCP_API_KEY"
      ]
    }
  }
}
```

---

## 🖥️ التشغيل المحلي (stdio)

```bash
npm install && npm run build
```

`claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "web-search": {
      "command": "node",
      "args": ["/path/to/web-search-mcp-server/dist/src/index.js"],
      "env": { "SERPAPI_API_KEY": "your_key" }
    }
  }
}
```

---

## 🛠️ الأدوات الـ 20

### Google (10)
`google_search` · `google_ai_search` · `google_images_search` · `google_news_search` · `google_scholar_search` · `google_videos_search` · `google_finance_search` · `google_jobs_search` · `google_patents_search` · `google_maps_search`

### Bing (4)
`bing_search` · `bing_images_search` · `bing_news_search` · `bing_videos_search`

### DuckDuckGo (2)
`duckduckgo_instant_answer` (مجاني — بدون API key) · `duckduckgo_search`

### أخرى (4)
`yahoo_search` · `yandex_search` · `baidu_search` · `multi_engine_search`

---

## 📋 المعاملات المشتركة

| المعامل | الافتراضي | الوصف |
|---------|-----------|-------|
| `num` | 10 | عدد النتائج |
| `lang` | `"en"` | اللغة (`"ar"`, `"en"`) |
| `country` | `"us"` | الدولة (`"eg"`, `"sa"`) |
| `date_range` | — | `"d"` `"w"` `"m"` `"y"` |
| `response_format` | `"markdown"` | `"markdown"` أو `"json"` |

---

## 💰 SerpAPI: 100 بحث مجاني/شهر · serpapi.com
