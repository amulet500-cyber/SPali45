let dictionary = {};
let currentThaiContent = "";
let lastRequestedWord = ""; 
let lastProcessedWord = "";
let hoverTimer = null;
let localUpMdicHandle = null; // ตัวเก็บสิทธิ์การเขียนไฟล์ upmdic.txt บนฮาร์ดดิสก์

// เรียก API บน Server ตัวเองโดยตรง
const AI_TRANSLATE_URL = "/api/translate-word";

// สร้างปุ่มวงกลมดินสอลอย (FAB) ที่มุมขวาล่างหน้าจออัตโนมัติ
function createFloatingEditButton() {
    if (document.getElementById('fab-edit-btn')) return;

    const fab = document.createElement('button');
    fab.id = 'fab-edit-btn';
    fab.innerHTML = '✏️';
    fab.title = 'แก้ไขคำแปลคำศัพท์ที่เลือก';
    fab.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background-color: #ffd700;
        color: #3e2723;
        border: 2px solid #3e2723;
        font-size: 24px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        cursor: pointer;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, background-color 0.2s;
    `;

    fab.addEventListener('mouseenter', () => { fab.style.transform = 'scale(1.1)'; });
    fab.addEventListener('mouseleave', () => { fab.style.transform = 'scale(1.0)'; });

    fab.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerEditCurrentWord();
    });

    document.body.appendChild(fab);
}

// ฟังก์ชันเปิดโหมดแก้ไขคำศัพท์ล่าสุดที่เลือกอยู่
function triggerEditCurrentWord() {
    if (!lastProcessedWord) {
        alert("กรุณาชี้หรือแตะเลือกคำศัพท์บาลีก่อนครับ");
        return;
    }

    const currentTranslation = dictionary[lastProcessedWord] || "";
    makePopupEditable(lastProcessedWord, currentTranslation);
}

// ฟังก์ชันแยกตัดบรรทัดเข้าพจนานุกรม (รองรับทั้ง " – ", "\t", และ " ")
function parseAndAddToDict(textData) {
    if (!textData) return;
    textData.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
        let parts = [];
        if (trimmed.includes(' – ')) {
            parts = trimmed.split(' – ');
        } else if (trimmed.includes('\t')) {
            parts = trimmed.split('\t');
        } else {
            const spaceIdx = trimmed.indexOf(' ');
            if (spaceIdx !== -1) {
                parts = [trimmed.substring(0, spaceIdx), trimmed.substring(spaceIdx + 1)];
            }
        }

        if (parts.length >= 2) {
            const word = parts[0].trim();
            const trans = parts.slice(1).join(' – ').trim();
            if (word && trans) {
                dictionary[word] = trans;
            }
        }
    });
}

// โหลดพจนานุกรม
async function loadDictionary() {
    try {
        const cacheBuster = `?t=${Date.now()}`;

        let response = await fetch(`mdic.txt${cacheBuster}`, { cache: 'no-store' });
        if (!response.ok) {
            response = await fetch(`sys.obj${cacheBuster}`, { cache: 'no-store' });
        }
        if (response.ok) {
            const text = await response.text();
            parseAndAddToDict(text);
        }

        try {
            const aiResponse = await fetch(`ai_words.txt${cacheBuster}`, { cache: 'no-store' });
            if (aiResponse.ok) {
                const aiText = await aiResponse.text();
                parseAndAddToDict(aiText);
            }
        } catch (aiErr) {
            console.log("ข้าม ai_words.txt:", aiErr);
        }

        try {
            const upResponse = await fetch(`upmdic.txt${cacheBuster}`, { cache: 'no-store' });
            if (upResponse.ok) {
                const upText = await upResponse.text();
                parseAndAddToDict(upText);
            }
        } catch (upErr) {
            console.log("ข้าม upmdic.txt:", upErr);
        }

        const localUpEdits = localStorage.getItem('upmdic_edits');
        if (localUpEdits) parseAndAddToDict(localUpEdits);

        const localSaved = localStorage.getItem('ai_added_words');
        if (localSaved) {
            try {
                const extraDict = JSON.parse(localSaved);
                Object.assign(dictionary, extraDict);
            } catch (jsonErr) {}
        }
    } catch (e) { 
        console.error("โหลดพจนานุกรมล้มเหลว:", e); 
    }
}

// ฟังก์ชันบันทึกคำแปลที่แก้ไขลง upmdic.txt บนฮาร์ดดิสก์ และ LocalStorage
async function saveToLocalUpMdic(paliWord, newMeaning) {
    dictionary[paliWord] = newMeaning;

    let currentData = localStorage.getItem('upmdic_edits') || '';
    let lines = currentData.split('\n').filter(line => line.trim() !== '');
    
    let isFound = false;
    lines = lines.map(line => {
        if (line.startsWith(paliWord + ' – ') || line.startsWith(paliWord + '\t') || line.startsWith(paliWord + ' ')) {
            isFound = true;
            return `${paliWord} – ${newMeaning}`;
        }
        return line;
    });

    if (!isFound) {
        lines.push(`${paliWord} – ${newMeaning}`);
    }

    const updatedText = lines.join('\n') + '\n';
    localStorage.setItem('upmdic_edits', updatedText);

    try {
        if ('showSaveFilePicker' in window) {
            if (!localUpMdicHandle) {
                localUpMdicHandle = await window.showSaveFilePicker({
                    suggestedName: 'upmdic.txt',
                    types: [{
                        description: 'Text File (*.txt)',
                        accept: { 'text/plain': ['.txt'] }
                    }]
                });
            }

            const writable = await localUpMdicHandle.createWritable();
            await writable.write(updatedText);
            await writable.close();
        }
    } catch (err) {
        console.log('บันทึกลง LocalStorage สำเร็จ:', err);
    }
}

// ฟังก์ชันเปลี่ยน Popup ให้เป็นช่องแก้ไขคำแปล
function makePopupEditable(paliWord, currentTranslation) {
    const popup = document.getElementById('popup');
    if (!popup) return;

    popup.classList.add('active');
    popup.innerHTML = `
        <div style="display: flex; gap: 6px; align-items: center; pointer-events: auto;">
            <span style="color: #ffd700; font-weight: bold; white-space: nowrap;">${paliWord} –</span>
            <input type="text" id="edit-trans-input" value="${currentTranslation}" 
                   style="font-size: 0.85em; padding: 4px 8px; border-radius: 6px; border: 1.5px solid #ffd700; background: #ffffff; color: #3e2723; outline: none; width: 180px; font-family: inherit;">
            <button id="save-trans-btn" style="padding: 4px 8px; font-size: 0.8em; border: none; background: #ffd700; color: #3e2723; border-radius: 4px; cursor: pointer; font-weight: bold; white-space: nowrap;">บันทึก</button>
        </div>
    `;

    const inputEl = document.getElementById('edit-trans-input');
    const saveBtn = document.getElementById('save-trans-btn');

    if (inputEl) {
        inputEl.focus();
        inputEl.select();

        let isSaved = false;
        const handleSave = async () => {
            if (isSaved) return;
            isSaved = true;

            const newTranslation = inputEl.value.trim();
            if (!newTranslation) {
                updatePopup(`${paliWord} – ${currentTranslation}`);
                return;
            }

            updatePopup(`${paliWord} – ${newTranslation}`);
            await saveToLocalUpMdic(paliWord, newTranslation);
        };

        if (saveBtn) saveBtn.addEventListener('click', handleSave);
        
        inputEl.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                handleSave();
            }
        });
    }
}

// ดักจับการกดปุ่ม F2 เพื่อแก้ไขคำแปล (สำหรับคอมพิวเตอร์)
document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
        e.preventDefault();
        triggerEditCurrentWord();
    }
});

// ฟังก์ชันแสดงและจัดการตำแหน่งป๊อปอัป
function updatePopup(text, targetElement = null, isBottomMode = false) {
    const popup = document.getElementById('popup');
    if (!popup) return;

    if (!text || text.trim() === "") {
        popup.classList.remove('active', 'bottom-mode');
        return;
    }

    popup.innerText = text;

    if (isBottomMode) {
        popup.classList.add('bottom-mode', 'active');
        popup.style.top = '';
        popup.style.left = '';
        popup.style.transform = '';
        return;
    }

    popup.classList.remove('bottom-mode');
    popup.classList.add('active');

    if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const scrollLeft = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;

        let topPos = rect.top + scrollTop - 8;
        if (rect.top < 60) {
            topPos = rect.bottom + scrollTop + 8;
            popup.style.transform = 'translate(0, 0)';
        } else {
            popup.style.transform = 'translate(0, -100%)';
        }

        let leftPos = rect.left + scrollLeft;
        popup.style.top = topPos + 'px';
        popup.style.left = leftPos + 'px';

        requestAnimationFrame(() => {
            const popupWidth = popup.offsetWidth || 200;
            const windowWidth = window.innerWidth;

            if (leftPos + popupWidth > windowWidth - 15) {
                leftPos = windowWidth - popupWidth - 15;
            }
            if (leftPos < 10) leftPos = 10;

            popup.style.left = leftPos + 'px';
        });
    }
}

// ฟังก์ชันแปลเนื้อหาตามเลขข้อ [๑]
function showTranslation(topicNumber, targetElement) {
    if (!currentThaiContent) {
        updatePopup("กรุณาโหลดเล่มก่อนครับ", targetElement, true);
        return;
    }
    let cleanText = currentThaiContent.replace(/\r\n|\r|\n/g, " ");
    const escapedTopic = topicNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escapedTopic}\\s*(.*?)(?=\\s*\\[[๑-๙๐-๙]+\\]|$)`, 'm');
    const match = regex.exec(cleanText);
    
    updatePopup(match && match[1].trim() ? `แปล ${topicNumber}: ${match[1].trim()}` : `ไม่พบข้อมูล ${topicNumber}`, targetElement, true);
}

const selector = document.getElementById('book-selector');
const bookNames = [
    "01 วินย.มหาวิภงฺโค ๑", "02 วินย.มหาวิภงฺโค ๒", "03 วินย.ภิกฺขุนีวิภงฺโค", "04 วินย.มหาวคฺโค ๑", "05 วินย.มหาวคฺโค ๒",
    "06 วินย.จุลฺลวคฺโค ๑", "07 วินย.จุลฺลวคฺโค ๒", "08 วินย.ปริวาโร", "09 สุตฺต ที.สีลกฺขนฺธ", "10 สุตฺต ที.มหาวคฺโค",
    "11 สุตฺต ที.ปาฏิกฺวคฺโค", "12 สุตฺต ม.มูลปณฺณาสกํ", "13 สุตฺต ม.มชฺฌิมปณฺณาสกํ", "14 สุตฺต ม.อุปริปณฺณาสกํ",
    "15 สุตฺต สํ.สคาถวคฺโค", "16 สุตฺต สํ.นิทานวคฺโค", "17 สุตฺต สํ.ขนฺธวารวคฺโค", "18 สุตฺต สํ.สฬายตวคฺโค",
    "19 สุตฺต สํ.มหาวารวคฺโค", "20 สุตฺต องฺ เอก-ทุก-ติก", "21 สุตฺต องฺ จตุกฺก", "22 สุตฺต องฺ ปัญจก-ฉักก",
    "23 สุตฺต องฺ สัตตก-อัฏฐก-นวก", "24 สุตฺต องฺ ทสก-เอกาทสก", "25 สุตฺต ขุ. ขุททกปาฐ-ธรรมบท-อุทาน",
    "26 สุตฺต ขุ. วิมาน-เปต", "27 สุตฺต ขุ. ชาดก ๑", "28 สุตฺต ขุ. ชาดก ๒", "29 สุตฺต ขุ. มหานิทเทส",
    "30 สุตฺต ขุ. จูฬนิทเทส", "31 สุตฺต ขุ. ปฏิสัมภิทามรรค", "32 สุตฺต ขุ. อปทาน ๑", "33 สุตฺต ขุ. อปทาน พุทธวงศ์ ๒",
    "34 อภิ. ธรรมสังคณี", "35 อภิ. วิภังค์", "36 อภิ. ธาตุกถา-ปุคคลปัญญัติ", "37 อภิ. กถาวัตถุ",
    "38 อภิ. ยมก ๑", "39 อภิ. ยมก ๒", "40 อภิ. ปัฏฐาน ๑", "41 อภิ. ปัฏฐาน ๒", "42 อภิ. ปัฏฐาน ๓",
    "43 อภิ. ปัฏฐาน ๔", "44 อภิ. ปัฏฐาน ๕", "45 อภิ. ปัฏฐาน ๖"
];

if (selector) {
    bookNames.forEach((name, i) => {
        let opt = document.createElement('option');
        opt.value = i + 1; 
        opt.textContent = name;
        selector.appendChild(opt);
    });

    selector.addEventListener('change', async (e) => {
        const bookNum = e.target.value;
        const contentDiv = document.getElementById('pali-content');
        if (!contentDiv) return;

        contentDiv.innerText = "กำลังโหลด...";
        currentThaiContent = "";
        lastProcessedWord = "";
        clearHighlights();
        updatePopup(""); 
        try {
            const [paliRes, thaiRes] = await Promise.all([fetch(`b${bookNum}.txt`), fetch(`t${bookNum}.txt`)]);
            let paliText = await paliRes.text();
            paliText = paliText.replace(/^(\[[๑-๙๐-๙]+\])/gm, '<span class="pali-number" style="pointer-events: none;">$1</span>');
            contentDiv.innerHTML = paliText;
            currentThaiContent = await thaiRes.text();
        } catch (err) { contentDiv.innerText = "ไม่พบไฟล์เล่มที่ " + bookNum; }
    });
}

function getRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
        return document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos) {
            const range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
            return range;
        }
    }
    return null;
}

// ตรวจสอบการตัดคำสนธิบาลีเบื้องต้น
function checkPaliSandhi(word) {
    if (dictionary[word]) return { found: true, word: word, note: "" };

    if (word.endsWith('ติติ')) {
        let base = word.slice(0, -4) + 'ติ';
        if (dictionary[base]) return { found: true, word: base, note: `${word} [${base} + อิติ]` };
    }
    if (word.endsWith('นฺติติ')) {
        let base = word.slice(0, -6) + 'นฺติ';
        if (dictionary[base]) return { found: true, word: base, note: `${word} [${base} + อิติ]` };
    }
    if (word.endsWith('นฺติ')) {
        let base = word.slice(0, -4);
        if (dictionary[base]) return { found: true, word: base, note: `${word} [${base} + อิติ]` };
    }
    if (word.endsWith('ติ')) {
        let base = word.slice(0, -2);
        if (dictionary[base]) return { found: true, word: base, note: `${word} [${base} + อิติ]` };
    }
    if (word.endsWith('าติ')) {
        let base = word.slice(0, -2);
        if (dictionary[base]) return { found: true, word: base, note: `${word} [${base} + อิติ]` };
    }
    if (word.endsWith('มฺปิ')) {
        let base = word.slice(0, -3) + 'ํ';
        if (dictionary[base]) return { found: true, word: base, note: `${word} [${base} + อปิ]` };
    }

    return { found: false, word: word, note: "" };
}

// ฟังก์ชันล้างแถบไฮไลท์คำเก่าออก
function clearHighlights() {
    const currentHighlights = document.querySelectorAll('.highlight-pali');
    currentHighlights.forEach(el => {
        const parent = el.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        }
    });
}

// ฟังก์ชันหลักในการค้นหาและแปลคำศัพท์ตรงตำแหน่งพิกัด X, Y
function processWordAtPoint(clientX, clientY, isClickEvent = false) {
    const r = getRangeFromPoint(clientX, clientY);
    if (!r) return;

    let n = r.startContainer, o = r.startOffset, t = n.textContent;
    if (!t || n.nodeType !== Node.TEXT_NODE) return;

    let start = o, end = o;
    while (start > 0 && t[start - 1] !== ' ' && t[start - 1] !== '\n' && t[start - 1] !== '\t') start--;
    while (end < t.length && t[end] !== ' ' && t[end] !== '\n' && t[end] !== '\t') end++;
    
    let rawWord = t.substring(start, end).trim();
    if (!rawWord) return;

    const cleanWord = rawWord.replace(/^[.,;:!?"”’‘'()«»\[\]\s]+|[.,;:!?"”’‘'()«»\[\]\s]+$/g, "").trim();

    if (!isClickEvent && cleanWord === lastProcessedWord && document.getElementById('popup')?.classList.contains('active')) {
        return;
    }

    clearHighlights();

    const span = document.createElement('span');
    span.className = 'highlight-pali';
    span.textContent = rawWord;

    const range = document.createRange();
    range.setStart(n, start);
    range.setEnd(n, end);
    range.deleteContents();
    range.insertNode(span);

    const bracketMatch = rawWord.match(/\[[๑-๙๐-๙]+\]/);
    if (bracketMatch) {
        lastProcessedWord = rawWord;
        showTranslation(bracketMatch[0], span);
        return;
    }

    if (!cleanWord) {
        updatePopup("");
        lastProcessedWord = "";
        return;
    }

    lastProcessedWord = cleanWord;
    lastRequestedWord = cleanWord;

    const lookupResult = checkPaliSandhi(cleanWord);
    if (lookupResult.found) {
        const trans = dictionary[lookupResult.word];
        const label = lookupResult.note ? lookupResult.note : cleanWord;
        updatePopup(`${label} – ${trans}`, span);
        return;
    }

    updatePopup(`${cleanWord} – (กำลังให้ เณร Zen AI ช่วยแปล...)`, span);
    
    fetch(AI_TRANSLATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: cleanWord })
    })
    .then(response => {
        if (!response.ok) throw new Error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
        return response.json();
    })
    .then(data => {
        if (lastRequestedWord === cleanWord) {
            if (data && data.translation) {
                const cleanTranslation = data.translation.replace(/^.*?\s–\s/, '').trim();
                dictionary[cleanWord] = cleanTranslation;

                try {
                    let localSaved = JSON.parse(localStorage.getItem('ai_added_words') || '{}');
                    localSaved[cleanWord] = cleanTranslation;
                    localStorage.setItem('ai_added_words', JSON.stringify(localSaved));
                } catch (err) {}

                updatePopup(`${cleanWord} – ${cleanTranslation}`, span);
            } else {
                updatePopup(`${cleanWord} – ไม่พบคำแปล`, span);
            }
        }
    })
    .catch(err => {
        if (lastRequestedWord === cleanWord) {
            updatePopup(`${cleanWord} – ไม่พบคำแปลในระบบ`, span);
        }
    });
}

// ผูก Event Listeners สำหรับการชี้เมาส์ และการแตะหน้าจอ
const paliContentDiv = document.getElementById('pali-content');
if (paliContentDiv) {
    paliContentDiv.addEventListener('mousemove', (e) => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
            processWordAtPoint(e.clientX, e.clientY, false);
        }, 30);
    });

    paliContentDiv.addEventListener('click', (e) => {
        processWordAtPoint(e.clientX, e.clientY, true);
    });
}

loadDictionary();
createFloatingEditButton();

const modal = document.getElementById("about-modal");
const btn = document.getElementById("about-btn");
const closeBtn = document.querySelector(".close-btn");

if (btn) btn.onclick = () => { modal.style.display = "block"; }
if (closeBtn) closeBtn.onclick = () => { modal.style.display = "none"; }
window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; }

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .catch(err => console.error('PWA Error:', err));
    });
}