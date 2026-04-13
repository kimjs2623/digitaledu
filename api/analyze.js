export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, scenario, note } = req.body;
    
    // 🎯 텍스트 생성 금지 규칙(Rule 4)이 복구된 프롬프트
    const promptText = `
      You are a master cinematic prompt engineer for Veo 3.1 Video AI.
      Convert the following script into a structured JSON visual storyboard.
      
      [Context]
      - Characters: ${chars}
      - Setting / Era: ${place}
      - Scenario & Dialogue: "${scenario}"
      - Director's Note: ${note}
      
      [Task & Rules]
      1. Break down the scenario into 2 to 3 logical camera shots (e.g., Wide establishing, Medium action, Extreme Close-up reaction).
      2. For each shot, define the specific camera movement and physical action.
      3. Create one "master_prompt" that combines the essence of these shots for a single 5-second video generation. (MUST include "Korean language lip-sync" if there is dialogue).
      4. CRITICAL: DO NOT generate any text overlays, subtitles, or Korean letters/characters on the screen. The video must be purely visual.
      
      Respond ONLY with a valid JSON object in this exact format:
      {
        "storyboard": [
          {
            "shot_number": 1,
            "shot_size": "Medium Shot",
            "camera_movement": "Static",
            "action": "Description of action..."
          }
        ],
        "master_prompt": "Master English prompt for Veo 3.1 encompassing the scene..."
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

    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error("Gemini Analyze Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
