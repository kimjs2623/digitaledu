export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Vercel 환경변수에 GEMINI_API_KEY가 없습니다.");

    const { chars, place, scenario } = req.body;
    
    // 🎯 정식 버전인 gemini-2.5-flash 모델 적용
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ 
            text: `You are a master concept artist for a Hollywood movie. 
            Analyze the following context to create highly detailed ENGLISH image generation prompts for Imagen.
            
            [Context]
            - Setting / Era: ${place}
            - Current Scenario: ${scenario}
            - Characters List: ${JSON.stringify(chars)}
            
            [Task 1: Character Portraits (NO BACKGROUND)]
            For each character, write a detailed SOLO character design prompt. 
            CRITICAL RULE FOR CHARACTERS: The background MUST be a purely solid white studio backdrop. Focus entirely on their era-appropriate clothing and facial expression.
            
            [Task 2: Background Concept (NO CHARACTERS)]
            Write a detailed prompt for the setting. 
            CRITICAL RULE FOR BACKGROUND: It MUST be completely empty. Use keywords: "Empty scenery, absolutely no people, no characters, purely environment".
            
            Respond strictly with a valid JSON object in this format:
            {
              "charPrompts": {
                "char_0": "Prompt for character 1...",
                "char_1": "Prompt for character 2..."
              },
              "bgPrompt": "Prompt for the empty background..."
            }` 
          }] 
        }],
        generationConfig: { 
          responseMimeType: "application/json" 
        }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    return res.status(200).json({ success: true, prompts: result });

  } catch (error) {
    console.error("Concept Expansion Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
