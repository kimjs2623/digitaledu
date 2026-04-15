import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");

    // 🎯 count 변수를 받아 여러 장의 시안을 생성할 수 있도록 추가 (사전 제작 단계용)
    const { prompt, count = 1 } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: '프롬프트가 없습니다.' });

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // 텍스트 노이즈 방지를 위한 강력한 네거티브 프롬프트 결합
    const cleanCinematicPrompt = `${prompt}, masterpiece, 8k resolution, highly detailed, cinematic lighting, photorealistic. strictly NO TEXT, no subtitles, no speech bubbles, no words, no letters, no watermarks, clear visual representation only.`;

    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: cleanCinematicPrompt,
      config: {
        numberOfImages: count > 3 ? 3 : count, // 최대 3장까지만 허용 (속도 및 크레딧 보호)
        aspectRatio: "16:9"
      },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("이미지 생성 결과가 없습니다.");
    }

    // 배열로 반환
    const imageUrls = response.generatedImages.map(img => `data:image/png;base64,${img.image.imageBytes}`);

    // 기존 단일 imageUrl과 다중 imageUrls 모두 지원하도록 응답
    return res.status(200).json({ success: true, imageUrl: imageUrls[0], imageUrls: imageUrls });

  } catch (error) {
    console.error("Generate Images Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
