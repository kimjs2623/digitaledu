export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });
  }

  try {
    // Vercel 환경 변수에서 Gemini API 키를 가져옵니다. (GitHub에 노출되지 않음!)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Vercel 환경 변수에 GEMINI_API_KEY가 설정되지 않았습니다.");
    }

    const { chars, event, place, novel, note } = req.body;

    const promptText = `
      You are an expert Hollywood cinematographer. I will give you the world-building details and a metaphorical novel excerpt.
      Your job is to translate the novel excerpt into a HIGHLY REALISTIC, VISUAL, and LITERAL English video prompt for an AI Video Generator (Veo 3.1).
      
      [World Building]
      Characters: ${chars}
      Main Action Context: ${event}
      Setting: ${place}
      
      [Novel Excerpt to Translate]
      "${novel}"
      
      [Director's Vibe]
      ${note}
      
      Rule 1: Remove all metaphors (e.g. "heart shattered" -> "character cries silently").
      Rule 2: Focus heavily on lighting, camera angle, character appearance, and physical movement.
      Rule 3: Ensure the characters from the 'World Building' are the ones performing the action.
      
      Respond strictly in JSON format:
      {
        "english_video_prompt": "The detailed English prompt for the video AI.",
        "korean_summary": "이 장면이 시각적으로 어떻게 연출될 것인지 학생이 이해하기 쉽게 한글로 요약한 1~2문장"
      }
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    
    return res.status(200).json({ 
      success: true, 
      english_video_prompt: result.english_video_prompt,
      korean_summary: result.korean_summary
    });

  } catch (error) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "AI 분석 중 오류가 발생했습니다: " + error.message 
    });
  }
}
