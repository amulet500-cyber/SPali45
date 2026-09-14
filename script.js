let dictionary = {};
let currentThaiContent = "";
let lastRequestedWord = ""; 
let lastProcessedWord = "";
let hoverTimer = null;

// เรียก API บน Server ตัวเองโดยตรง
const AI_TRANSLATE_URL = "/api/translate-word";

// โหลดพจนานุกรม (โหลดทั้ง mdic.txt และ ai_words.txt เข้าหน่วยความจำ RAM)
async function loadDictionary() {
    try {
        const cacheBuster = `?t=${Date.now()}`;

        // 1. โหลดไฟล์พจนานุกรมหลัก (mdic.txt หรือ sys.obj)
        let response = await fetch(`mdic.txt${cacheBuster}`, { cache: 'no-store' });
        if (!response.ok) {
            response = await fetch(`sys.obj${cacheBuster}`, { cache: 'no-store' });
        }
        if (response.ok) {
            const text = await response.text();
            text.split('\n').forEach(line => {
                const parts = line.split(' – ');
                if (parts.length >= 2) {
                    dictionary[parts[0].trim()] = parts.slice(1).join(' – ').trim();
                }
            });
        }

        // 2. โหลดไฟล์ ai_words.txt (คำศัพท์ที่ AI เคยช่วยแปลไว้บน GitHub)
        try {
            const aiResponse = await fetch(`ai_words.txt${cacheBuster}`, { cache: 'no-store' });
            if (aiResponse.ok) {
                const aiText = await aiResponse.text();
                aiText.split('\n').forEach(line => {
                    const parts = line.split(' – ');
                    if (parts.length >= 2) {
                        dictionary[parts[0].trim()] = parts.slice(1).join(' – ').trim();
                    }
                });
            }
        } catch (aiErr) {
            console.log("ยังไม่มีไฟล์ ai_words.txt บน GitHub หรือโหลดไม่สำเร็จ (ข้ามได้):", aiErr);
        }

        // 3. ดึงคำแปลเพิ่มเติมที่เคยบันทึกไว้ใน LocalStorage มาทับซ้อน
        const localSaved = localStorage.getItem('ai_added_words');
        if (localSaved) {
            try {
                const extraDict = JSON.parse(localSaved);
                Object.assign(dictionary, extraDict);
            } catch (jsonErr) {
                console.error("Error parsing ai_added_words from localStorage:", jsonErr);
            }
        }
    } catch (e) { 
        console.error("โหลดพจนานุกรมล้มเหลว:", e); 
    }
}

// ส่งออกพจนานุกรมเป็นไฟล์ข้อความ Plain Text
async function exportNewSysObj() {
    let textLines = [];
    for (const [word, trans] of Object.entries(dictionary)) {
        textLines.push(`${word} – ${trans}`);
    }
    const fullText = textLines.join('\n');
    
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'mdic.txt';
    link.click();
}

// ฟังก์ชันแสดงและจัดการตำแหน่งป๊อปอัป
function updatePopup(text, targetElement = null, isBottomMode = false) {
    const popup = document.getElementById('popup');
    if (!popup) return;

    if (!text || text.trim() === "") {
        popup.classList.remove('active', 'bottom-mode');
        return;
    }

    popup.innerText = text;

    // โหมดแปลเนื้อหาตัวเลข [๑] : ตรึงขอบล่างจอ
    if (isBottomMode) {
        popup.classList.add('bottom-mode', 'active');
        popup.style.top = '';
        popup.style.left = '';
        popup.style.transform = '';
        return;
    }

    // โหมดแปลคำศัพท์ : Label ลอยชิดซ้ายคำศัพท์
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
    if (!rawWord) {
        if (!isClickEvent) {
            clearHighlights();
            updatePopup("");
            lastProcessedWord = "";
        }
        return;
    }

    const cleanWord = rawWord.replace(/^[.,;:!?"”’‘'()«»\[\]\s]+|[.,;:!?"”’‘'()«»\[\]\s]+$/g, "").trim();

    // หากเป็นคำเดิมที่แสดงอยู่แล้ว ให้ข้ามการประมวลผลซ้ำ (เว้นแต่เป็นการกดคลิก)
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

    // ตรวจสอบว่าเป็นข้อความแปลตามหมวด [๑] หรือไม่
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

    // ตรวจสอบในพจนานุกรม (ค้นรวมทั้ง mdic.txt, ai_words.txt และ LocalStorage)
    const lookupResult = checkPaliSandhi(cleanWord);
    if (lookupResult.found) {
        const trans = dictionary[lookupResult.word];
        const label = lookupResult.note ? lookupResult.note : cleanWord;
        updatePopup(`${label} – ${trans}`, span);
        return;
    }

    // ถ้าค้นในพจนานุกรมไม่พบ ส่งให้ เณร Zen AI ช่วยแปล
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
                
                // 1. บันทึกเข้า RAM ชั่วคราวเพื่อให้แสดงผลทันที
                dictionary[cleanWord] = cleanTranslation;

                // 2. บันทึกลง LocalStorage ของเครื่องผู้ใช้
                try {
                    let localSaved = JSON.parse(localStorage.getItem('ai_added_words') || '{}');
                    localSaved[cleanWord] = cleanTranslation;
                    localStorage.setItem('ai_added_words', JSON.stringify(localSaved));
                } catch (err) {
                    console.error("Error saving to localStorage:", err);
                }

                // 3. อัปเดต Popup แสดงผลคำแปล
                updatePopup(`${cleanWord} – ${cleanTranslation}`, span);
            } else {
                updatePopup(`${cleanWord} – ไม่พบคำแปล`, span);
            }
        }
    })
    .catch(err => {
        console.error("AI Translation Error:", err);
        if (lastRequestedWord === cleanWord) {
            updatePopup(`${cleanWord} – ไม่พบคำแปลในระบบ`, span);
        }
    });
}

// ผูก Event Listeners สำหรับการชี้เมาส์ (Hover) และการคลิก/แตะหน้าจอ
const paliContentDiv = document.getElementById('pali-content');
if (paliContentDiv) {
    // 1. เลื่อนเมาส์ชี้เพื่อแปลคำศัพท์ (สำหรับ Desktop / PC)
    paliContentDiv.addEventListener('mousemove', (e) => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
            processWordAtPoint(e.clientX, e.clientY, false);
        }, 30); // หน่วง 30ms เพื่อความลื่นไหลของ UI
    });

    // 2. คลิกเพื่อแปลคำศัพท์ (สำหรับ Mobile / Tablet หรือคลิกซ้ำ)
    paliContentDiv.addEventListener('click', (e) => {
        processWordAtPoint(e.clientX, e.clientY, true);
    });

    // 3. เมื่อเมาส์ออกจากพื้นที่อ่าน ให้ซ่อนป๊อปอัปและล้างไฮไลท์
    paliContentDiv.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimer);
        clearHighlights();
        updatePopup("");
        lastProcessedWord = "";
    });
}

loadDictionary();

const modal = document.getElementById("about-modal");
const btn = document.getElementById("about-btn");
const closeBtn = document.querySelector(".close-btn");

if (btn) btn.onclick = () => { modal.style.display = "block"; }
if (closeBtn) closeBtn.onclick = () => { modal.style.display = "none"; }
window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; }