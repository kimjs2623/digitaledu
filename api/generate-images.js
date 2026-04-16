import { GoogleGenAI } from "@google/genai";

// 🎯 대기 함수
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🎯 지수 백오프 (Exponential Backoff) 재시도 로직
// 429(Rate Limit) 에러 발생 시 1초, 2초, 4초, 8초, 16초 간격으로 최대 5번 재시도
async function executeWithRetry(operation) {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await operation();
    } catch (error) {
      // 마지막 시도까지 실패하면 에러를 던짐
      if (i === delays.length) {
        throw new Error("서버 이용량이 많아 이미지 생성에 실패했습니다. (API 제한 초과)");
      }
      // 실패 시 지정된 시간(초)만큼 대기 후 재시도
      await delay(delays[i]);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");

    const { prompt, style } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: '프롬프트가 없습니다.' });

    const ai = new GoogleGenAI({ apiKey: apiKey });

    const bridgePrompt = `
      You are an elite Hollywood Cinematographer and Imagen 4.0 Prompt Engineer.
      Translate the following Korean storyboard description into a highly optimized English technical prompt.

      Korean Storyboard: "${prompt}"
      ${style ? `Visual Style Target: "${style}"` : ''}

      [STRICT DIRECTIVES]
      1. SHOW, DON'T TELL: Convert abstract emotions into physical actions, props, or facial expressions.
      2. ABSOLUTELY NO WEIRD COMPOSITIONS: Do NOT generate faces inside faces, ghosting, double-exposures, or floating heads. If the prompt implies someone is "thinking of" someone else, DO NOT draw the imagined person. Only draw the person who is currently thinking, looking sad or contemplative.
      3. Specify lighting, camera angle, and atmosphere.
      4. Output ONLY the English prompt paragraph.
    `;

    // 🎯 1단계: 프롬프트 브릿지 (재시도 로직 적용)
    const bridgeResult = await executeWithRetry(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: bridgePrompt
    }));
    
    const optimizedPrompt = bridgeResult.text.trim();

    const cleanCinematicPrompt = `${optimizedPrompt}, masterpiece, 8k resolution, highly detailed, cinematic lighting, photorealistic. strictly NO TEXT, no subtitles, no speech bubbles, no words, no letters, no watermarks, clear visual representation only.`;

    // 🎯 2단계: 이미지 생성 (가장 429 에러가 많이 터지는 곳, 재시도 로직 적용)
    const response = await executeWithRetry(() => ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: cleanCinematicPrompt,
      config: { numberOfImages: 1, aspectRatio: "16:9" },
    }));

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("이미지 생성 결과가 없습니다.");
    }

    const imgBytes = response.generatedImages[0].image.imageBytes;
    return res.status(200).json({ success: true, imageUrl: `data:image/png;base64,${imgBytes}`, techPrompt: optimizedPrompt });

  } catch (error) {
    console.error("Generate Images Error:", error);
    const userMsg = error.message.includes("API 제한 초과") ? error.message : "이미지 생성 중 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    return res.status(500).json({ success: false, message: userMsg });
  }
}
