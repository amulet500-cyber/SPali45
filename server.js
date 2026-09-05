const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 1. ให้ Express เปิดบริการไฟล์ Static (index.html, script.js, style.css)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// 2. AI ROUTER: ศูนย์รวมระบบ AI ฟรีหลายค่าย (เน้นแปลสั้น กระชับ)
// ============================================================
async function translateWithAIRouter(word) {
    // คำสั่งเน้นย้ำให้ AI ตอบเฉพาะคำแปลสั้นๆ ห้ามอธิบาย ห้ามแยกศัพท์
    const prompt = `แปลคำศัพท์บาลีต่อไปนี้เป็นภาษาไทย ตอบเฉพาะคำแปลสั้นๆ กระชับ (1-3 คำ) เท่านั้น ห้ามใส่คำอธิบายเพิ่มเติม ห้ามแยกศัพท์ ห้ามขึ้นบรรทัดใหม่ และห้ามใช้สัญลักษณ์พิเศษ:\nคำบาลี: ${word}`;
    const routes = [];

    // --- ค่ายที่ 1: Google Gemini Direct ---
    if (process.env.GEMINI_API_KEY) {
        const geminiModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        geminiModels.forEach(model => {
            routes.push({
                provider: 'Google Gemini',
                model: model,
                execute: async () => {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                    });
                    if (!res.ok) throw new Error(`Status ${res.status}`);
                    const data = await res.json();
                    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                }
            });
        });
    }

    // --- ค่ายที่ 2: Groq Cloud ---
    if (process.env.GROQ_API_KEY) {
        const groqModels = ['llama-3.3-70b-versatile', 'llama3-8b-8192', 'gemma2-9b-it'];
        groqModels.forEach(model => {
            routes.push({
                provider: 'Groq Cloud',
                model: model,
                execute: async () => {
                    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [{ role: 'user', content: prompt }]
                        })
                    });
                    if (!res.ok) throw new Error(`Status ${res.status}`);
                    const data = await res.json();
                    return data.choices?.[0]?.message?.content?.trim();
                }
            });
        });
    }

    // --- ค่ายที่ 3: OpenRouter ---
    if (process.env.OPENROUTER_API_KEY) {
        const openRouterFreeModels = [
            'google/gemini-2.0-flash-exp:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'deepseek/deepseek-r1-distill-llama-70b:free',
            'qwen/qwen-2.5-72b-instruct:free',
            'mistralai/mistral-7b-instruct:free'
        ];
        openRouterFreeModels.forEach(model => {
            routes.push({
                provider: 'OpenRouter Free',
                model: model,
                execute: async () => {
                    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                            'Content-Type': 'application/json',
                            'HTTP-Referer': 'https://spali45.onrender.com',
                            'X-Title': 'Pali Dictionary'
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [{ role: 'user', content: prompt }]
                        })
                    });
                    if (!res.ok) throw new Error(`Status ${res.status}`);
                    const data = await res.json();
                    return data.choices?.[0]?.message?.content?.trim();
                }
            });
        });
    }

    // วนลูปยิง Router เรียกใช้ทีละตัวตามลำดับ
    for (const route of routes) {
        try {
            const translation = await route.execute();
            if (translation) {
                console.log(`[AI Router Success] แปลสำเร็จโดย: ${route.provider} (${route.model})`);
                return translation;
            }
        } catch (err) {
            console.warn(`[AI Router Fallback] ${route.provider} (${route.model}) ขัดข้อง: ${err.message}`);
        }
    }

    throw new Error("ขออภัยครับ ระบบ AI ทุกค่ายขัดข้องชั่วคราว");
}

// ============================================================
// 3. ฟังก์ชันอัปเดตไฟล์ ai_words.txt ลง GitHub (พร้อมระบบ Log แจ้งเตือน)
// ============================================================
async function commitWordToGithub(word, translation) {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    const filePath = 'ai_words.txt';

    if (!owner || !repo || !token) {
        console.error("[GitHub Error] ขาดการตั้งค่า Environment Variables บน Render");
        return;
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'NodeJS-Render-Bot'
    };

    try {
        let currentText = "";
        let sha = null;

        const getRes = await fetch(apiUrl, { headers });
        if (getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
            if (fileData.content) {
                const base64Content = fileData.content.replace(/\n/g, '');
                currentText = Buffer.from(base64Content, 'base64').toString('utf-8');
            }
        } else if (getRes.status !== 404) {
            console.error(`[GitHub Error] อ่านไฟล์ไม่สำเร็จ Status: ${getRes.status}`);
            return;
        }

        // เช็กว่ามีคำนี้อยู่ในไฟล์แล้วหรือยัง
        if (currentText.includes(word)) {
            console.log(`[GitHub Info] มีคำว่า [${word}] ใน ai_words.txt เรียบร้อยแล้ว`);
            return;
        }

        // คลีนข้อความให้เหลือบรรทัดเดียว รักษารูปแบบ
        const cleanTranslation = translation.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
        const newLine = `${word} – ${cleanTranslation}`;
        const updatedText = currentText.trim() ? `${currentText.trim()}\n${newLine}` : newLine;
        const encodedContent = Buffer.from(updatedText, 'utf-8').toString('base64');

        const bodyData = {
            message: `auto: Add AI translation [${word}]`,
            content: encodedContent
        };
        if (sha) bodyData.sha = sha;

        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers,
            body: JSON.stringify(bodyData)
        });

        if (putRes.ok) {
            console.log(`[GitHub Success] บันทึกคำศัพท์ [${word}] ลง ai_words.txt เรียบร้อยแล้ว`);
        } else {
            const errData = await putRes.json();
            console.error(`[GitHub Error ${putRes.status}]: ${errData.message}`);
        }
    } catch (err) {
        console.error("[GitHub Exception]:", err.message);
    }
}

// ============================================================
// 4. Endpoint สำหรับรับคำขอแปลจากหน้าเว็บ
// ============================================================
app.post('/api/translate-word', async (req, res) => {
    try {
        const { word } = req.body;
        if (!word) return res.status(400).json({ error: "ไม่พบคำศัพท์ที่ส่งมา" });

        // แปลภาษาผ่าน AI Router
        const rawTranslation = await translateWithAIRouter(word);

        // คลีนข้อความก่อนแสดงผล
        const translation = rawTranslation.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();

        // บันทึกลง GitHub ในเบื้องหลัง
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