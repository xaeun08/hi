const API_BASE = "https://api.manana.kr/karaoke";

// DOM Elements
const searchInput = document.getElementById("searchInput");
const resultsContainer = document.getElementById("resultsContainer");
const loadingIndicator = document.getElementById("loadingIndicator");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const chartsTab = document.getElementById("chartsTab");
const spotifyLoginBtn = document.getElementById("spotifyLoginBtn");
const spotifyTracksContainer = document.getElementById("spotifyTracks");
const syncPanel = document.querySelector(".sync-panel");

// Spotify Config
let SPOTIFY_CLIENT_ID = localStorage.getItem("spotify_client_id") || "";
const REDIRECT_URI = window.location.origin + window.location.pathname;

// OCR Elements
const imageUpload = document.getElementById("imageUpload");
const dropZone = document.getElementById("dropZone");
const imagePreview = document.getElementById("imagePreview");
const ocrStatus = document.getElementById("ocrStatus");
const ocrStatusText = document.getElementById("ocrStatusText");
const extractedTitlesContainer = document.getElementById("extractedTitlesContainer");
const titlesList = document.getElementById("titlesList");
const searchAllBtn = document.getElementById("searchAllBtn");

let tesseractWorker = null;
let isOCRInitializing = false;

// --- Tab System ---
tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove("active"));
        tabContents.forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`${target}Tab`).classList.add("active");

        if (target === "charts") loadTopCharts();
        if (target === "sync") checkSpotifyAuth();
        if (target === "capture") initOCR();
    });
});

// --- OCR Search System ---
async function initOCR() {
    if (tesseractWorker || isOCRInitializing) return;
    isOCRInitializing = true;
    
    ocrStatus.classList.remove("hidden");
    ocrStatusText.textContent = "OCR 엔진 준비 중...";
    try {
        tesseractWorker = await Tesseract.createWorker("kor+jpn+eng");
    } catch (e) {
        showToast("OCR 엔진 초기화에 실패했습니다.");
    } finally {
        ocrStatus.classList.add("hidden");
        isOCRInitializing = false;
    }
}

imageUpload.addEventListener("change", (e) => handleImage(e.target.files[0]));

dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("active");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("active"));

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("active");
    handleImage(e.dataTransfer.files[0]);
});

async function handleImage(file) {
    if (!file || !file.type.startsWith("image/")) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        imagePreview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);

    await processImage(file);
}

async function processImage(file) {
    await initOCR();
    ocrStatus.classList.remove("hidden");
    ocrStatusText.textContent = "이미지 최적화 중...";
    extractedTitlesContainer.classList.add("hidden");

    try {
        // --- Image Preprocessing ---
        const preprocessedBlob = await preprocessImageForOCR(file);
        
        ocrStatusText.textContent = "이미지에서 텍스트를 읽는 중...";
        const { data: { text, lines } } = await tesseractWorker.recognize(preprocessedBlob);
        
        // --- Advanced Filtering ---
        const processedTitles = lines
            .map(line => {
                // Remove special characters at start/end, keep letters, numbers, and CJK characters
                let cleaned = line.text.trim()
                    .replace(/^[^a-zA-Z0-9가-힣ぁ-んァ-ヶ亜-熙]+|[^a-zA-Z0-9가-힣ぁ-んァ-ヶ亜-熙]+$/g, "");
                
                // If the line looks like "Title - Artist", try to split or keep it clean
                return cleaned;
            })
            .filter(text => {
                // Filter out: too short, only numbers (likely karaoke numbers or dates), or empty
                if (text.length < 2) return false;
                if (/^\d+$/.test(text)) return false;
                if (text.includes("http") || text.includes("www")) return false;
                return true;
            });

        // Deduplicate and filter out very common UI text
        const commonUIWords = ["곡명", "가수", "번호", "Search", "Top", "Charts"];
        const uniqueTitles = [...new Set(processedTitles)]
            .filter(title => !commonUIWords.some(word => title.toLowerCase().includes(word.toLowerCase())));

        renderExtractedTitles(uniqueTitles);
    } catch (e) {
        console.error(e);
        showToast("이미지 처리 중 오류가 발생했습니다.");
    } finally {
        ocrStatus.classList.add("hidden");
    }
}

async function preprocessImageForOCR(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            
            // Standardize size for better OCR
            const maxDim = 1500;
            let width = img.width;
            let height = img.height;
            
            if (width > height && width > maxDim) {
                height *= maxDim / width;
                width = maxDim;
            } else if (height > maxDim) {
                width *= maxDim / height;
                height = maxDim;
            }

            canvas.width = width;
            canvas.height = height;
            
            // Draw image
            ctx.drawImage(img, 0, 0, width, height);
            
            // Get image data for manual pixel manipulation (Grayscale + High Contrast)
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            for (let i = 0; i < data.length; i += 4) {
                // Grayscale: Y = 0.299R + 0.587G + 0.114B
                const avg = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
                
                // Increase Contrast: thresholding
                const threshold = 128;
                const value = avg > threshold ? 255 : 0;
                
                data[i] = data[i+1] = data[i+2] = value;
            }
            
            ctx.putImageData(imageData, 0, 0);
            canvas.toBlob(blob => resolve(blob), "image/png");
        };
        img.src = URL.createObjectURL(file);
    });
}

function renderExtractedTitles(titles) {
    titlesList.innerHTML = "";
    if (titles.length === 0) {
        showToast("텍스트를 추출하지 못했습니다. 다른 이미지를 시도해보세요.");
        return;
    }

    titles.forEach(title => {
        const div = document.createElement("div");
        div.className = "extracted-item selected"; // Default selected
        div.textContent = title;
        div.onclick = () => div.classList.toggle("selected");
        titlesList.appendChild(div);
    });

    extractedTitlesContainer.classList.remove("hidden");
}

searchAllBtn.onclick = async () => {
    const selected = Array.from(titlesList.querySelectorAll(".extracted-item.selected"))
        .map(el => el.textContent);

    if (selected.length === 0) return;

    showLoading(true);
    resultsContainer.innerHTML = "";
    document.querySelector('[data-tab="search"]').click();

    try {
        const promises = selected.map(title => performBatchSearch(title));
        const results = await Promise.all(promises);
        const allResults = results.flat();
        renderResults(allResults);
    } catch (e) {
        showError();
    } finally {
        showLoading(false);
    }
};

async function performBatchSearch(query) {
    try {
        const [tjData, kyData] = await Promise.all([
            fetchData(query, 'tj'),
            fetchData(query, 'kumyoung')
        ]);
        return [...tjData, ...kyData];
    } catch (e) {
        return [];
    }
}

// --- Search System ---
searchInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
        const query = searchInput.value.trim();
        if (!query) return;

        // Detect URL (Spotify/Melon)
        if (query.includes("spotify.com/track/")) {
            await handleSpotifyUrl(query);
        } else if (query.includes("melon.com/song/")) {
            await handleMelonUrl(query);
        } else {
            performSearch(query);
        }
    }
});

async function performSearch(query) {
    showLoading(true);
    resultsContainer.innerHTML = "";
    try {
        const [tjData, kyData] = await Promise.all([
            fetchData(query, 'tj'),
            fetchData(query, 'kumyoung')
        ]);
        renderResults([...tjData, ...kyData]);
    } catch (error) {
        showError();
    } finally {
        showLoading(false);
    }
}

async function fetchData(query, brand) {
    const url = `${API_BASE}/song/${encodeURIComponent(query)}/${brand}.json`;
    const res = await fetch(url);
    return res.ok ? await res.json() : [];
}

// --- Top Charts ---
const JPOP_CHARTS = [
    { rank: 1, title: "Bling-Bang-Bang-Born", singer: "Creepy Nuts" },
    { rank: 2, title: "Idol", singer: "YOASOBI" },
    { rank: 3, title: "Specialz", singer: "King Gnu" },
    { rank: 4, title: "Kura Kura", singer: "Ado" },
    { rank: 5, title: "Lemon", singer: "Kenshi Yonezu" },
    { rank: 6, title: "Kaikai Kitan", singer: "Eve" },
    { rank: 7, title: "Night Dancer", singer: "imase" },
    { rank: 8, title: "First Love", singer: "Hikaru Utada" },
    { rank: 9, title: "Dry Flower", singer: "Yuuri" },
    { rank: 10, title: "Marigold", singer: "Aimyon" }
];

function loadTopCharts() {
    chartsTab.innerHTML = '<p class="tab-desc">인기 J-Pop을 한 번의 클릭으로 검색해보세요.</p>';
    const grid = document.createElement("div");
    grid.className = "charts-grid";
    JPOP_CHARTS.forEach(item => {
        const div = document.createElement("div");
        div.className = "chart-item";
        div.innerHTML = `<span class="chart-rank">${item.rank}</span> <div><strong>${item.title}</strong><br><small>${item.singer}</small></div>`;
        div.onclick = () => {
            searchInput.value = item.title;
            performSearch(item.title);
            document.querySelector('[data-tab="search"]').click();
        };
        grid.appendChild(div);
    });
    chartsTab.appendChild(grid);
}

// --- Spotify PKCE Auth ---
async function handleSpotifyUrl(url) {
    showLoading(true);
    try {
        // Use OEmbed to get track metadata without login
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
        const res = await fetch(oembedUrl);
        const data = await res.json();
        // data.title usually is "Song Name by Artist"
        const title = data.title.split(" by ")[0];
        searchInput.value = title;
        performSearch(title);
    } catch (e) {
        performSearch(url); // Fallback to raw string search
    }
}

async function handleMelonUrl(url) {
    // Melon doesn't have OEmbed. We'll try to extract the ID and show a hint.
    const match = url.match(/songId=(\d+)/);
    if (match) {
        showToast("Melon URL은 직접 제목을 가져올 수 없어 수동 검색을 권장합니다.");
    }
}

spotifyLoginBtn.onclick = () => {
    if (!SPOTIFY_CLIENT_ID) {
        showSettingsModal();
        return;
    }
    redirectToSpotify();
};

function showSettingsModal() {
    const modal = document.getElementById("settingsModal");
    modal.classList.remove("hidden");
    document.getElementById("saveSettingsBtn").onclick = () => {
        const id = document.getElementById("spotifyClientId").value.trim();
        if (id) {
            SPOTIFY_CLIENT_ID = id;
            localStorage.setItem("spotify_client_id", id);
            modal.classList.add("hidden");
            redirectToSpotify();
        }
    };
    document.getElementById("closeModalBtn").onclick = () => modal.classList.add("hidden");
}

async function redirectToSpotify() {
    const verifier = generateRandomString(64);
    localStorage.setItem("code_verifier", verifier);
    const challenge = await generateCodeChallenge(verifier);

    const params = new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        code_challenge_method: 'S256',
        code_challenge: challenge
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function checkSpotifyAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
        window.history.replaceState({}, document.title, window.location.pathname);
        await exchangeCodeForToken(code);
    }

    const token = localStorage.getItem("spotify_access_token");
    if (token) {
        syncPanel.classList.add("hidden");
        spotifyTracksContainer.classList.remove("hidden");
        loadSpotifyTracks(token);
    }
}

async function exchangeCodeForToken(code) {
    const verifier = localStorage.getItem("code_verifier");
    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: SPOTIFY_CLIENT_ID,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier
        })
    });
    const data = await res.json();
    if (data.access_token) {
        localStorage.setItem("spotify_access_token", data.access_token);
    }
}

async function loadSpotifyTracks(token) {
    spotifyTracksContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const res = await fetch("https://api.spotify.com/v1/me/tracks?limit=20", {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        renderSpotifyTracks(data.items);
    } catch (e) {
        localStorage.removeItem("spotify_access_token");
        syncPanel.classList.remove("hidden");
        spotifyTracksContainer.classList.add("hidden");
    }
}

function renderSpotifyTracks(items) {
    spotifyTracksContainer.innerHTML = '<h4>내 Spotify 보관함</h4>';
    items.forEach(item => {
        const track = item.track;
        const div = document.createElement("div");
        div.className = "track-item";
        div.innerHTML = `
            <div class="track-info">
                <h4>${track.name}</h4>
                <p>${track.artists.map(a => a.name).join(", ")}</p>
            </div>
            <button class="find-btn">찾기</button>
        `;
        div.querySelector(".find-btn").onclick = () => {
            searchInput.value = track.name;
            performSearch(track.name);
            document.querySelector('[data-tab="search"]').click();
        };
        spotifyTracksContainer.appendChild(div);
    });
}

// --- Utils ---
function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// --- J-Pop Filter Utils ---
const JPOP_ARTISTS = [
    "YOASOBI", "Ado", "Kenshi Yonezu", "Official Hige Dandism", "Mrs. GREEN APPLE", 
    "Vaundy", "King Gnu", "Creepy Nuts", "imase", "Yuuri", "Aimyon", "Eve", 
    "LiSA", "Radwimps", "Hikaru Utada", "ZUTOMAYO", "Yorushika", "Spitz", 
    "Fujii Kaze", "Aimer", "Back Number", "Suda Masaki", "Tani Yuuki", "Saucy Dog"
];

function containsJapanese(text) {
    // Regex for Hiragana, Katakana, and common Kanji
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

function isJPop(item) {
    const title = item.title || "";
    const singer = item.singer || "";
    
    // 1. If title or singer contains Japanese characters
    if (containsJapanese(title) || containsJapanese(singer)) return true;
    
    // 2. If singer matches our popular J-Pop list
    const upperSinger = singer.toUpperCase();
    if (JPOP_ARTISTS.some(artist => upperSinger.includes(artist.toUpperCase()))) return true;
    
    // 3. Heuristic: If it has ( ) with Japanese in it (common in TJ/KY titles)
    if (/\([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+\)/.test(title)) return true;

    return false;
}

// --- UI Helpers ---
function renderResults(results) {
    const grouped = {};
    
    // Filter for J-Pop ONLY
    const filteredResults = results.filter(isJPop);

    filteredResults.forEach(item => {
        const key = `${item.title.toLowerCase().replace(/\s/g, '')}-${item.singer.toLowerCase().replace(/\s/g, '')}`;
        if (!grouped[key]) {
            grouped[key] = { title: item.title, singer: item.singer, tj: null, ky: null };
        }
        if (item.brand === 'tj') grouped[key].tj = item.no;
        if (item.brand === 'kumyoung') grouped[key].ky = item.no;
    });

    const entries = Object.values(grouped);
    if (entries.length === 0) {
        showNoResults();
        return;
    }

    entries.forEach(song => {
        const card = document.createElement("div");
        card.className = "song-card";
        let badges = "";
        if (song.tj) badges += `<div class="badge tj" onclick="copyToClipboard('${song.tj}', 'TJ 번호 복사 완료!')"><span class="badge-label">TJ</span> <strong>${song.tj}</strong></div>`;
        if (song.ky) badges += `<div class="badge ky" onclick="copyToClipboard('${song.ky}', 'KY 번호 복사 완료!')"><span class="badge-label">KY</span> <strong>${song.ky}</strong></div>`;
        card.innerHTML = `<div class="song-info"><h3>${song.title}</h3><p>${song.singer}</p></div><div class="karaoke-numbers">${badges}</div>`;
        resultsContainer.appendChild(card);
    });
}

function showLoading(l) { loadingIndicator.classList.toggle("hidden", !l); }
function showError() { resultsContainer.innerHTML = '<div class="placeholder-message"><p>검색 중 오류가 발생했습니다.</p></div>'; }
function showNoResults() { resultsContainer.innerHTML = '<div class="placeholder-message"><p>검색 결과가 없습니다.</p></div>'; }

window.copyToClipboard = (text, msg) => {
    navigator.clipboard.writeText(text).then(() => showToast(msg));
};

function showToast(msg) {
    const t = document.createElement("div");
    t.className = "toast show";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2000);
}

// Init
checkSpotifyAuth();
if (window.location.search.includes("code=")) {
    document.querySelector('[data-tab="sync"]').click();
}
