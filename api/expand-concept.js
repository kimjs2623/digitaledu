/**
 * Gemini 2.5 Flash 모델을 사용하여 시나리오와 캐릭터 설정을 분석하고,
 * Imagen 4.0용 개별 이미지 생성 프롬프트를 설계하는 API 핸들러입니다.
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

    const { chars, place, scenario } = req.body;

    // 🎯 Gemini 2.5 Flash에게 시각적 컨셉 설계를 요청하는 프롬프트
    const systemPrompt = `You are a master concept artist for a cinematic production. 
    Your task is to analyze the provided context and create highly detailed, era-appropriate image generation prompts for Imagen 4.0.`;

    const userQuery = `
      [Context]
      - Setting / Era: ${place}
      - Current Scenario: ${scenario}
      - Characters List: ${JSON.stringify(chars)}
      
      [Requirements]
      1. Character Portraits: For each character, create a SOLO portrait prompt. 
         - CRITICAL: Use "solid plain white background, isolated character" to ensure no background is generated.
         - Focus on historical/contextual accuracy of clothing, textures, and facial expressions.
      2. Background Concept: Create an empty environment prompt.
         - CRITICAL: Use "empty scenery, absolutely no people, devoid of humans, no characters" to ensure no people are generated.
      
      Respond strictly in JSON format:
      {
        "charPrompts": {
          "char_id_1": "Full prompt for character 1...",
          "char_id_2": "Full prompt for character 2..."
        },
        "bgPrompt": "Full prompt for the empty background..."
      }
    `;

    // Gemini 2.5 Flash API 호출 (정식 버전 사용)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { 
          responseMimeType: "application/json" 
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    // 결과 텍스트 추출 및 파싱
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error("AI 분석 결과가 비어 있습니다.");
    }

    const prompts = JSON.parse(resultText);

    return res.status(200).json({
      success: true,
      prompts: prompts
    });

  } catch (error) {
    console.error("Concept Expansion Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "시안 분석 중 오류가 발생했습니다."
    });
  }
}
