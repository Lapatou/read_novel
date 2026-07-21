import sqlite3
import os

def check():
    db_path = os.path.join('tts_cache', 'chapters.db')
    print(f"Checking {db_path}...")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    books = c.execute('SELECT id, title, cover_url, total_chapters, downloaded_count FROM books;').fetchall()
    print("=== BOOKS ===")
    for b in books:
        print(f"ID: {b[0]} | Title: {b[1]} | Cover: {b[2]} | Total Ch: {b[3]} | Downloaded: {b[4]}")
        
    ch_count = c.execute('SELECT count(*) FROM chapters;').fetchone()[0]
    print(f"\nTotal Cached Chapters: {ch_count}")
    
    # Let's print the last 3 cached chapters
    recent_ch = c.execute('SELECT title, url, next_url FROM chapters LIMIT 3;').fetchall()
    print("\n=== RECENT CHAPTERS ===")
    for ch in recent_ch:
        print(f"Title: {ch[0]} | URL: {ch[1]} | Next: {ch[2]}")
        
    conn.close()

if __name__ == '__main__':
    check()
