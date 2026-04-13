export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { scenario } = req.body;
    
    // 🎯 가볍고 직관적인 파싱 프롬프트 (JSON 강제 스키마 적용)
    const promptText = `
      You are an expert script supervisor. Read the following Korean scenario and extract the basic setting and character information.
      Do NOT generate complex image generation prompts. Just extract facts.
      
      [Scenario]
      ${scenario}
      
      Respond strictly in JSON format matching this schema:
      {
        "setting": "Description of the era and location in Korean (e.g., 1920년대 비오는 경성 거리)",
        "director_note": "Brief emotional tone or camera focus in Korean (e.g., 암울하고 비극적인 분위기)",
        "characters": [
          { "name": "Character Name", "desc": "Brief physical description and current emotion in Korean" }
        ]
      }
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { 
          responseMimeType: "application/json",
          maxOutputTokens: 800 // 출력 제한으로 과부하 방지
        }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error("Concept Parsing Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
