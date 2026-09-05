const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 1. ให้ Express เปิดบริการไฟล์ Static ทั้งหมดในโฟลเดอร์ (index.html, script.js, style.css, ai_words.txt)
app.use(express.static(__dirname));

// 2. ส่งหน้า index.html เมื่อเปิดหน้าแรกของเว็บ (/)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. ฟังก์ชันแปลคำศัพท์ด้วย Gemini API
async function translateWithGemini(word) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const prompt = `แปลคำศัพท์ภาษาบาลีต่อไปนี้เป็นภาษาไทย สั้น กระชับ ตอบเฉพาะคำแปลภาษาไทยเท่านั้น ไม่ต้องใส่คำอธิบายเพิ่มเติม:\nคำบาลี: ${word}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "ไม่พบคำแปล";
}

// 4. ฟังก์ชันอัปเดตไฟล์ ai_words.txt ลง GitHub อัตโนมัติ (Auto-Save)
async function commitWordToGithub(word, translation) {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    const filePath = 'ai_words.txt';

    if (!owner || !repo || !token) {
        console.warn("ไม่ได้ตั้งค่า GITHUB credentials ข้ามการ Commit");
        return;
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'NodeJS-Render-Bot'
    };

    let currentText = "";
    let sha = null;

    // อ่านเนื้อหาปัจจุบันของ ai_words.txt บน GitHub
    const getRes = await fetch(apiUrl, { headers });
    if (getRes.ok) {
        const fileData = await getRes.json();
        const base64Content = fileData.content.replace(/\n/g, '');
        currentText = Buffer.from(base64Content, 'base64').toString('utf-8');
        sha = fileData.sha;
    } else if (getRes.status !== 404) {
        console.error(`ไม่สามารถอ่านไฟล์จาก GitHub ได้ (Status: ${getRes.status})`);
        return;
    }

    // เช็กว่ามีคำนี้อยู่แล้วหรือยัง
    if (currentText.includes(`${word} –`) || currentText.includes(`${word} =`)) {
        console.log(`คำศัพท์ [${word}] มีอยู่ใน ai_words.txt แล้ว ข้ามการบันทึก`);
        return;
    }

    // ต่อคำศัพท์ใหม่ไว้บรรทัดล่างสุด
    const newLine = `${word} – ${translation}`;
    const updatedText = currentText ? `${currentText.trim()}\n${newLine}` : newLine;
    const encodedContent = Buffer.from(updatedText, 'utf-8').toString('base64');

    const bodyData = {
        message: `auto: Add AI translation [${word}]`,
        content: encodedContent
    };
    if (sha) bodyData.sha = sha;

    // ส่งคำสั่ง PUT เพื่อบันทึกไฟล์ลง GitHub
    const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(bodyData)
    });

    if (!putRes.ok) {
        console.error("Commit to GitHub Failed:", await putRes.text());
    } else {
        console.log(`บันทึกคำศัพท์ [${word}] ลง ai_words.txt บน GitHub เรียบร้อยแล้ว`);
    }
}

// 5. Endpoint สำหรับรับคำขอแปลจากหน้าเว็บ
app.post('/api/translate-word', async (req, res) => {
    try {
        const { word } = req.body;
        if (!word) return res.status(400).json({ error: "ไม่พบคำศัพท์ที่ส่งมา" });

        const translation = await translateWithGemini(word);

        commitWordToGithub(word, translation).catch(err => {
            console.error("GitHub Background Task Error:", err);
        });

        res.json({ translation: `${word} – ${translation}` });

    } catch (error) {
        console.error("Translation API Error:", error);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการแปลภาษา" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});