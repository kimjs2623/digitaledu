import { VertexAI } from '@google-cloud/vertexai';

export default async function handler(req, res) {
  // 1. POST 요청인지 확인
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'POST 요청만 허용됩니다.' });
  }

  try {
    // 2. 환경 변수 로드 (프로젝트 ID: digitaledu-492813)
    const projectId = process.env.GCP_PROJECT_ID;
    const jsonKeyString = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!projectId || !jsonKeyString) {
      throw new Error("Vercel 환경 변수가 설정되지 않았습니다. (GCP_PROJECT_ID 또는 GCP_SERVICE_ACCOUNT_JSON)");
    }

    const serviceAccountKey = JSON.parse(jsonKeyString);
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ message: "시나리오를 입력해주세요." });
    }

    // 3. Vertex AI 초기화 (Veo 모델은 보통 us-central1에서 가장 잘 작동합니다)
    const vertexAI = new VertexAI({
      project: projectId,
      location: 'us-central1',
      googleAuthOptions: {
        credentials: serviceAccountKey
      }
    });

    // 4. 모델 설정: 감독님이 확인하신 Veo 3.1 Fast 모델 ID 사용
    const generativeModel = vertexAI.getGenerativeModel({
      model: 'veo-3-1-fast-v001',
    });

    // 5. 시네마틱 프롬프트 구성
    const refinedPrompt = `시네마틱 영화 연출 (4K, 고퀄리티): ${prompt}`;

    const request = {
      contents: [{ role: 'user', parts: [{ text: refinedPrompt }] }]
    };

    /**
     * 6. 비디오 생성 요청
     * 💡 주의: 비디오 생성은 텍스트보다 훨씬 오래 걸립니다 (수 분 소요).
     * Vercel 무료 플랜의 경우 10초 타임아웃이 있으므로, 실제 서비스에서는 비동기 처리가 필요합니다.
     * 여기서는 요청이 성공적으로 구글 서버에 도달했는지를 먼저 확인합니다.
     */
    const result = await generativeModel.generateContent(request);
    const response = await result.response;

    // 7. 응답 결과 분석
    // 비디오 모델은 응답 형태가 다를 수 있으므로 안전하게 추출합니다.
    let output = "비디오 생성이 시작되었습니다.";
    if (response.candidates && response.candidates[0].content.parts) {
      // 텍스트 응답이 있다면 가져오고, 없다면 성공 메시지 반환
      output = response.candidates[0].content.parts[0].text || "성공적으로 요청되었습니다. 구글 클라우드 콘솔의 Vertex AI에서 진행 상황을 확인하세요.";
    }

    res.status(200).json({
      success: true,
      message: "레디, 액션! 구글 본사에서 촬영을 시작했습니다.",
      result: output,
      debug: {
        model: 'veo-3-1-fast-v001',
        location: 'us-central1'
      }
    });

  } catch (error) {
    console.error("Critical Server Error:", error);
    
    let userMessage = error.message;
    if (error.message.includes("404")) {
      userMessage = "모델을 찾을 수 없습니다(404). 구글 콘솔에서 'Veo 3.1 Fast' 모델이 해당 프로젝트에 활성화(Enable)되어 있는지, 리전이 us-central1이 맞는지 확인하세요.";
    } else if (error.message.includes("403")) {
      userMessage = "권한 부족(403). IAM에서 'Vertex AI 관리자' 권한이 '톱니바퀴 모양' 아이콘 계정에 제대로 부여되었는지 확인하세요.";
    }

    res.status(500).json({
      success: false,
      message: "진짜 에러 원인: " + userMessage,
      errorDetail: error.message
    });
  }
}
