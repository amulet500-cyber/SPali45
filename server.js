const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. ฟังก์ชันแปลคำศัพท์ด้วย Gemini API
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

// 2. ฟังก์ชันอัปเดตไฟล์ mdic.txt ลง GitHub อัตโนมัติ (Auto-Save)
async function commitWordToGithub(word, translation) {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    const filePath = 'mdic.txt';

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

    // ดึงเนื้อหาปัจจุบัน และ sha ของไฟล์ mdic.txt บน GitHub
    const getRes = await fetch(apiUrl, { headers });
    if (!getRes.ok) throw new Error(`ไม่สามารถอ่านไฟล์จาก GitHub ได้: ${getRes.statusText}`);
    const fileData = await getRes.json();

    // ถอดรหัส base64 โดยลบ newlines ออกก่อนเพื่อป้องกันข้อผิดพลาดอักขระ
    const base64Content = fileData.content.replace(/\n/g, '');
    const currentText = Buffer.from(base64Content, 'base64').toString('utf-8');
    const sha = fileData.sha;

    // เช็กว่ามีคำนี้อยู่แล้วหรือยัง (ตรวจสอบทั้งเครื่องหมาย – และ =)
    if (currentText.includes(`${word} –`) || currentText.includes(`${word} =`)) {
        console.log(`คำศัพท์ [${word}] มีอยู่ใน mdic.txt แล้ว ข้ามการบันทึก`);
        return;
    }

    // ต่อคำศัพท์ใหม่ไว้บรรทัดล่างสุด
    const updatedText = currentText.trim() + `\n${word} – ${translation}`;
    const encodedContent = Buffer.from(updatedText, 'utf-8').toString('base64');

    // ส่งคำสั่ง PUT เพื่อบันทึกไฟล์ทับลง GitHub
    const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
            message: `auto: Add word translation [${word}]`,
            content: encodedContent,
            sha: sha
        })
    });

    if (!putRes.ok) {
        console.error("Commit to GitHub Failed:", await putRes.text());
    } else {
        console.log(`บันทึกคำศัพท์ [${word}] ลง GitHub เรียบร้อยแล้ว`);
    }
}

// 3. Endpoint สำหรับรับคำขอแปลจากหน้าเว็บ
app.post('/api/translate-word', async (req, res) => {
    try {
        const { word } = req.body;
        if (!word) return res.status(400).json({ error: "ไม่พบคำศัพท์ที่ส่งมา" });

        // แปลภาษาด้วย Gemini
        const translation = await translateWithGemini(word);

        // สั่งบันทึกลง GitHub ในเบื้องหลัง (Background Process)
        commitWordToGithub(word, translation).catch(err => {
            console.error("GitHub Background Task Error:", err);
        });

        // ส่งผลลัพธ์กลับไปให้หน้าเว็บทันที ไม่ต้องรอ Commit เสร็จ
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