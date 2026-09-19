let dictionary = {};
let currentThaiContent = "";
let lastRequestedWord = ""; 
let lastProcessedWord = "";
let hoverTimer = null;
let localUpMdicHandle = null; 

// ตัวแปรเก็บขนาดตัวอักษร
let currentFontSize = parseFloat(localStorage.getItem('pali_font_size')) || 1.15;

const AI_TRANSLATE_URL = "/api/translate-word";

// ฟังก์ชันปรับขนาดตัวหนังสือในส่วนเนื้อหาพระไตรปิฎก
function applyFontSize() {
    const paliContent = document.getElementById('pali-content');
    if (paliContent) {
        paliContent.style.fontSize = `${currentFontSize}rem`;
        paliContent.style.lineHeight = `${currentFontSize * 1.65}rem`;
    }
    localStorage.setItem('pali_font_size', currentFontSize);
}

// ฟังก์ชันสร้าง QR Code
function generateQRCode() {
    const targetUrl = encodeURIComponent("https://amulet500-cyber.github.io/SPali45/");
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${targetUrl}`;
    
    const qrImg = document.getElementById('app-qrcode');
    if (qrImg) qrImg.src = qrSrc;

    const modalQrImg = document.getElementById('modal-qrcode');
    if (modalQrImg) modalQrImg.src = qrSrc;
}

// บันทึกตำแหน่งอ่านล่าสุด (Auto-Bookmark)
window.addEventListener('scroll', () => {
    let st = window.pageYOffset || document.documentElement.scrollTop;
    const currentBook = document.getElementById('book-selector')?.value;
    if (currentBook) {
        localStorage.setItem(`pali_scroll_pos_b${currentBook}`, st);
    }
}, { passive: true });

// แปลงตัวเลขอารบิกเป็นเลขไทย
function toThaiNumerals(numStr) {
    const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
    return numStr.toString().replace(/[0-9]/g, w => thaiDigits[+w]);
}

// ฟังก์ชันกระโดดไปยังเลขข้อ [๑]
function jumpToTopicPrompt() {
    const userInput = prompt("กรอกเลขข้อที่ต้องการอ่าน (เช่น 15 หรือ ๑๕):");
    if (!userInput || !userInput.trim()) return;

    let rawVal = userInput.trim();
    let thaiVal = toThaiNumerals(rawVal);
    let targetText = `[${thaiVal}]`;

    const spanList = document.querySelectorAll('.pali-number');
    let found = false;

    spanList.forEach(span => {
        if (span.textContent.trim() === targetText) {
            span.scrollIntoView({ behavior: 'smooth', block: 'center' });
            span.style.transition = 'background-color 0.5s';
            span.style.backgroundColor = '#ff6f00';
            setTimeout(() => { span.style.backgroundColor = ''; }, 2000);
            found = true;
        }
    });

    if (!found) {
        alert(`ไม่พบข้อ ${targetText} ในเล่มนี้ครับ`);
    }
}

// ฟังก์ชันวนสลับธีมปรับแสงการอ่าน
function cycleTheme() {
    const themes = [
        { key: 'theme-sepia', icon: '📜', name: 'ถนอมสายตา' },
        { key: 'theme-dark', icon: '🌙', name: 'โหมดมืด' },
        { key: 'theme-light', icon: '☀️', name: 'โหมดสว่าง' }
    ];

    let currentTheme = localStorage.getItem('pali_theme') || 'theme-sepia';
    let currentIndex = themes.findIndex(t => t.key === currentTheme);
    let nextIndex = (currentIndex + 1) % themes.length;
    let nextTheme = themes[nextIndex];

    document.body.className = nextTheme.key;
    localStorage.setItem('pali_theme', nextTheme.key);

    const themeBtn = document.getElementById('fab-theme-btn');
    if (themeBtn) {
        themeBtn.innerHTML = nextTheme.icon;
        themeBtn.title = `โหมดปรับแสง: ${nextTheme.name}`;
    }
}

// ฟังก์ชันสร้างกลุ่มปุ่มลอยข้างขวา (FAB Panel) รวมทุกเครื่องมือ
function createFloatingControls() {
    if (document.getElementById('fab-controls-container')) return;

    const container = document.createElement('div');
    container.id = 'fab-controls-container';
    container.style.cssText = `
        position: fixed;
        bottom: 16px;
        right: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 9999;
        align-items: center;
        max-height: 85vh;
        overflow-y: auto;
        padding-right: 4px;
    `;

    // 1. ปุ่มปรับแสง/ธีมอ่าน (📜/🌙/☀️)
    const currentTheme = localStorage.getItem('pali_theme') || 'theme-sepia';
    let initialIcon = '📜';
    if (currentTheme === 'theme-dark') initialIcon = '🌙';
    if (currentTheme === 'theme-light') initialIcon = '☀️';

    const btnTheme = document.createElement('button');
    btnTheme.id = 'fab-theme-btn';
    btnTheme.innerHTML = initialIcon;
    btnTheme.title = 'ปรับแสง/ธีมการอ่าน';
    btnTheme.style.cssText = getFabStyle('#ffffff', '#3e2723');
    btnTheme.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleTheme();
    });

    // 2. ปุ่มไปที่หัวข้อ/เลขข้อ (🎯)
    const btnJump = document.createElement('button');
    btnJump.innerHTML = '🎯';
    btnJump.title = 'ค้นหา/กระโดดไปที่เลขข้อ [๑]';
    btnJump.style.cssText = getFabStyle('#ffffff', '#3e2723');
    btnJump.addEventListener('click', (e) => {
        e.stopPropagation();
        jumpToTopicPrompt();
    });

    // 3. ปุ่มแสดง QR Code (📱)
    const btnQr = document.createElement('button');
    btnQr.innerHTML = '📱';
    btnQr.title = 'แสดง QR Code สแกนเข้าใช้งาน';
    btnQr.style.cssText = getFabStyle('#ffffff', '#3e2723');
    btnQr.addEventListener('click', (e) => {
        e.stopPropagation();
        const qrModal = document.getElementById('qr-modal');
        if (qrModal) qrModal.style.display = 'block';
    });

    // 4. ปุ่มส่งออกศัพท์ (📥)
    const btnExport = document.createElement('button');
    btnExport.innerHTML = '📥';
    btnExport.title = 'ส่งออกคำศัพท์ที่แก้ไข (Export)';
    btnExport.style.cssText = getFabStyle('#ffffff', '#3e2723');
    btnExport.addEventListener('click', (e) => {
        e.stopPropagation();
        exportWords();
    });

    // 5. ปุ่มนำเข้าศัพท์ (📤)
    const btnImport = document.createElement('button');
    btnImport.innerHTML = '📤';
    btnImport.title = 'นำเข้าคำศัพท์ที่แก้ไข (Import)';
    btnImport.style.cssText = getFabStyle('#ffffff', '#3e2723');
    btnImport.addEventListener('click', (e) => {
        e.stopPropagation();
        const fileInput = document.getElementById('import-file-input');
        if (fileInput) fileInput.click();
    });

    // 6. ปุ่มเกี่ยวกับผู้เขียน (ℹ️)
    const btnAbout = document.createElement('button');
    btnAbout.innerHTML = 'ℹ️';
    btnAbout.title = 'เกี่ยวกับผู้เขียน';
    btnAbout.style.cssText = getFabStyle('#ffffff', '#3e2723');
    btnAbout.addEventListener('click', (e) => {
        e.stopPropagation();
        const aboutModal = document.getElementById('about-modal');
        if (aboutModal) aboutModal.style.display = 'block';
    });

    // 7. ปุ่มขยายตัวหนังสือ (🔍+)
    const btnZoomIn = document.createElement('button');
    btnZoomIn.innerHTML = '🔍+';
    btnZoomIn.title = 'ขยายขนาดตัวหนังสือ';
    btnZoomIn.style.cssText = getFabStyle('#ffffff', '#3e2723');
    btnZoomIn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentFontSize < 2.5) {
            currentFontSize = Math.round((currentFontSize + 0.1) * 100) / 100;
            applyFontSize();
        }
    });

    // 8. ปุ่มย่อตัวหนังสือ (🔍-)
    const btnZoomOut = document.createElement('button');
    btnZoomOut.innerHTML = '🔍-';
    btnZoomOut.title = 'ย่อขนาดตัวหนังสือ';
    btnZoomOut.style.cssText = getFabStyle('#ffffff', '#3e2723');
    btnZoomOut.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentFontSize > 0.8) {
            currentFontSize = Math.round((currentFontSize - 0.1) * 100) / 100;
            applyFontSize();
        }
    });

    // 9. ปุ่มแก้ไขคำแปล (✏️)
    const btnEdit = document.createElement('button');
    btnEdit.id = 'fab-edit-btn';
    btnEdit.innerHTML = '✏️';
    btnEdit.title = 'แก้ไขคำแปลคำศัพท์ที่เลือก';
    btnEdit.style.cssText = getFabStyle('#c4a482', '#3e2723');
    btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerEditCurrentWord();
    });

    container.appendChild(btnTheme);
    container.appendChild(btnJump);
    container.appendChild(btnQr);
    container.appendChild(btnExport);
    container.appendChild(btnImport);
    container.appendChild(btnAbout);
    container.appendChild(btnZoomIn);
    container.appendChild(btnZoomOut);
    container.appendChild(btnEdit);

    document.body.appendChild(container);
}

// รูปแบบสไตล์ของปุ่มลอยขนาดพอดีกระชับ
function getFabStyle(bgColor, textColor) {
    return `
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background-color: ${bgColor};
        color: ${textColor};
        border: 2px solid #5d4037;
        font-size: 15px;
        font-weight: bold;
        box-shadow: 0 4px 8px rgba(0,0,0,0.25);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.15s, background-color 0.15s;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        flex-shrink: 0;
    `;
}

// ฟังก์ชันส่งออกคำศัพท์
function exportWords() {
    const data = localStorage.getItem('upmdic_edits') || '';
    if (!data.trim()) {
        alert("ยังไม่มีรายการคำศัพท์ที่ถูกแก้ไขเพิ่มเติมครับ");
        return;
    }
    const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'upmdic_edits.txt';
    a.click();
    URL.revokeObjectURL(url);
}

// ระบบนำเข้าคำศัพท์
function setupImportSystem() {
    const importInput = document.getElementById('import-file-input');
    if (importInput) {
        importInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                const text = evt.target.result;
                if (text) {
                    parseAndAddToDict(text);
                    let existing = localStorage.getItem('upmdic_edits') || '';
                    localStorage.setItem('upmdic_edits', existing + '\n' + text);
                    alert("นำเข้าคำศัพท์แก้ไขเพิ่มเติมเรียบร้อยแล้วครับ!");
                }
            };
            reader.readAsText(file);
        });
    }
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

// ฟังก์ชันแยกตัดบรรทัดเข้าพจนานุกรม
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
        <div style="display: flex; gap: 8px; align-items: center; pointer-events: auto;">
            <span style="color: #3e2723; font-weight: bold; white-space: nowrap; font-size: 1.2rem;">${paliWord} –</span>
            <input type="text" id="edit-trans-input" value="${currentTranslation}" 
                   style="font-size: 1.1rem; padding: 6px 10px; border-radius: 6px; border: 1.5px solid #fbc02d; background: #ffffff; color: #3e2723; outline: none; width: 200px; font-family: inherit;">
            <button id="save-trans-btn" style="padding: 6px 12px; font-size: 1rem; border: none; background: #fbc02d; color: #3e2723; border-radius: 6px; cursor: pointer; font-weight: bold; white-space: nowrap;">บันทึก</button>
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

        let topPos = rect.top + scrollTop - 10;
        if (rect.top < 70) {
            topPos = rect.bottom + scrollTop + 10;
            popup.style.transform = 'translate(0, 0)';
        } else {
            popup.style.transform = 'translate(0, -100%)';
        }

        let leftPos = rect.left + scrollLeft;
        popup.style.top = topPos + 'px';
        popup.style.left = leftPos + 'px';

        requestAnimationFrame(() => {
            const popupWidth = popup.offsetWidth || 240;
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
        if (!bookNum) return;

        localStorage.setItem('pali_last_book', bookNum);
        await loadBookContent(bookNum);
    });
}

// ฟังก์ชันโหลดเนื้อหาเล่มพระไตรปิฎก
async function loadBookContent(bookNum) {
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
        applyFontSize();

        // ย้อนกลับไปยังตำแหน่งอ่านล่าสุดในเล่มนี้ (Auto-Bookmark)
        const savedScroll = localStorage.getItem(`pali_scroll_pos_b${bookNum}`);
        if (savedScroll) {
            setTimeout(() => { window.scrollTo({ top: parseInt(savedScroll), behavior: 'smooth' }); }, 200);
        }
    } catch (err) { 
        contentDiv.innerText = "ไม่พบไฟล์เล่มที่ " + bookNum; 
    }
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

// เรียกใช้งานฟังก์ชันเริ่มต้นทั้งหมด
loadDictionary();
createFloatingControls();
applyFontSize();
generateQRCode();
setupImportSystem();

// โหลดธีมตั้งต้น
const savedTheme = localStorage.getItem('pali_theme') || 'theme-sepia';
document.body.className = savedTheme;

// โหลดเล่มล่าสุดที่เคยเปิดค้างไว้
const lastBook = localStorage.getItem('pali_last_book');
if (lastBook && selector) {
    selector.value = lastBook;
    loadBookContent(lastBook);
}

// จัดการ Modal ต่างๆ
const aboutModal = document.getElementById("about-modal");
const closeAboutBtn = document.getElementById("close-about-modal");
if (closeAboutBtn) closeAboutBtn.onclick = () => { aboutModal.style.display = "none"; }

const qrModal = document.getElementById("qr-modal");
const closeQrBtn = document.getElementById("close-qr-modal");
if (closeQrBtn) closeQrBtn.onclick = () => { qrModal.style.display = "none"; }

window.onclick = (event) => { 
    if (event.target == aboutModal) aboutModal.style.display = "none"; 
    if (event.target == qrModal) qrModal.style.display = "none"; 
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .catch(err => console.error('PWA Error:', err));
    });
}