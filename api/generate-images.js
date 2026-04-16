import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");

    // 프론트엔드에서 style 정보도 넘겨줄 수 있도록 개선 (없어도 동작함)
    const { prompt, style } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: '프롬프트가 없습니다.' });

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // 🎯 [개선점: 프롬프트 브릿지] 학생의 한국어 묘사를 Imagen 전용 영어 지시서로 변환
    const bridgeModel = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const bridgePrompt = `
      You are an elite Hollywood Cinematographer and Imagen 4.0 Prompt Engineer.
      Translate the following Korean storyboard description into a highly optimized English technical prompt.

      Korean Storyboard: "${prompt}"
      ${style ? `Visual Style Target: "${style}"` : ''}

      [STRICT DIRECTIVES]
      1. SHOW, DON'T TELL: Convert abstract emotions (e.g., 'thinking', 'sad') into physical actions, props (holding a photo/item), or facial expressions.
      2. NO WEIRD COMPOSITIONS: Absolutely NO faces inside faces or weird ghosting double-exposures unless explicitly requested as 'reflection'.
      3. Specify lighting (moody, cinematic), camera angle, and atmosphere.
      4. Output ONLY the English prompt paragraph.
    `;

    const bridgeResult = await bridgeModel.generateContent(bridgePrompt);
    const optimizedPrompt = bridgeResult.response.text().trim();

    // 기존 원본 코드 유지: 텍스트 노이즈 방지를 위한 강력한 네거티브 프롬프트 결합
    const cleanCinematicPrompt = `${optimizedPrompt}, masterpiece, 8k resolution, highly detailed, cinematic lighting, photorealistic. strictly NO TEXT, no subtitles, no speech bubbles, no words, no letters, no watermarks, clear visual representation only.`;

    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: cleanCinematicPrompt,
      config: {
        numberOfImages: 1, // 에셋 고르기 팝업 삭제에 따른 단일 생성 원복
        aspectRatio: "16:9"
      },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("이미지 생성 결과가 없습니다.");
    }

    const imgBytes = response.generatedImages[0].image.imageBytes;
    const imageUrl = `data:image/png;base64,${imgBytes}`;

    // 디버깅/로그용으로 변환된 영어 프롬프트(techPrompt)도 함께 반환하도록 개선
    return res.status(200).json({ success: true, imageUrl: imageUrl, techPrompt: optimizedPrompt });

  } catch (error) {
    console.error("Generate Images Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
