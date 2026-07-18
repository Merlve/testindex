import urllib.request
import re

url = "https://html.duckduckgo.com/html/?q=mpv-android+intent+link+action.VIEW"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')

results = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.DOTALL | re.IGNORECASE)
for i, res in enumerate(results[:5]):
    print(res.replace("<b>", "").replace("</b>", "").strip())
