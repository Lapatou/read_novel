import requests
import re
from bs4 import BeautifulSoup

url = 'https://novelarrow.com/chapter/power-of-runes/chapter-2-2-ambition'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}
response = requests.get(url, headers=headers, timeout=10)
print("STATUS:", response.status_code)
print("LEN:", len(response.text))

soup = BeautifulSoup(response.text, 'html.parser')

paragraphs = []
content_div = soup.select_one('#chr-content') or soup.find('div', class_='chapter-content')
if content_div:
    for p in content_div.find_all('p'):
        text = p.get_text(strip=True)
        if text and len(text) > 1 and not text.startswith('©'):
            paragraphs.append(text)

print("PARAGRAPHS FROM DOM:", len(paragraphs))
if len(paragraphs) < 3:
    p_matches = re.findall(r'\\u003cp[\s\S]*?\\u003e([\s\S]*?)\\u003c\\?/p\\u003e|<p[^>]*>([\s\S]*?)</p>', response.text)
    print("p_matches count:", len(p_matches) if p_matches else 0)
    if p_matches:
        paragraphs = []
        for p in p_matches:
            content = p[0] or p[1]
            content = re.sub(r'\\u003c.*?\\u003e', '', content)
            content = re.sub(r'<.*?>', '', content)
            content = content.replace('\\"', '"').replace('\\n', '').replace('\\r', '').replace('\\\\', '\\').strip()
            if content and len(content) > 1 and not content.startswith('©') and not content.startswith('Chapter '):
                paragraphs.append(content)

print("FINAL COUNT:", len(paragraphs))
if len(paragraphs) > 0:
    print("FIRST TWO:", paragraphs[:2])
