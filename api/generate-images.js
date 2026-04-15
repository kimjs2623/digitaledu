import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 없습니다.");

    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: '프롬프트가 없습니다.' });

    // 🎯 감독님이 찾아주신 최신 공식 구글 SDK 초기화
    const ai = new GoogleGenAI({ apiKey: apiKey });

    // 공식 SDK를 활용한 Imagen 4.0 렌더링 호출
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1, // 브라우저로 전송하기 위해 1장만 생성
        aspectRatio: "16:9" // 시네마틱 비율 적용
      },
    });

    // 💡 SDK 응답 검증 (에러 방어벽)
    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("이미지 생성 결과가 없습니다.");
    }

    // imgBytes (Base64 데이터) 추출
    const imgBytes = response.generatedImages[0].image.imageBytes;
    
    // 프론트엔드가 이미지를 즉시 그릴 수 있도록 Data URI 형태로 변환
    const imageUrl = `data:image/png;base64,${imgBytes}`;

    return res.status(200).json({ success: true, imageUrl: imageUrl });

  } catch (error) {
    console.error("GoogleGenAI SDK Error:", error);
    // 구글 SDK가 뱉어내는 정확한 에러 메시지를 프론트와 로그에 전달
    return res.status(500).json({ success: false, message: error.message });
  }
}
