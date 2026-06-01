let dictionary = {};

const view_mode_init = "1234567890";
const cache_data_id = "1234567890";
const theme_color_code = "123456789012";
const app_config_key = view_mode_init + cache_data_id + theme_color_code; 

async function loadDictionary() {
    try {
        const response = await fetch('sys.obj');
        if (!response.ok) throw new Error("ไม่พบไฟล์ sys.obj");
        
        const arrayBuffer = await response.arrayBuffer();
        
        // ถอดรหัสด้วยคีย์ที่รวมร่างแล้ว
        const decryptedText = await decryptWithAES(arrayBuffer, app_config_key);
        
        decryptedText.split('\n').forEach(line => {
            const parts = line.split(' – '); 
            if (parts.length >= 2) {
                dictionary[parts[0].trim()] = parts.slice(1).join(' – ').trim();
            }
        });
        console.log("Dictionary loaded successfully");
    } catch (e) { 
        console.error("โหลดพจนานุกรมล้มเหลว:", e); 
        document.getElementById('selected-word').innerText = "สถานะ: พร้อมใช้งาน";
    }
}

// ฟังก์ชันถอดรหัส AES-CBC
async function decryptWithAES(buffer, keyString) {
    const iv = buffer.slice(0, 16); 
    const encryptedData = buffer.slice(16); 
    
    const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(keyString), 
        { name: "AES-CBC" }, false, ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv: iv }, key, encryptedData
    );
    
    return new TextDecoder().decode(decrypted);
}

// ส่วนควบคุมอื่นๆ คงเดิม...
document.addEventListener('contextmenu', (e) => e.preventDefault());

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

const selector = document.getElementById('book-selector');
bookNames.forEach((name, i) => {
    let opt = document.createElement('option');
    opt.value = i + 1; opt.textContent = name;
    selector.appendChild(opt);
});

selector.addEventListener('change', async (e) => {
    const bookNum = e.target.value;
    const contentDiv = document.getElementById('pali-content');
    contentDiv.innerText = "กำลังโหลด...";
    try {
        const response = await fetch(`b${bookNum}.txt`);
        contentDiv.innerText = await response.text();
    } catch (err) { contentDiv.innerText = "ไม่พบไฟล์เล่มที่ " + bookNum; }
});

document.getElementById('pali-content').addEventListener('pointerup', (e) => {
    e.preventDefault();
    const s = window.getSelection();
    if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (r) {
            let n = r.startContainer, o = r.startOffset, t = n.textContent;
            if (!t || t[o] === ' ' || t[o] === '\n') return;
            let start = o, end = o;
            while (start > 0 && t[start - 1] !== ' ' && t[start - 1] !== '\n') start--;
            while (end < t.length && t[end] !== ' ' && t[end] !== '\n') end++;
            const nr = document.createRange();
            nr.setStart(n, start); nr.setEnd(n, end);
            s.removeAllRanges(); s.addRange(nr);
        }
    }
    const word = s.toString().trim();
    document.getElementById('selected-word').innerText = word ? (dictionary[word] ? `${word} – ${dictionary[word]}` : word) : "...";
});

loadDictionary();

const modal = document.getElementById("about-modal");
const btn = document.getElementById("about-btn");
const closeBtn = document.querySelector(".close-btn");
btn.onclick = () => { modal.style.display = "block"; }
closeBtn.onclick = () => { modal.style.display = "none"; }
window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; }