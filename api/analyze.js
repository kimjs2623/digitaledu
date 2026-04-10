/**
 * Gemini 2.5 Flash 모델을 사용하여 시나리오를 분석하고,
 * Veo 3.1 비디오 생성 AI를 위한 최종 연출 프롬프트를 작성하는 API 핸들러입니다.
 * 특히 인물 간의 대사 분리와 립싱크 연출을 최적화합니다.
 */

export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Vercel 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다.");
    }

    const { chars, place, scenario, note } = req.body;

    // 🎯 Gemini 2.5 Flash에게 비디오 연출 프롬프트 작성을 요청
    // Dialogue Separation과 Korean Lip-sync 규칙을 강력하게 주입합니다.
    const promptText = `
      You are an expert cinematic prompt engineer for Veo 3.1 Video AI.
      Convert the following script into a highly detailed, professional visual prompt.
      
      [Context]
      - Characters: ${chars}
      - Setting / Era: ${place}
      - Scenario & Dialogue: "${scenario}"
      - Director's Note: ${note}
      
      [Critical Production Rules]
      1. Dialogue Separation: If multiple characters speak, explicitly describe each speaker's visual action and their dialogue instructions separately.
      2. Authentic Lip-Sync: For every character with lines, specify "Fluent Korean language lip-sync" and "natural mouth movements matching the dialogue".
      3. Cinematic Fidelity: Describe textures, lighting (e.g., volumetric, Rembrandt), and camera movements (e.g., slow zoom-in, tracking shot).
      4. Language: The final output prompt must be in English, but the character's speech must be directed as Korean.
      5. No Overlays: DO NOT include any text or subtitles on the screen.
      
      Return ONLY the final English prompt string without any preamble or quotes.
    `;

    // Gemini 2.5 Flash API 호출 (정식 버전)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    // 분석된 프롬프트 추출
    const resultPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!resultPrompt) {
      throw new Error("AI 연출 분석 결과가 비어 있습니다.");
    }

    return res.status(200).json({
      success: true,
      prompt: resultPrompt
    });

  } catch (error) {
    console.error("Gemini Analyze Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "영상 연출 분석 중 오류가 발생했습니다."
    });
  }
}
