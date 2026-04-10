export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Vercel 환경변수에 GEMINI_API_KEY가 없습니다.");

    const { chars, place, scenario, note } = req.body;
    
    // 🎯 인물 간 대사 분리(Dialogue Separation) 지시어 강력 추가
    const promptText = `
      Translate the following scene into a visual English prompt for Veo 3.1 AI.
      Characters: ${chars}. Setting: ${place}.
      Action/Dialogue: "${scenario}".
      Style: ${note}.
      
      CRITICAL RULES:
      1. Describe physical actions clearly.
      2. Dialogue Separation: If there are multiple characters speaking, explicitly separate them like this:
         - [Character A name] speaking: "..." (Fluent Korean lip-sync)
         - [Character B name] speaking: "..." (Fluent Korean lip-sync)
      3. All spoken language MUST be directed as Korean.
      4. DO NOT generate text overlays on the screen.
      
      Return ONLY the English prompt string.
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const prompt = data.candidates[0].content.parts[0].text.trim();
    return res.status(200).json({ success: true, prompt: prompt });

  } catch (error) {
    console.error("Gemini Parse Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
