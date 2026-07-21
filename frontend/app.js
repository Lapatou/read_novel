let currentSessionId = null;
let currentAudio = null;
let subtitleCues = [];
let wordElements = [];
let activeBookId = null;
let booksData = [];
let pollingInterval = null;

// --- View Management ---

const homeView = document.getElementById('home-view');
const detailsView = document.getElementById('book-details-view');
const readerView = document.getElementById('reader-view');

function showHomeView() {
    detailsView.classList.add('hidden');
    readerView.classList.add('hidden');
    homeView.classList.remove('hidden');
    
    if (currentAudio) {
        currentAudio.pause();
    }
    
    loadBooks();
    startPolling();
}

function showDetailsView(bookId) {
    stopPolling();
    const book = booksData.find(b => b.id === bookId);
    if (!book) return;
    
    activeBookId = bookId;
    
    homeView.classList.add('hidden');
    readerView.classList.add('hidden');
    detailsView.classList.remove('hidden');
    
    document.getElementById('details-title').innerText = book.title;
    
    const progressText = document.getElementById('details-progress');
    progressText.innerText = `Downloaded: ${book.downloaded_count} / ${book.total_chapters} Chapters`;
    
    const chapterList = document.getElementById('chapter-list');
    chapterList.innerHTML = '';
    
    const isOfflineMode = document.getElementById('offline-actions') && !document.getElementById('offline-actions').classList.contains('hidden');

    book.chapters.forEach((ch, index) => {
        const li = document.createElement('li');
        li.className = 'chapter-item';
        
        // Base layout for all items to properly align icons and text
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '10px';
        
        const label = document.createElement('span');
        label.innerText = `${index + 1}. ${ch.title}`;
        label.style.flex = '1';
        label.style.cursor = 'pointer';

        let actionEl = null;

        if (ch.downloaded) {
            // Show green checkmark for downloaded chapters
            actionEl = document.createElement('div');
            actionEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px; display: block;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
            actionEl.title = "Çevrimdışı Hazır";
        } else if (isOfflineMode) {
            // Show custom styled checkbox ONLY in offline mode if not downloaded
            actionEl = document.createElement('label');
            actionEl.className = 'custom-checkbox-wrapper';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'offline-checkbox';
            checkbox.dataset.url = ch.url;
            
            const bg = document.createElement('div');
            bg.className = 'custom-checkbox-bg';
            bg.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            
            actionEl.appendChild(checkbox);
            actionEl.appendChild(bg);
            
            actionEl.checkboxInput = checkbox;
        }
        
        if (actionEl) {
            li.appendChild(actionEl);
        }
        li.appendChild(label);
        
        if (isOfflineMode) {
            // In selection mode, clicking the row toggles the checkbox
            if (actionEl && actionEl.checkboxInput) {
                li.addEventListener('click', (e) => {
                    if (!actionEl.contains(e.target)) {
                        actionEl.checkboxInput.checked = !actionEl.checkboxInput.checked;
                    }
                });
            }
        } else {
            // In reading mode, clicking opens the reader
            if (book.current_chapter_url === ch.url) {
                li.classList.add('active');
            }
            li.addEventListener('click', () => {
                showReaderView(bookId, ch.url);
            });
        }
        
        chapterList.appendChild(li);
    });
    
    const continueBtn = document.getElementById('continue-reading-btn');
    continueBtn.onclick = () => {
        showReaderView(bookId, book.current_chapter_url || book.chapters[0].url);
    };
    
    // Scroll active item into view if it exists
    setTimeout(() => {
        const activeItem = document.querySelector('.chapter-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

function showReaderView(bookId, chapterUrl) {
    stopPolling();
    activeBookId = bookId;
    homeView.classList.add('hidden');
    detailsView.classList.add('hidden');
    readerView.classList.remove('hidden');
    
    if (chapterUrl) {
        // Update local progress immediately
        const book = booksData.find(b => b.id === bookId);
        if (book) {
            book.current_chapter_url = chapterUrl;
            // Update backend
            fetch(`/api/books/${bookId}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_chapter_url: chapterUrl })
            });
        }
        
        loadChapter(chapterUrl);
    }
}

// --- Polling Logic ---

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        if (!homeView.classList.contains('hidden')) {
            loadBooks(true); // silent reload
        }
    }, 10000); // Check every 10 seconds
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// --- Home View Logic ---

async function loadBooks(silent = false) {
    const grid = document.getElementById('book-grid');
    if (!silent) grid.innerHTML = '<div class="loading-spinner"></div>';
    
    try {
        const res = await fetch('/api/books');
        booksData = await res.json();
        
        if (booksData.length === 0) {
            grid.innerHTML = '<p style="color:var(--text-muted)">No books added yet.</p>';
            return;
        }
        
        // Preserve scroll position
        const scrollPos = silent ? grid.scrollTop : 0;
        
        // Smart update during silent polling: update stats in place without destroying DOM and img tags
        if (silent && grid.children.length === booksData.length) {
            booksData.forEach((book, idx) => {
                const card = grid.children[idx];
                const progressPercent = book.total_chapters > 0 
                    ? (book.downloaded_count / book.total_chapters) * 100 
                    : 0;
                const statsDiv = card.querySelector('.book-stats');
                if (statsDiv) {
                    statsDiv.innerHTML = `
                        <span>${book.downloaded_count}/${book.total_chapters}</span>
                        <span>${Math.round(progressPercent)}%</span>
                    `;
                }
                const progressBar = card.querySelector('.progress-bar');
                if (progressBar) {
                    progressBar.style.width = `${progressPercent}%`;
                }
            });
            return;
        }
        
        grid.innerHTML = '';
        booksData.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card';
            
            const progressPercent = book.total_chapters > 0 
                ? (book.downloaded_count / book.total_chapters) * 100 
                : 0;
                
            const fallbackSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='200'><rect width='100%' height='100%' fill='%232a2a2a'/><text x='50%' y='50%' fill='%23888' font-family='sans-serif' font-size='14' text-anchor='middle' dominant-baseline='middle'>No Cover</text></svg>";
                
            card.innerHTML = `
                <img src="${book.cover_url || fallbackSvg}" alt="Cover" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${fallbackSvg}'">
                <div class="book-title">${book.title}</div>
                <div style="padding: 0 10px 10px 10px;">
                    <div class="book-stats" style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
                        <span>${book.downloaded_count}/${book.total_chapters}</span>
                        <span>${Math.round(progressPercent)}%</span>
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${progressPercent}%"></div>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => {
                showDetailsView(book.id);
            });
            grid.appendChild(card);
        });
        
        if (silent) {
            grid.scrollTop = scrollPos;
        }
    } catch (e) {
        if (!silent) grid.innerHTML = '<p style="color:var(--danger)">Error loading books.</p>';
    }
}

document.getElementById('add-book-btn').addEventListener('click', async () => {
    const url = document.getElementById('book-url-input').value.trim();
    if (!url) return;
    
    const btn = document.getElementById('add-book-btn');
    const errorMsg = document.getElementById('book-error-message');
    
    btn.disabled = true;
    btn.innerText = 'Adding (Fetching Chapters)...';
    errorMsg.classList.add('hidden');
    
    try {
        const res = await fetch('/api/books', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ main_url: url })
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || 'Failed to add book');
        }
        
        document.getElementById('book-url-input').value = '';
        await loadBooks();
    } catch (e) {
        errorMsg.innerText = e.message;
        errorMsg.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Add Book';
    }
});

// Initial load
loadBooks();
startPolling();


// --- Reader View Logic ---

const playPauseBtn = document.getElementById('play-pause-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const rewindBtn = document.getElementById('rewind-btn');
const forwardBtn = document.getElementById('forward-btn');
const audioProgress = document.getElementById('audio-progress');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');

const statusText = document.getElementById('status-text');
const spinner = document.getElementById('spinner');

const chapterTitle = document.getElementById('chapter-title');
const chapterContent = document.getElementById('chapter-content');

let prevChapterUrl = null;
let nextChapterUrl = null;

function setStatus(text, isLoading) {
    statusText.innerText = text;
    if (isLoading) spinner.classList.remove('hidden');
    else spinner.classList.add('hidden');
}

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

prevBtn.addEventListener('click', () => {
    if (prevChapterUrl) {
        if (activeBookId) {
            fetch(`/api/books/${activeBookId}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_chapter_url: prevChapterUrl })
            });
            const book = booksData.find(b => b.id === activeBookId);
            if (book) book.current_chapter_url = prevChapterUrl;
        }
        loadChapter(prevChapterUrl);
    }
});

nextBtn.addEventListener('click', () => {
    if (nextChapterUrl) {
        // Update progress in background
        if (activeBookId) {
            fetch(`/api/books/${activeBookId}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_chapter_url: nextChapterUrl })
            });
            
            // Also update local data
            const book = booksData.find(b => b.id === activeBookId);
            if (book) book.current_chapter_url = nextChapterUrl;
        }
        
        loadChapter(nextChapterUrl);
    }
});

audioProgress.addEventListener('input', (e) => {
    if (currentAudio) {
        currentAudio.currentTime = e.target.value;
    }
});

rewindBtn.addEventListener('click', () => {
    if (currentAudio) {
        currentAudio.currentTime = Math.max(0, currentAudio.currentTime - 10);
    }
});

forwardBtn.addEventListener('click', () => {
    if (currentAudio) {
        let maxTime = currentAudio.duration;
        if (isNaN(maxTime) || !isFinite(maxTime)) {
            maxTime = currentAudio.currentTime + 10;
        }
        currentAudio.currentTime = Math.min(maxTime, currentAudio.currentTime + 10);
    }
});

async function loadChapter(url) {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    
    playPauseBtn.disabled = true;
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    rewindBtn.disabled = true;
    forwardBtn.disabled = true;
    audioProgress.disabled = true;
    audioProgress.value = 0;
    timeCurrent.innerText = "0:00";
    timeTotal.innerText = "0:00";
    
    subtitleCues = [];
    wordElements = [];
    lastActiveCueIndex = -1;
    document.getElementById('error-message').classList.add('hidden');
    
    setStatus("Scraping chapter...", true);
    
    try {
        const res = await fetch(`/api/chapter?url=${encodeURIComponent(url)}`);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Failed to fetch chapter");
        }
        const data = await res.json();
        
        chapterTitle.innerText = data.title;
        chapterContent.innerHTML = "";
        
        // Determine Next and Prev URLs from frontend cache
        prevChapterUrl = null;
        nextChapterUrl = data.next_url; // fallback to backend
        
        if (activeBookId) {
            const book = booksData.find(b => b.id === activeBookId);
            if (book && book.chapters) {
                const currentIndex = book.chapters.findIndex(c => c.url === url);
                if (currentIndex > 0) {
                    prevChapterUrl = book.chapters[currentIndex - 1].url;
                }
                if (currentIndex !== -1 && currentIndex < book.chapters.length - 1) {
                    nextChapterUrl = book.chapters[currentIndex + 1].url;
                }
            }
        }
        
        // Store url in dataset for regeneration
        chapterTitle.dataset.url = url;
        
        prevBtn.disabled = !prevChapterUrl;
        nextBtn.disabled = !nextChapterUrl;
        
        let fullText = "";
        
        // Render text with spans for highlighting
        data.paragraphs.forEach(p => {
            if (!p.trim()) return;
            const pEl = document.createElement('p');
            
            const words = p.split(/(\s+)/);
            words.forEach(w => {
                if (w.trim().length > 0) {
                    const span = document.createElement('span');
                    span.className = 'word';
                    span.innerText = w;
                    pEl.appendChild(span);
                    wordElements.push(span);
                    fullText += w;
                } else {
                    pEl.appendChild(document.createTextNode(w));
                    fullText += w;
                }
            });
            fullText += "\n\n";
            chapterContent.appendChild(pEl);
        });
        
        await startTTS(fullText, data.cached_session_id);
        
    } catch(e) {
        setStatus("Error", false);
        const errDiv = document.getElementById('error-message');
        errDiv.innerText = e.message;
        errDiv.classList.remove('hidden');
    }
}

async function startTTS(text, cachedSessionId) {
    setStatus("Preparing TTS audio...", true);
    try {
        const res = await fetch('/api/tts/prepare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, session_id: cachedSessionId })
        });
        
        const data = await res.json();
        currentSessionId = data.id;
        
        if (data.cached) {
            setStatus("Loaded from cache!", false);
        } else {
            // Poll for status
            let ready = false;
            while (!ready) {
                await new Promise(r => setTimeout(r, 2000));
                const statRes = await fetch(`/api/tts/status?id=${currentSessionId}`);
                const statData = await statRes.json();
                
                if (statData.status === 'error') {
                    throw new Error("TTS generation failed on server");
                } else if (statData.status === 'ready') {
                    ready = true;
                } else {
                    setStatus("Generating audio... (This may take a while)", true);
                }
            }
            setStatus("Ready", false);
        }
        
        // Fetch VTT
        const vttRes = await fetch(`/api/tts/vtt?id=${currentSessionId}`);
        const vttText = await vttRes.text();
        parseVTT(vttText);
        alignCuesToDOM();
        
        // Load Audio using custom streaming endpoint
        const audioUrl = `/api/tts/stream?id=${currentSessionId}`;
        currentAudio = new Audio(audioUrl);
        currentAudio.playbackRate = parseFloat(document.getElementById('speed-select').value);
        
        currentAudio.addEventListener('loadedmetadata', () => {
            audioProgress.max = currentAudio.duration;
            timeTotal.innerText = formatTime(currentAudio.duration);
            audioProgress.disabled = false;
            rewindBtn.disabled = false;
            forwardBtn.disabled = false;
        });
        
        currentAudio.addEventListener('timeupdate', () => {
            syncHighlight(currentAudio.currentTime);
            audioProgress.value = currentAudio.currentTime;
            timeCurrent.innerText = formatTime(currentAudio.currentTime);
        });
        
        currentAudio.addEventListener('ended', () => {
            document.getElementById('play-icon').classList.remove('hidden');
            document.getElementById('pause-icon').classList.add('hidden');
        });
        
        playPauseBtn.disabled = false;
        
    } catch(e) {
        setStatus("Error", false);
        const errDiv = document.getElementById('error-message');
        errDiv.innerText = e.message;
        errDiv.classList.remove('hidden');
    }
}

// Play/Pause logic
playPauseBtn.addEventListener('click', () => {
    if (!currentAudio) return;
    
    if (currentAudio.paused) {
        currentAudio.play();
        document.getElementById('play-icon').classList.add('hidden');
        document.getElementById('pause-icon').classList.remove('hidden');
    } else {
        currentAudio.pause();
        document.getElementById('play-icon').classList.remove('hidden');
        document.getElementById('pause-icon').classList.add('hidden');
    }
});

document.getElementById('details-back-btn').addEventListener('click', () => {
    showHomeView();
});

document.getElementById('reader-back-btn').addEventListener('click', () => {
    if (currentAudio) {
        currentAudio.pause();
    }
    if (activeBookId) {
        showDetailsView(activeBookId);
    } else {
        showHomeView();
    }
});

document.getElementById('reader-home-btn').addEventListener('click', () => {
    if (currentAudio) {
        currentAudio.pause();
    }
    showHomeView();
});

document.getElementById('check-updates-btn').addEventListener('click', async () => {
    const btn = document.getElementById('check-updates-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner"></div> Taranıyor...';
    try {
        const res = await fetch('/api/books/check-updates', { method: 'POST' });
        const data = await res.json();
        await loadBooks();
        alert(`Tarama tamamlandı! ${data.updated_books} kitap güncellendi, ${data.new_chapters} yeni bölüm kütüphaneye eklendi.`);
    } catch (e) {
        alert("Bölüm taraması sırasında hata oluştu: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// --- Settings Menu Logic ---
const settingsToggleBtn = document.getElementById('settings-toggle-btn');
const settingsDropdown = document.getElementById('settings-dropdown');

settingsToggleBtn.addEventListener('click', () => {
    settingsDropdown.classList.toggle('hidden');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!settingsToggleBtn.contains(e.target) && !settingsDropdown.contains(e.target)) {
        settingsDropdown.classList.add('hidden');
    }
});

document.getElementById('settings-home-btn').addEventListener('click', () => {
    settingsDropdown.classList.add('hidden');
    if (currentAudio) {
        currentAudio.pause();
    }
    showHomeView();
});

document.getElementById('settings-chapters-btn').addEventListener('click', () => {
    settingsDropdown.classList.add('hidden');
    if (currentAudio) {
        currentAudio.pause();
    }
    if (activeBookId) {
        showDetailsView(activeBookId);
    } else {
        showHomeView();
    }
});

document.getElementById('settings-sync-btn').addEventListener('click', async () => {
    settingsDropdown.classList.add('hidden');
    const btn = document.getElementById('settings-sync-btn');
    const originalText = btn.innerText;
    btn.innerText = 'Taranıyor...';
    try {
        const res = await fetch('/api/books/check-updates', { method: 'POST' });
        const data = await res.json();
        await loadBooks();
        alert(`Tarama tamamlandı! ${data.updated_books} kitap güncellendi, ${data.new_chapters} yeni bölüm kütüphaneye eklendi.`);
    } catch (e) {
        alert("Hata: " + e.message);
    } finally {
        btn.innerText = originalText;
    }
});

document.getElementById('settings-regenerate-btn').addEventListener('click', async () => {
    settingsDropdown.classList.add('hidden');
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    if (pollingInterval) clearInterval(pollingInterval);
    
    // Delete cache via backend endpoint
    if (currentSessionId) {
        setStatus("Deleting cache...", true);
        try {
            await fetch('/api/tts/regenerate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId })
            });
            
            // Reload the chapter to force a fresh generation
            loadChapter(document.getElementById('chapter-title').dataset.url);
        } catch (e) {
            showError("Failed to delete cache: " + e.message);
        }
    }
});
// -----------------------------

// Speed control
document.getElementById('speed-select').addEventListener('change', (e) => {
    if (currentAudio) {
        currentAudio.playbackRate = parseFloat(e.target.value);
    }
});

// VTT Parser
function parseTime(timeStr) {
    const parts = timeStr.split(':');
    const secParts = parts[2].split(/[,.]/);
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    const secs = parseInt(secParts[0], 10);
    const ms = parseInt(secParts[1], 10);
    return hours * 3600 + mins * 60 + secs + ms / 1000;
}

function parseVTT(vttText) {
    subtitleCues = [];
    const lines = vttText.split(/\r?\n/);
    let i = 0;
    while(i < lines.length) {
        if(lines[i].includes('-->')) {
            const times = lines[i].split('-->');
            const start = parseTime(times[0].trim());
            const end = parseTime(times[1].trim());
            const text = lines[i+1];
            subtitleCues.push({start, end, text});
            i += 2;
        } else {
            i++;
        }
    }
}

const normalize = (str) => {
    if (!str) return "";
    return str.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/g, '').toLowerCase();
};

function alignCuesToDOM() {
    let currentSpanIndex = 0;
    for (let cue of subtitleCues) {
        const cueStr = normalize(cue.text);
        if (cueStr.length === 0) continue;
        
        let combinedStr = "";
        let startIndex = currentSpanIndex;
        let endIndex = currentSpanIndex;
        
        for (let j = 0; j < 100; j++) {
            let testIdx = currentSpanIndex + j;
            if (testIdx >= wordElements.length) break;
            
            combinedStr += normalize(wordElements[testIdx].textContent);
            endIndex = testIdx;
            
            if (combinedStr === cueStr || combinedStr.length >= cueStr.length) {
                break;
            }
        }
        
        cue.startSpanIndex = startIndex;
        cue.endSpanIndex = endIndex;
        currentSpanIndex = endIndex + 1;
    }
}

let lastActiveCueIndex = -1;

function syncHighlight(time) {
    // Find active cue index
    const activeCueIndex = subtitleCues.findIndex(c => time >= c.start && time <= c.end);
    
    // Clear old highlights
    document.querySelectorAll('.word.highlight').forEach(el => el.classList.remove('highlight'));
    
    if (activeCueIndex !== -1) {
        const activeCue = subtitleCues[activeCueIndex];
        if (activeCue.startSpanIndex !== undefined && activeCue.endSpanIndex !== undefined) {
            for(let i = activeCue.startSpanIndex; i <= activeCue.endSpanIndex; i++) {
                if (wordElements[i]) {
                    wordElements[i].classList.add('highlight');
                }
            }
            
            // Only scroll when transitioning to a new cue
            if (lastActiveCueIndex !== activeCueIndex) {
                if (wordElements[activeCue.startSpanIndex]) {
                    wordElements[activeCue.startSpanIndex].scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
                lastActiveCueIndex = activeCueIndex;
            }
        }
    }
}

// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

// --- Offline Download Logic ---
const enableOfflineBtn = document.getElementById('enable-offline-select-btn');
const offlineActions = document.getElementById('offline-actions');
const offlineSelectAll = document.getElementById('offline-select-all-btn');
const offlineCancel = document.getElementById('offline-cancel-btn');
const offlineConfirm = document.getElementById('offline-confirm-btn');
const offlineProgress = document.getElementById('offline-progress');

if (enableOfflineBtn) {
    enableOfflineBtn.addEventListener('click', () => {
        enableOfflineBtn.classList.add('hidden');
        offlineActions.classList.remove('hidden');
        showDetailsView(activeBookId); // Re-render list with checkboxes
    });
    
    offlineCancel.addEventListener('click', () => {
        offlineActions.classList.add('hidden');
        enableOfflineBtn.classList.remove('hidden');
        showDetailsView(activeBookId); // Re-render list without checkboxes
    });
    
    offlineSelectAll.addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.offline-checkbox');
        const allChecked = Array.from(checkboxes).every(c => c.checked);
        checkboxes.forEach(c => c.checked = !allChecked);
        offlineSelectAll.innerText = allChecked ? "Tümünü Seç" : "Hiçbirini Seçme";
    });
    
    offlineConfirm.addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.offline-checkbox:checked');
        if (checkboxes.length === 0) return;
        
        offlineActions.classList.add('hidden');
        offlineProgress.classList.remove('hidden');
        
        let count = 0;
        
        for (const box of checkboxes) {
            count++;
            const url = box.dataset.url;
            offlineProgress.innerText = `İndiriliyor... ${count} / ${checkboxes.length} (${Math.round((count / checkboxes.length) * 100)}%)`;
            
            try {
                const chRes = await fetch(`/api/chapter?url=${encodeURIComponent(url)}`);
                if (chRes.ok) {
                    const chData = await chRes.json();
                    const prepareRes = await fetch('/api/tts/prepare', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(chData)
                    });
                    
                    if (prepareRes.ok) {
                        const prepareData = await prepareRes.json();
                        await fetch(`/api/tts/vtt?id=${prepareData.session_id}`);
                    }
                }
            } catch (e) {
                console.error("Offline download error:", e);
            }
        }
        
        offlineProgress.innerText = "İndirme Tamamlandı! (Seçilen metinler çevrimdışı okunabilir)";
        setTimeout(() => {
            offlineProgress.classList.add('hidden');
            enableOfflineBtn.classList.remove('hidden');
            showDetailsView(activeBookId); // reset view
        }, 3000);
    });
}
