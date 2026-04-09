import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';

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

    // 1. GoogleAuth를 사용하여 직접 인증 클라이언트를 생성합니다.
    const auth = new GoogleAuth({
      credentials: serviceAccountKey,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    // 2. 인증 토큰을 가져옵니다.
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    if (!token) {
      throw new Error("인증 토큰을 가져오는 데 실패했습니다.");
    }

    const location = 'us-central1';
    const modelId = 'veo-3.1-fast-generate-001';
    
    // 3. Veo 전용 Predict API 엔드포인트 설정
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

    // 4. fetch를 사용하여 구글 서버에 직접 요청을 보냅니다.
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
     * 성공하면 'name'이라는 작업 번호(Operation ID)가 포함된 응답이 옵니다.
     */
    res.status(200).json({
      success: true,
      message: "레디, 액션! 구글 서버에서 영상 촬영(LRO)이 시작되었습니다.",
      operationId: data.name, 
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
