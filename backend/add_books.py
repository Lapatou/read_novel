import requests

books = [
    "https://novelarrow.com/novel/killed-me-now-i-have-your-power",
    "https://novelarrow.com/novel/cultivation-online-novel"
]

for url in books:
    res = requests.post("http://127.0.0.1:8000/api/books", json={"main_url": url})
    print(res.status_code, res.text)
