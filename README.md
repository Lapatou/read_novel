# EdgeTTS Novel Reader

EdgeTTS Novel Reader is a lightweight, responsive web application that scrapes novels from NovelArrow/NovelBin and converts them to high-quality Text-to-Speech (TTS) using Microsoft Edge's TTS API.

## 🚀 Features
- **PWA & Offline Support**: Install the app on your phone or tablet and read chapters offline.
- **High-Quality TTS**: Uses Microsoft Edge's neural voices.
- **Synchronized Highlighting**: Highlights words as they are spoken.
- **Background Scraping**: Automatically fetches new chapters in the background.

## 🛠️ Architecture
- **Frontend**: Vanilla HTML/JS/CSS (Progressive Web App).
- **Backend**: Python (FastAPI).
- **Scraper**: BeautifulSoup4 & Cloudscraper.
- **Database**: SQLite (Local Caching & Library).

## 📦 Installation
1. Clone this repository.
2. Run `docker compose up -d --build`.
3. Access the app at `http://localhost:8000`.

## ⚙️ Configuration
Audio settings like voice selection, speed, and pitch can be adjusted in the application settings menu.
