import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");

    const { prompt, style } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: '프롬프트가 없습니다.' });

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // 🎯 [수정됨] 최신 @google/genai SDK 문법으로 브릿지 로직 교체 (500 에러 원인 해결)
    const bridgePrompt = `
      You are an elite Hollywood Cinematographer and Imagen 4.0 Prompt Engineer.
      Translate the following Korean storyboard description into a highly optimized English technical prompt.

      Korean Storyboard: "${prompt}"
      ${style ? `Visual Style Target: "${style}"` : ''}

      [STRICT DIRECTIVES]
      1. SHOW, DON'T TELL: Convert abstract emotions into physical actions, props, or facial expressions.
      2. NO WEIRD COMPOSITIONS: Absolutely NO faces inside faces or weird ghosting double-exposures unless explicitly requested as 'reflection'.
      3. Specify lighting, camera angle, and atmosphere.
      4. Output ONLY the English prompt paragraph.
    `;

    const bridgeResult = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: bridgePrompt
    });
    const optimizedPrompt = bridgeResult.text.trim();

    // 네거티브 프롬프트 결합 (텍스트 노이즈 방지)
    const cleanCinematicPrompt = `${optimizedPrompt}, masterpiece, 8k resolution, highly detailed, cinematic lighting, photorealistic. strictly NO TEXT, no subtitles, no speech bubbles, no words, no letters, no watermarks, clear visual representation only.`;

    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: cleanCinematicPrompt,
      config: { numberOfImages: 1, aspectRatio: "16:9" },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("이미지 생성 결과가 없습니다.");
    }

    const imgBytes = response.generatedImages[0].image.imageBytes;
    const imageUrl = `data:image/png;base64,${imgBytes}`;

    return res.status(200).json({ success: true, imageUrl: imageUrl, techPrompt: optimizedPrompt });

  } catch (error) {
    console.error("Generate Images Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
