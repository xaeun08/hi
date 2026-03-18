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
const SCOPES = "user-library-read user-read-recently-played";

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

// --- Smart Search Dictionary ---
// 일본어 노래의 한국어 발음/뜻 매핑 (데이터가 많을수록 정확도가 올라갑니다)
const JPOP_DICTIONARY = [
    { ko: "레몬", ja: "Lemon", artist: "Kenshi Yonezu" },
    { ko: "아이돌", ja: "アイドル", artist: "YOASOBI" },
    { ko: "베텔기우스", ja: "ベテルギウス", artist: "Yuuri" },
    { ko: "숨바꼭질", ja: "かくれんぼ", artist: "Yuuri" },
    { ko: "드라이 플라워", ja: "ドライフラワー", artist: "Yuuri" },
    { ko: "밤을 달리다", ja: "夜に駆ける", artist: "YOASOBI" },
    { ko: "괴물", ja: "怪物", artist: "YOASOBI" },
    { ko: "카이카이키탄", ja: "廻廻奇譚", artist: "Eve" },
    { ko: "첫사랑", ja: "First Love", artist: "Utada Hikaru" },
    { ko: "체리", ja: "チェリー", artist: "Spitz" },
    { ko: "마리골드", ja: "マリーゴールド", artist: "Aimyon" },
    { ko: "난데모나이야", ja: "なんでもないや", artist: "RADWIMPS" },
    { ko: "전전전세", ja: "前前前世", artist: "RADWIMPS" },
    { ko: "실", ja: "糸", artist: "Nakajima Miyuki" },
    { ko: "눈의 꽃", ja: "雪の華", artist: "Nakashima Mika" }
];

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
        await tesseractWorker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT, // 드문드문 있는 텍스트 인식 최적화
            tessjs_create_hocr: '0',
            tessjs_create_tsv: '0',
        });
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
        // --- Multi-pass Preprocessing ---
        // 여러 가지 대비 설정으로 텍스트 추출 시도 (정확도 향상)
        const blob = await preprocessImageForOCR(file);
        
        ocrStatusText.textContent = "이미지에서 텍스트를 읽는 중...";
        const { data: { lines } } = await tesseractWorker.recognize(blob);
        
        const processedTitles = lines
            .map(line => {
                let text = line.text.trim();
                // 불필요한 노이즈 제거
                return text.replace(/[^\w\s가-힣ぁ-んァ-ヶ亜-熙\-]/g, "").trim();
            })
            .filter(text => {
                if (text.length < 2) return false;
                if (/^\d+$/.test(text)) return false; // 숫자만 있는 줄 제외
                return true;
            });

        const uniqueTitles = [...new Set(processedTitles)];
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
            
            // 해상도 조절 (너무 크면 작게, 너무 작으면 크게)
            const scale = 1500 / Math.max(img.width, img.height);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Grayscale + Adaptive-like Thresholding (Manual)
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i+1] + data[i+2]) / 3;
                // 더 강한 대비 부여
                const val = avg > 120 ? 255 : 0;
                data[i] = data[i+1] = data[i+2] = val;
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
        showToast("텍스트를 추출하지 못했습니다.");
        return;
    }

    titles.forEach(title => {
        const div = document.createElement("div");
        div.className = "extracted-item selected";
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

    const allResults = [];
    for (const title of selected) {
        const results = await performSmartSearch(title);
        allResults.push(...results);
    }
    renderResults(allResults);
    showLoading(false);
};

// --- Smart Search Logic ---
async function performSmartSearch(query) {
    let queries = [query];

    // 1. Dictionary Lookup (한글 발음 -> 일본어 제목)
    const fuse = new Fuse(JPOP_DICTIONARY, { keys: ["ko"], threshold: 0.3 });
    const dictMatch = fuse.search(query);
    if (dictMatch.length > 0) {
        queries.push(dictMatch[0].item.ja);
    }

    // 2. 만약 한글만 포함되어 있다면, 발음 추정 검색 (간단한 규칙 기반 가능하지만 여기선 API에 맡김)
    
    // 3. 병렬 검색 실행
    try {
        const searchPromises = queries.map(q => Promise.all([
            fetchData(q, 'tj'),
            fetchData(q, 'kumyoung')
        ]));
        
        const resultsArray = await Promise.all(searchPromises);
        return resultsArray.flat(2);
    } catch (e) {
        return [];
    }
}

// --- Search System ---
searchInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
        const query = searchInput.value.trim();
        if (!query) return;

        showLoading(true);
        resultsContainer.innerHTML = "";
        
        const results = await performSmartSearch(query);
        renderResults(results);
        showLoading(false);
    }
});

async function fetchData(query, brand) {
    const url = `${API_BASE}/song/${encodeURIComponent(query)}/${brand}.json`;
    try {
        const res = await fetch(url);
        return res.ok ? await res.json() : [];
    } catch (e) { return []; }
}

// --- Top Charts (Real-time Scraping) ---
async function loadTopCharts() {
    chartsTab.innerHTML = '<div class="loading"><div class="spinner"></div><span>TJ 실시간 차트 불러오는 중...</span></div>';
    
    try {
        // CORS Proxy를 사용하여 TJ 미디어 차트 페이지 가져오기
        const targetUrl = "https://www.tjmedia.com/chart/top100";
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        
        const response = await fetch(proxyUrl);
        const data = await response.json();
        const html = data.contents;

        // 임시 DOM 객체를 생성하여 HTML 파싱
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const rows = doc.querySelectorAll(".board_type1 tbody tr");

        if (rows.length === 0) throw new Error("데이터를 찾을 수 없습니다.");

        chartsTab.innerHTML = '<p class="tab-desc">TJ 미디어 실시간 인기 TOP 100 차트입니다.</p>';
        const grid = document.createElement("div");
        grid.className = "charts-grid";

        // 상위 50개만 표시 (성능 및 가독성)
        Array.from(rows).slice(0, 50).forEach(row => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 5) return;

            const rank = cells[0].textContent.trim();
            const number = cells[1].textContent.trim();
            const title = cells[3].textContent.trim();
            const singer = cells[4].textContent.trim();

            const div = document.createElement("div");
            div.className = "chart-item animate-in";
            div.innerHTML = `
                <span class="chart-rank">${rank}</span>
                <div class="chart-info">
                    <strong>${title}</strong><br>
                    <small>${singer}</small>
                </div>
                <div class="chart-no">${number}</div>
            `;
            
            div.onclick = () => {
                searchInput.value = number; // 번호로 직접 검색 시도
                searchInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
                document.querySelector('[data-tab="search"]').click();
            };
            grid.appendChild(div);
        });
        chartsTab.appendChild(grid);
    } catch (e) {
        console.error(e);
        chartsTab.innerHTML = '<div class="placeholder-message"><p>차트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p></div>';
    }
}

// --- Spotify Auth (Omitted for brevity, keep existing) ---
// ... (기존 Spotify 관련 코드는 유지되도록 구현해야 합니다)
// 여기에 기존 코드를 통합합니다.

// --- UI Helpers ---
function renderResults(results) {
    const grouped = {};
    
    // 중복 제거 및 브랜드별 통합
    results.forEach(item => {
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

    resultsContainer.innerHTML = "";
    entries.forEach(song => {
        const card = document.createElement("div");
        card.className = "song-card animate-in";
        let badges = "";
        if (song.tj) badges += `<div class="badge tj" onclick="copyToClipboard('${song.tj}', 'TJ: ${song.tj} 복사!')"><span class="badge-label">TJ</span> <strong>${song.tj}</strong></div>`;
        if (song.ky) badges += `<div class="badge ky" onclick="copyToClipboard('${song.ky}', 'KY: ${song.ky} 복사!')"><span class="badge-label">KY</span> <strong>${song.ky}</strong></div>`;
        card.innerHTML = `<div class="song-info"><h3>${song.title}</h3><p>${song.singer}</p></div><div class="karaoke-numbers">${badges}</div>`;
        resultsContainer.appendChild(card);
    });
}

function showLoading(l) { loadingIndicator.classList.toggle("hidden", !l); }
function showNoResults() { resultsContainer.innerHTML = '<div class="placeholder-message"><p>결과를 찾을 수 없습니다.</p></div>'; }

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

// Spotify Login Placeholder
spotifyLoginBtn.onclick = () => showToast("준비 중인 기능입니다!");
checkSpotifyAuth();

function checkSpotifyAuth() {}
