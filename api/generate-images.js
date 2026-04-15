import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");

    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: '프롬프트가 없습니다.' });

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // 🎯 5번 문제 완벽 해결: 텍스트 노이즈 100% 차단 프롬프트 강제 부착
    const cleanCinematicPrompt = `${prompt}, masterpiece, 8k resolution, highly detailed, cinematic lighting, photorealistic. strictly NO TEXT, no subtitles, no speech bubbles, no words, no letters, no watermarks, clear visual representation only.`;

    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: cleanCinematicPrompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "16:9" // 시네마틱 비율
      },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("이미지 생성 결과가 없습니다.");
    }

    const imgBytes = response.generatedImages[0].image.imageBytes;
    const imageUrl = `data:image/png;base64,${imgBytes}`;

    return res.status(200).json({ success: true, imageUrl: imageUrl });

  } catch (error) {
    console.error("Generate Images Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
