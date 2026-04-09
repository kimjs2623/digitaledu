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

    // Vertex AI 초기화
    const vertexAI = new VertexAI({
      project: projectId,
      location: 'us-central1',
      googleAuthOptions: { credentials: serviceAccountKey }
    });

    /**
     * 🎯 Veo 3.1 전용 '촬영 예약' 로직
     * Veo는 generateContent 대신 전용 예측(Prediction) 엔드포인트를 사용해야 합니다.
     * 이를 위해 직접 REST API 형태의 요청을 보냅니다.
     */
    const location = 'us-central1';
    const modelId = 'veo-3.1-fast-generate-001';
    
    // 구글 클라우드 인증 토큰 가져오기
    const client = await vertexAI.googleAuthOptions.authClient;
    const token = await client.getAccessToken();

    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predict`;

    const payload = {
      instances: [
        {
          prompt: `시네마틱 영상 연출: ${prompt}`
        }
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: "16:9",
        fps: "24"
      }
    };

    // 구글 Predict API 호출 (Long Running Operation 시작)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "구글 API 호출 중 오류가 발생했습니다.");
    }

    /**
     * 🎬 Veo 응답 처리
     * 성공하면 'name'이라는 작업 번호(Operation ID)가 옵니다.
     * 이 번호가 있다는 건 구글 서버에서 촬영이 "진짜로 시작됐다"는 뜻입니다.
     */
    res.status(200).json({
      success: true,
      message: "레디, 액션! 구글 서버에서 영상 촬영(LRO)이 시작되었습니다.",
      operationId: data.name, // 촬영 작업 고유 번호
      result: "영상 생성이 진행 중입니다. (약 1~2분 소요)",
      debug: { modelId: modelId }
    });

  } catch (error) {
    console.error("서버 에러:", error);
    res.status(500).json({
      success: false,
      message: "진짜 에러 원인: " + error.message
    });
  }
}
