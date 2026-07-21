<div align="center">
  <img src="frontend/icon.svg" width="120" alt="EdgeTTs Logo">
  <h1>EdgeTTs Novel Reader</h1>
  <p><strong>The Ultimate Offline Novel Reader & AI Text-to-Speech Listener</strong></p>
  
  [![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
  [![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
  [![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](#)
  [![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)](#)

  <p>
    <a href="#english">🇬🇧 English</a> • 
    <a href="#türkçe">🇹🇷 Türkçe</a>
  </p>
</div>

<hr>

<h2 id="english">🇬🇧 English Documentation</h2>

### 📖 What is EdgeTTs Novel Reader?
EdgeTTs is a self-hosted, highly optimized novel reader and listener built for web novel enthusiasts. It seamlessly scrapes novels from supported platforms (like NovelArrow), generates high-quality **Microsoft Edge TTS (Text-to-Speech)** audio files on the fly, and presents them in a beautiful, modern user interface.

Whether you want to read under the blankets with a sleek dark mode or listen to chapters like an audiobook while driving, EdgeTTs handles it all flawlessly!

### ✨ Key Features
- **🎧 Studio-Quality TTS:** Converts novel chapters into natural-sounding audio streams using Edge TTS. Includes precise word-level highlights (VTT subtitles) that sync perfectly with the reader.
- **📱 PWA (Progressive Web App):** Install it directly to your phone or tablet's home screen. It feels and behaves like a native mobile app!
- **📥 Selective Offline Downloads:** Going on a flight? Click the "Download Offline" button, select the exact chapters you want via checkboxes, and read them anywhere without an internet connection.
- **🕷️ Smart Anti-Bot Scraper:** Intelligently bypasses basic scraping protections and fetches missing chapters in the background while you read.
- **💾 SQLite Caching Engine:** Never fetch or generate audio for the same chapter twice. Everything is cached locally to save bandwidth and generation time.
- **🚫 Duplicate Prevention:** Safely ensures your database remains clean without duplicate book entries.

### 🚀 Quick Start (Installation)
The entire application is containerized using Docker for a seamless 1-click installation.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Lapatou/read_novel.git
   cd read_novel
   ```

2. **Run with Docker Compose:**
   ```bash
   docker compose up -d --build
   ```

3. **Access the App:**
   Open your browser and navigate to `http://localhost` (or your server's IP address).
   *To add a novel, simply paste a NovelArrow URL into the search bar!*

---

<br>

<h2 id="türkçe">🇹🇷 Türkçe Dokümantasyon</h2>

### 📖 EdgeTTs Novel Reader Nedir?
EdgeTTs, web romanı (novel) tutkunları için özel olarak geliştirilmiş, kendi sunucunuzda barındırabileceğiniz optimize edilmiş bir okuyucu ve dinleyicidir. NovelArrow gibi platformlardan kitapları çeker, yüksek kaliteli **Microsoft Edge TTS** kullanarak metinleri anında seslendirir ve size modern, akıcı bir arayüz sunar.

İster yorganın altında şık karanlık moduyla (Dark Mode) okuyun, isterseniz araba kullanırken gerçek bir sesli kitap (audiobook) gibi dinleyin; EdgeTTs her şeyi kusursuzca halleder!

### ✨ Ana Özellikler
- **🎧 Yüksek Kaliteli Seslendirme (TTS):** Edge TTS kullanarak romanları doğal insan sesine en yakın şekilde okur. Seslendirmeyle birebir senkronize olan kelime takibi (VTT altyazı) özelliği içerir.
- **📱 PWA (Mobil Uygulama) Desteği:** Telefon veya tabletinizin ana ekranına doğrudan bir uygulama olarak yükleyebilirsiniz. İnternet tarayıcısından bağımsız, gerçek bir uygulama hissiyatı verir!
- **📥 Seçmeli Çevrimdışı İndirme:** Uçağa mı biniyorsunuz? "Çevrimdışı İndir" butonuna tıklayın, listeden istediğiniz bölümleri kutucuklarla (checkbox) seçin ve internetiniz olmasa bile her yerde okuyun.
- **🕷️ Akıllı Arka Plan Kazıyıcı:** Temel korumaları aşarak siz okurken veya dinlerken, eksik olan sonraki bölümleri arka planda sessizce indirir.
- **💾 Yerel Önbellek (Cache) Sistemi:** Hiçbir bölüm iki kez indirilmez veya seslendirilmez. Her şey yerel SQLite veritabanına kaydedilir, internet kotasından ve zamandan tasarruf sağlar.
- **🚫 Çift Kayıt Engelleme:** Aynı kitabı iki kez eklemenizi önleyerek kütüphanenizi her zaman temiz ve düzenli tutar.

### 🚀 Hızlı Kurulum
Tüm uygulama Docker kullanılarak paketlenmiştir, böylece tek komutla her sistemde çalışabilir.

1. **Projeyi İndirin:**
   ```bash
   git clone https://github.com/Lapatou/read_novel.git
   cd read_novel
   ```

2. **Docker Compose ile Başlatın:**
   ```bash
   docker compose up -d --build
   ```

3. **Uygulamaya Giriş:**
   Tarayıcınızı açın ve `http://localhost` (veya sunucunuzun IP adresine) gidin.
   *Kitap eklemek için NovelArrow linkini kopyalayıp arama çubuğuna yapıştırmanız yeterlidir!*

---
<div align="center">
  <sub>Built with ❤️ for Novel Readers.</sub>
</div>
