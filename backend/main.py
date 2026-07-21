import logging
import os
import uuid
import asyncio
import sqlite3
import json
import random
import re
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup
import edge_tts
from urllib.parse import urljoin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CACHE_DIR = "tts_cache"
ACTIVE_READING_URL = None
os.makedirs(CACHE_DIR, exist_ok=True)
DB_PATH = os.path.join(CACHE_DIR, "chapters.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS chapters
                 (url TEXT PRIMARY KEY, title TEXT, paragraphs TEXT, next_url TEXT, session_id TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS books
                 (id TEXT PRIMARY KEY, title TEXT, cover_url TEXT, main_url TEXT, 
                  current_chapter_url TEXT, last_scraped_url TEXT, chapters_json TEXT,
                  downloaded_count INTEGER DEFAULT 0, total_chapters INTEGER DEFAULT 0)''')
    conn.commit()
    conn.close()

init_db()

# --- Book Endpoints ---

class BookRequest(BaseModel):
    main_url: str

class ProgressRequest(BaseModel):
    current_chapter_url: str

@app.post("/api/books")
def add_book(req: BookRequest):
    url = req.main_url
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch book page: {e}")
        
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Title extraction (support NovelArrow og meta tags and standard DOM)
    title = None
    novel_name_meta = soup.find('meta', attrs={'name': 'og:novel:novel_name'})
    og_title_meta = soup.find('meta', property='og:title')
    if novel_name_meta and novel_name_meta.get('content'):
        title = novel_name_meta.get('content')
    elif og_title_meta and og_title_meta.get('content'):
        title = og_title_meta.get('content')
        if ' | ' in title:
            title = title.split(' | ')[0].replace(' Novel', '').strip()
            
    if not title:
        title_el = soup.find('h3', class_='title') or soup.find('h1') or soup.find('h2')
        title = title_el.text.strip() if title_el else "Unknown Book"
        
    # Cover URL extraction (support NovelArrow og:image and standard DOM)
    cover_url = None
    og_image_meta = soup.find('meta', property='og:image')
    if og_image_meta and og_image_meta.get('content'):
        cover_url = og_image_meta.get('content')
    else:
        book_div = soup.find('div', class_='book')
        if book_div:
            img = book_div.find('img')
            if img:
                cover_url = img.get('data-src') or img.get('src')
            
    chapters_list = []
    seen_urls = set()
    
    # 1. Check all <a> tags for /chapter/ links (NovelArrow format)
    for a in soup.find_all('a', href=True):
        href = a['href']
        if '/chapter/' in href:
            full_url = urljoin(url, href)
            if full_url not in seen_urls:
                seen_urls.add(full_url)
                c_title = a.get_text(strip=True) or a.get('title') or "Chapter"
                chapters_list.append({"title": c_title, "url": full_url})
                
    # 2. Fallback: check old AJAX or list-chapter if no /chapter/ links found
    if not chapters_list:
        novel_id_match = re.search(r'data-novel-id="([^"]+)"', response.text)
        if not novel_id_match:
            novel_id_match = re.search(r'novelId\s*=\s*[\'"]([^\'"]+)[\'"]', response.text)
        if novel_id_match:
            novel_id = novel_id_match.group(1)
            ajax_url = f"https://novelbin.com/ajax/chapter-archive?novelId={novel_id}"
            try:
                ajax_res = requests.get(ajax_url, headers=headers, timeout=10)
                if ajax_res.status_code == 200:
                    ajax_soup = BeautifulSoup(ajax_res.text, 'html.parser')
                    for a in ajax_soup.find_all('a', href=True):
                        href = urljoin(url, a['href'])
                        if href not in seen_urls:
                            seen_urls.add(href)
                            c_title = a.get('title') or a.text.strip() or "Chapter"
                            chapters_list.append({"title": c_title, "url": href})
            except Exception as e:
                logger.error(f"Failed to fetch chapters via AJAX: {e}")
                
        if not chapters_list:
            chapter_list_ul = soup.find(id='list-chapter')
            if chapter_list_ul:
                for a in chapter_list_ul.find_all('a', href=True):
                    href = urljoin(url, a['href'])
                    if href not in seen_urls:
                        seen_urls.add(href)
                        c_title = a.get('title') or a.text.strip() or "Chapter"
                        chapters_list.append({"title": c_title, "url": href})
                        
    # Sort chapters logically by chapter number ascending so chapter 1 is at index 0
    def get_chapter_num(item):
        m = re.search(r'chapter[-_](\d+)|chapter\s*(\d+)|c(\d+)', item['url'] + " " + item['title'], re.IGNORECASE)
        if m:
            for g in m.groups():
                if g:
                    return int(g)
        return 999999
        
    if chapters_list:
        chapters_list.sort(key=get_chapter_num)
                    
    first_chapter = chapters_list[0]['url'] if chapters_list else None
    
    book_id = str(uuid.uuid4())
    chapters_json = json.dumps(chapters_list)
    total_chapters = len(chapters_list)
    
    # Check if total chapters is mentioned in meta/script tags or inferred from chapter numbers
    t_match = re.search(r'"totalChapter":(\d+)|"total_chapters":(\d+)', response.text)
    if t_match:
        for g in t_match.groups():
            if g:
                total_chapters = max(total_chapters, int(g))
    if chapters_list:
        max_num = max([get_chapter_num(ch) if get_chapter_num(ch) != 999999 else 0 for ch in chapters_list], default=0)
        total_chapters = max(total_chapters, max_num)
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""INSERT INTO books 
                 (id, title, cover_url, main_url, current_chapter_url, last_scraped_url, chapters_json, downloaded_count, total_chapters) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)""",
              (book_id, title, cover_url, url, first_chapter, first_chapter, chapters_json, total_chapters))
    conn.commit()
    conn.close()
    
    return {
        "id": book_id, 
        "title": title, 
        "cover_url": cover_url, 
        "current_chapter_url": first_chapter,
        "downloaded_count": 0,
        "total_chapters": total_chapters,
        "chapters": chapters_list
    }

@app.get("/api/books")
def get_books():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, title, cover_url, main_url, current_chapter_url, chapters_json, downloaded_count, total_chapters FROM books")
    rows = c.fetchall()
    conn.close()
    
    books = []
    for r in rows:
        books.append({
            "id": r[0], 
            "title": r[1], 
            "cover_url": r[2], 
            "main_url": r[3], 
            "current_chapter_url": r[4],
            "chapters": json.loads(r[5] if r[5] else "[]"),
            "downloaded_count": r[6],
            "total_chapters": r[7]
        })
    return books

@app.post("/api/books/{book_id}/progress")
def update_progress(book_id: str, req: ProgressRequest):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE books SET current_chapter_url=? WHERE id=?", (req.current_chapter_url, book_id))
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.post("/api/books/check-updates")
def check_updates():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, title, main_url, chapters_json, total_chapters FROM books")
    rows = c.fetchall()
    
    updated_books = 0
    new_chapters_total = 0
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
    
    for book_id, title, main_url, ch_json, total_ch in rows:
        if not main_url:
            continue
        try:
            res = requests.get(main_url, headers=headers, timeout=15)
            if res.status_code != 200:
                continue
            soup = BeautifulSoup(res.text, 'html.parser')
            
            existing_chapters = json.loads(ch_json) if ch_json else []
            existing_urls = {ch['url'] for ch in existing_chapters}
            
            new_chapters_found = []
            for a in soup.find_all('a', href=True):
                href = a['href']
                if '/chapter/' in href:
                    full_url = urljoin(main_url, href)
                    if full_url not in existing_urls:
                        existing_urls.add(full_url)
                        c_title = a.get_text(strip=True) or a.get('title') or "Chapter"
                        new_chapters_found.append({"title": c_title, "url": full_url})
            
            if new_chapters_found:
                existing_chapters.extend(new_chapters_found)
                
                def get_chapter_num(item):
                    m = re.search(r'chapter[-_](\d+)|chapter\s*(\d+)|c(\d+)', item['url'] + " " + item['title'], re.IGNORECASE)
                    if m:
                        for g in m.groups():
                            if g:
                                return int(g)
                    return 999999
                    
                existing_chapters.sort(key=get_chapter_num)
                new_total = max(total_ch or 0, len(existing_chapters))
                
                t_match = re.search(r'"totalChapter":(\d+)|"total_chapters":(\d+)', res.text)
                if t_match:
                    for g in t_match.groups():
                        if g:
                            new_total = max(new_total, int(g))
                            
                c.execute("UPDATE books SET chapters_json=?, total_chapters=? WHERE id=?", 
                          (json.dumps(existing_chapters), new_total, book_id))
                updated_books += 1
                new_chapters_total += len(new_chapters_found)
                logger.info(f"Updated book '{title}' with {len(new_chapters_found)} new chapters.")
        except Exception as e:
            logger.error(f"Error checking updates for book {book_id}: {e}")
            
    conn.commit()
    conn.close()
    return {"status": "ok", "updated_books": updated_books, "new_chapters": new_chapters_total}


def update_book_chapters_with_next_url(current_url: str, next_url: str, next_title: str = None):
    if not next_url:
        return
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT id, chapters_json, total_chapters FROM books")
        rows = c.fetchall()
        for book_id, ch_json, total_ch in rows:
            if not ch_json:
                continue
            chapters_list = json.loads(ch_json)
            current_idx = -1
            for idx, ch in enumerate(chapters_list):
                if ch['url'] == current_url:
                    current_idx = idx
                    break
            
            if current_idx != -1:
                if not any(ch['url'] == next_url for ch in chapters_list):
                    n_title = next_title or f"Chapter {len(chapters_list) + 1}"
                    chapters_list.append({"title": n_title, "url": next_url})
                    new_total = max(total_ch or 0, len(chapters_list))
                    c.execute("UPDATE books SET chapters_json=?, total_chapters=? WHERE id=?", 
                              (json.dumps(chapters_list), new_total, book_id))
                    logger.info(f"Dynamically expanded book {book_id} chapter list to {len(chapters_list)} chapters (added {next_url})")
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error updating book chapter list with next_url: {e}")


# --- Chapter & TTS Logic ---

class ChapterResponse(BaseModel):
    title: str
    paragraphs: list[str]
    next_url: str | None
    cached_session_id: str

def scrape_and_cache(url: str):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Title extraction
    title = None
    ch_name_meta = soup.find('meta', attrs={'name': 'og:novel:chapter_name'})
    og_title_meta = soup.find('meta', property='og:title')
    if ch_name_meta and ch_name_meta.get('content'):
        title = ch_name_meta.get('content')
    elif og_title_meta and og_title_meta.get('content'):
        title = og_title_meta.get('content')
        
    if not title:
        title_element = soup.select_one('.chr-title') or soup.find('h1') or soup.find('h2')
        title = title_element.get_text(strip=True) if title_element else "Unknown Chapter"
    
    # Paragraphs extraction
    paragraphs = []
    content_div = soup.select_one('#chr-content') or soup.find('div', class_='chapter-content')
    if content_div:
        for p in content_div.find_all('p'):
            text = p.get_text(strip=True)
            if text and len(text) > 1 and not text.startswith('©'):
                paragraphs.append(text)
                
    # If DOM paragraphs are missing/few (Next.js RSC architecture like NovelArrow)
    if len(paragraphs) < 3:
        p_matches = re.findall(r'\\u003cp[\s\S]*?\\u003e([\s\S]*?)\\u003c\\?/p\\u003e|<p[^>]*>([\s\S]*?)</p>', response.text)
        if p_matches:
            paragraphs = []
            for p in p_matches:
                content = p[0] or p[1]
                content = re.sub(r'\\u003c.*?\\u003e', '', content)
                content = re.sub(r'<.*?>', '', content)
                content = content.replace('\\"', '"').replace('\\n', '').replace('\\r', '').replace('\\\\', '\\').strip()
                if content and len(content) > 1 and not content.startswith('©') and not content.startswith('Chapter '):
                    paragraphs.append(content)
    
    # Next URL extraction
    next_url = None
    next_title = None
    
    # 1. Check Next.js RSC flight data (support both escaped and unescaped quotes)
    next_match = re.search(r'\\*"nextChapter\\*":\{\\*"chapter_id\\*":\\*"([^"\\]+)\\*"[^\}]*?\\*"chapter_name\\*":\\*"([^"\\]+)\\*"', response.text)
    if not next_match:
        next_match = re.search(r'\\*"nextChapter\\*":\{\\*"chapter_id\\*":\\*"([^"\\]+)\\*"', response.text)
    if next_match:
        next_id = next_match.group(1)
        if len(next_match.groups()) >= 2 and next_match.group(2):
            next_title = next_match.group(2).replace('\\"', '"').replace('\\\\', '\\')
        parts = url.rstrip('/').split('/')
        if len(parts) >= 5:
            novel_slug = parts[4]
            next_url = f"https://novelarrow.com/chapter/{novel_slug}/{next_id}"
            
    # 2. Fallback to DOM buttons/links
    if not next_url:
        next_btn = soup.select_one('#next_chap')
        if not next_btn:
            next_btn = soup.find('a', attrs={'data-chapter-nav': 'next'})
        if not next_btn:
            for a in soup.find_all('a', href=True):
                txt = a.get_text(strip=True).lower()
                if 'next chapter' in txt or 'next' == txt or '→' in txt or 'next' in a.get('id', '').lower():
                    next_btn = a
                    break
        if next_btn and next_btn.has_attr('href'):
            next_url = next_btn['href']
            next_title = next_btn.get_text(strip=True)
            
    if next_url and not next_url.startswith('http'):
        next_url = urljoin(url, next_url)
        
    session_id = str(uuid.uuid4())
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO chapters (url, title, paragraphs, next_url, session_id) VALUES (?, ?, ?, ?, ?)",
              (url, title, json.dumps(paragraphs), next_url, session_id))
    conn.commit()
    conn.close()

    # Dynamically expand book chapter list if next_url is discovered
    if next_url:
        update_book_chapters_with_next_url(url, next_url, next_title)

    return title, paragraphs, next_url, session_id

@app.get("/api/chapter", response_model=ChapterResponse)
def get_chapter(url: str, background_tasks: BackgroundTasks):
    global ACTIVE_READING_URL
    ACTIVE_READING_URL = url
    logger.info(f"Fetching chapter from {url}")
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT title, paragraphs, next_url, session_id FROM chapters WHERE url=?", (url,))
    row = c.fetchone()
    conn.close()
    
    if row:
        title, paragraphs_json, next_url, session_id = row
        audio_path = os.path.join(CACHE_DIR, f"{session_id}.mp3")
        if os.path.exists(audio_path):
            logger.info("Serving chapter from local SQLite Cache!")
            return ChapterResponse(
                title=title, 
                paragraphs=json.loads(paragraphs_json), 
                next_url=next_url, 
                cached_session_id=session_id
            )

    try:
        title, paragraphs, next_url, session_id = scrape_and_cache(url)
        # We manually fetched a chapter, let's bump the downloaded_count if it belongs to a book
        # Finding the book isn't easily mapped directly unless we parse chapters_json,
        # but the scraper worker will naturally handle this mostly.
        return ChapterResponse(title=title, paragraphs=paragraphs, next_url=next_url, cached_session_id=session_id)
    except Exception as e:
        logger.error(f"Error fetching URL: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {str(e)}")

class TTSPrepareRequest(BaseModel):
    text: str
    session_id: str
    voice: str = "en-US-AvaMultilingualNeural"

async def generate_tts_task(session_id: str, text: str, voice: str):
    audio_path = os.path.join(CACHE_DIR, f"{session_id}.mp3")
    vtt_path = os.path.join(CACHE_DIR, f"{session_id}.vtt")
    
    try:
        communicate = edge_tts.Communicate(text, voice)
        submaker = edge_tts.SubMaker()
        
        with open(audio_path, "wb") as file:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    file.write(chunk["data"])
                elif chunk["type"] in ["WordBoundary", "SentenceBoundary"]:
                    submaker.feed(chunk)

        with open(vtt_path, "w", encoding="utf-8") as file:
            file.write(submaker.get_srt())
            
        # Fix MP3 seeking headers (Xing) using ffmpeg
        import subprocess
        try:
            temp_audio = audio_path + ".temp"
            os.rename(audio_path, temp_audio)
            subprocess.run(["ffmpeg", "-y", "-i", temp_audio, "-c", "copy", audio_path], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            os.remove(temp_audio)
        except Exception as e:
            logger.error(f"FFmpeg repair failed: {e}")
            if os.path.exists(temp_audio):
                os.rename(temp_audio, audio_path)
            
        logger.info(f"Successfully generated audio and vtt for {session_id}")
    except Exception as e:
        logger.error(f"Failed generating TTS for {session_id}: {e}")
        with open(os.path.join(CACHE_DIR, f"{session_id}.error"), "w") as file:
            file.write(str(e))

@app.post("/api/tts/prepare")
def prepare_tts(req: TTSPrepareRequest, background_tasks: BackgroundTasks):
    audio_path = os.path.join(CACHE_DIR, f"{req.session_id}.mp3")
    vtt_path = os.path.join(CACHE_DIR, f"{req.session_id}.vtt")
    if os.path.exists(audio_path) and os.path.exists(vtt_path):
        return {"id": req.session_id, "cached": True}
        
    background_tasks.add_task(generate_tts_task, req.session_id, req.text, req.voice)
    return {"id": req.session_id, "cached": False}

class TTSRegenerateRequest(BaseModel):
    session_id: str

@app.post("/api/tts/regenerate")
def regenerate_tts(req: TTSRegenerateRequest):
    audio_path = os.path.join(CACHE_DIR, f"{req.session_id}.mp3")
    vtt_path = os.path.join(CACHE_DIR, f"{req.session_id}.vtt")
    error_path = os.path.join(CACHE_DIR, f"{req.session_id}.error")
    
    # Delete existing cache files
    for path in [audio_path, vtt_path, error_path]:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                logger.error(f"Failed to remove {path}: {e}")
                
    return {"success": True, "message": "Cache deleted"}

@app.get("/api/tts/status")
def get_tts_status(id: str):
    audio_path = os.path.join(CACHE_DIR, f"{id}.mp3")
    vtt_path = os.path.join(CACHE_DIR, f"{id}.vtt")
    error_path = os.path.join(CACHE_DIR, f"{id}.error")
    
    if os.path.exists(error_path):
        return {"status": "error"}
    elif os.path.exists(audio_path) and os.path.exists(vtt_path):
        return {"status": "ready"}
    else:
        return {"status": "generating"}

@app.get("/api/tts/stream")
def get_tts_stream(id: str, request: Request):
    audio_path = os.path.join(CACHE_DIR, f"{id}.mp3")
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio not found")
        
    file_size = os.path.getsize(audio_path)
    range_header = request.headers.get("Range")
    
    headers = {"Accept-Ranges": "bytes"}
    
    if not range_header:
        return FileResponse(audio_path, media_type="audio/mpeg", headers=headers)
        
    try:
        byte_range = range_header.replace("bytes=", "").split("-")
        start = int(byte_range[0])
        end = int(byte_range[1]) if len(byte_range) > 1 and byte_range[1] else file_size - 1
    except ValueError:
        return Response(status_code=400, content="Invalid Range header")
    
    length = end - start + 1
    
    def file_iterator():
        with open(audio_path, "rb") as f:
            f.seek(start)
            bytes_left = length
            while bytes_left > 0:
                chunk_size = min(65536, bytes_left)
                data = f.read(chunk_size)
                if not data:
                    break
                bytes_left -= len(data)
                yield data
                
    headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    headers["Content-Length"] = str(length)
    headers["Content-Type"] = "audio/mpeg"
    
    from fastapi.responses import StreamingResponse
    return StreamingResponse(file_iterator(), status_code=206, headers=headers)

@app.get("/api/tts/vtt")
def get_tts_vtt(id: str):
    vtt_path = os.path.join(CACHE_DIR, f"{id}.vtt")
    if not os.path.exists(vtt_path):
        raise HTTPException(status_code=404, detail="VTT not found")
    return FileResponse(vtt_path, media_type="text/vtt")

# --- Background Scraper Loop ---

async def background_scraper_loop():
    global ACTIVE_READING_URL
    logger.info("Background Scraper Loop Started.")
    while True:
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("SELECT id, chapters_json FROM books")
            books = c.fetchall()
            conn.close()
            
            # Sort books to prioritize the one currently being read
            active_book_id = None
            if ACTIVE_READING_URL:
                for book_id, chapters_json_str in books:
                    if chapters_json_str and ACTIVE_READING_URL in chapters_json_str:
                        active_book_id = book_id
                        break
            
            if active_book_id:
                books.sort(key=lambda b: 0 if b[0] == active_book_id else 1)
            
            scraped_something = False
            
            for book_id, chapters_json_str in books:
                if not chapters_json_str:
                    continue
                    
                chapters_list = json.loads(chapters_json_str)
                if not chapters_list:
                    continue
                
                conn = sqlite3.connect(DB_PATH)
                c = conn.cursor()
                c.execute("SELECT url, session_id FROM chapters")
                cached_db = {row[0]: row[1] for row in c.fetchall()}
                
                actual_downloaded_count = 0
                missing_chapters = []
                
                for i, ch in enumerate(chapters_list):
                    url = ch['url']
                    session_id = cached_db.get(url)
                    
                    is_cached = False
                    if session_id:
                        audio_path = os.path.join(CACHE_DIR, f"{session_id}.mp3")
                        vtt_path = os.path.join(CACHE_DIR, f"{session_id}.vtt")
                        if os.path.exists(audio_path) and os.path.exists(vtt_path):
                            is_cached = True
                            
                    if is_cached:
                        actual_downloaded_count += 1
                    else:
                        missing_chapters.append((i, url))
                
                # Update downloaded count in DB
                c.execute("UPDATE books SET downloaded_count=? WHERE id=?", (actual_downloaded_count, book_id))
                conn.commit()
                conn.close()
                
                target_url = None
                if missing_chapters:
                    active_index = -1
                    if ACTIVE_READING_URL and book_id == active_book_id:
                        for idx, ch in enumerate(chapters_list):
                            if ch['url'] == ACTIVE_READING_URL:
                                active_index = idx
                                break
                    
                    if active_index != -1:
                        # Find first missing chapter after active_index
                        for idx, url in missing_chapters:
                            if idx > active_index:
                                target_url = url
                                break
                        # If none, just pick the first one
                        if not target_url:
                            target_url = missing_chapters[0][1]
                    else:
                        target_url = missing_chapters[0][1]
                        
                if target_url:
                    logger.info(f"[Scraper Worker] Scraping new missing chapter: {target_url}")
                    try:
                        title, paragraphs, n_url, s_id = scrape_and_cache(target_url)
                        full_text = "\n\n".join(paragraphs)
                        
                        await generate_tts_task(s_id, full_text, "en-US-AvaMultilingualNeural")
                        
                        scraped_something = True
                        logger.info(f"[Scraper Worker] Successfully scraped and cached: {title}")
                        
                        # Update downloaded count directly
                        conn = sqlite3.connect(DB_PATH)
                        c = conn.cursor()
                        c.execute("UPDATE books SET downloaded_count = downloaded_count + 1 WHERE id=?", (book_id,))
                        conn.commit()
                        conn.close()
                        
                        import random
                        delay = random.randint(30, 60)
                        logger.info(f"[Scraper Worker] Sleeping for {delay}s...")
                        await asyncio.sleep(delay)
                    except Exception as ex:
                        logger.error(f"[Scraper Worker] Failed to scrape {target_url}: {ex}")
                
            if not scraped_something:
                await asyncio.sleep(15)
                
        except Exception as e:
            logger.error(f"[Scraper Worker] Error in loop: {e}")
            await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(background_scraper_loop())

# Mount the cache files for robust HTTP 206 Range requests (Seeking)
app.mount("/cache", StaticFiles(directory=CACHE_DIR), name="cache")
# Mount the static files
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
