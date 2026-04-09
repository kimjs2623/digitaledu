import { VertexAI } from '@google-cloud/vertexai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'POST 요청만 가능합니다.' });
  }

  try {
    const projectId = process.env.GCP_PROJECT_ID;
    const jsonKeyString = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!projectId || !jsonKeyString) {
      throw new Error("환경 변수 설정 확인이 필요합니다.");
    }

    const serviceAccountKey = JSON.parse(jsonKeyString);
    const { prompt } = req.body;

    const vertexAI = new VertexAI({
      project: projectId,
      location: 'us-central1',
      googleAuthOptions: { credentials: serviceAccountKey }
    });

    // 🎯 드디어 찾은 진짜 모델 ID 반영!
    const generativeModel = vertexAI.getGenerativeModel({
      model: 'veo-3.1-fast-generate-001', 
    });

    const refinedPrompt = `시네마틱 영상 연출: ${prompt}`;

    const request = {
      contents: [{ role: 'user', parts: [{ text: refinedPrompt }] }]
    };

    // 촬영 요청 전송
    const result = await generativeModel.generateContent(request);
    const response = await result.response;
    
    res.status(200).json({
      success: true,
      message: "레디, 액션! 진짜 모델로 촬영을 시작합니다.",
      result: response.candidates[0].content.parts[0].text || "요청 접수 완료",
      debug: { modelId: 'veo-3.1-fast-generate-001' }
    });

  } catch (error) {
    console.error("서버 에러:", error);
    res.status(500).json({
      success: false,
      message: "진짜 에러 원인: " + error.message
    });
  }
}
