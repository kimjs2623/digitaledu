import { VertexAI } from '@google-cloud/vertexai';

export default async function handler(req, res) {
  // 화면에서 보내는 POST 요청만 받습니다.
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'POST 요청만 가능합니다.' });
  }

  try {
    // 💡 Vercel 환경 변수에서 프로젝트 ID와 JSON 키를 가져옵니다.
    const projectId = process.env.GCP_PROJECT_ID; 
    const serviceAccountKey = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON); 
    
    // 학생이 쓴 시나리오를 받습니다.
    const { prompt } = req.body;

    // 구글 Vertex AI에 접속합니다.
    const vertexAI = new VertexAI({
      project: projectId,
      location: 'us-central1', // Veo 모델이 지원되는 기본 지역
      googleAuthOptions: {
        credentials: serviceAccountKey
      }
    });

    // 🎯 수정한 부분: 모델명을 확실한 'veo-001'로 변경했습니다.
    const generativeModel = vertexAI.getGenerativeModel({
      model: 'veo-001',
    });

    const refinedPrompt = `한국 문학의 서정적인 분위기, 4k 시네마틱 연출: ${prompt}`;

    const request = {
      contents: [{ role: 'user', parts: [{ text: refinedPrompt }] }]
    };

    const response = await generativeModel.generateContent(request);
    
    // 비디오 생성 모델의 특성상 텍스트가 아닌 다른 형태의 응답이 올 수 있어, 안전하게 처리합니다.
    let resultText = "요청이 성공했습니다.";
    if (response.response.candidates && response.response.candidates.length > 0) {
        const firstCandidate = response.response.candidates[0];
        if (firstCandidate.content && firstCandidate.content.parts && firstCandidate.content.parts.length > 0) {
             resultText = firstCandidate.content.parts[0].text || "비디오 생성이 시작되었습니다.";
        }
    }

    res.status(200).json({
      success: true,
      message: "촬영 지시 완료!",
      receivedPrompt: refinedPrompt,
      result: resultText
    });

  } catch (error) {
    console.error("서버 에러:", error);
    // 🕵️‍♂️ 감독님을 위한 스파이 마이크: 실제 에러 메시지를 화면에 뿌려줍니다.
    res.status(500).json({
      success: false,
      message: "진짜 에러 원인: " + error.message 
    });
  }
}
