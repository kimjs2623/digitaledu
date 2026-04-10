export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Vercel 환경변수에 GEMINI_API_KEY가 없습니다.");

    const { chars, place, scenario } = req.body;
    
    // 🎯 인물은 단색 배경(Solid plain background)으로, 배경은 인물 없이(Empty) 그리도록 철저히 분리
    const promptText = `
      You are a master concept artist for a Hollywood movie. 
      Analyze the following context to create highly detailed ENGLISH image generation prompts for Imagen 4.0.
      
      [Context]
      - Setting / Era: ${place}
      - Current Scenario: ${scenario}
      - Characters List: ${JSON.stringify(chars)}
      
      [Task 1: Character Portraits (NO BACKGROUND)]
      For each character, write a detailed SOLO character design prompt. 
      CRITICAL RULE FOR CHARACTERS: The background MUST be a purely solid white or solid grey studio backdrop (e.g., "Solid plain white background, isolated character"). DO NOT generate any environmental details behind the character. Focus entirely on their era-appropriate clothing, facial expression, and physical traits.
      
      [Task 2: Background Concept (NO CHARACTERS)]
      Write a detailed prompt for the setting. 
      CRITICAL RULE FOR BACKGROUND: It MUST be completely empty. Use keywords: "Empty scenery, absolutely no people, devoid of humans, no characters, purely architectural or landscape".
      
      Respond strictly with a valid JSON object in this format (do not use markdown formatting like \`\`\`json):
      {
        "prompts": {
          "charPrompts": {
            "char_0": "Prompt for character 1...",
            "char_1": "Prompt for character 2..."
          },
          "bgPrompt": "Prompt for the empty background..."
        }
      }
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let jsonString = data.candidates[0].content.parts[0].text.trim();
    // 마크다운 제거 처리 (안전성 강화)
    if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/```json\n?/, '').replace(/```\n?$/, '');
    }

    const result = JSON.parse(jsonString);
    return res.status(200).json({ success: true, prompts: result.prompts || result });

  } catch (error) {
    console.error("Concept Expansion Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
