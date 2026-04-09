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

    // 1. GoogleAuth를 사용하여 인증 클라이언트 생성
    const auth = new GoogleAuth({
      credentials: serviceAccountKey,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    // 2. 인증 토큰 가져오기
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    if (!token) {
      throw new Error("인증 토큰을 가져오는 데 실패했습니다.");
    }

    const location = 'us-central1';
    const modelId = 'veo-3.1-fast-generate-001';
    
    // 🎯 수정한 부분: :predict 대신 :generateVideo 엔드포인트를 사용합니다.
    // 에러 메시지에서 요구하는 비디오 전용 Long Running API 입구입니다.
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:generateVideo`;

    // 🎯 수정한 부분: 비디오 생성 API 규격에 맞는 페이로드 구조입니다.
    const payload = {
      prompt: `시네마틱 영상 연출: ${prompt}`,
      videoConfig: {
        aspectRatio: "16:9",
        fps: 24
      }
    };

    // 3. fetch를 사용하여 구글 비디오 전용 API 호출
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
      // 구글이 보낸 상세 에러 메시지를 포함하여 던집니다.
      throw new Error(data.error?.message || `구글 API 호출 실패 (상태 코드: ${response.status})`);
    }

    /**
     * 🎬 Veo 응답 처리
     * 성공하면 'name' (작업 경로)이 포함된 Operation 객체가 옵니다.
     * 이제 429 에러 대신 "작업 시작" 응답을 받게 됩니다.
     */
    res.status(200).json({
      success: true,
      message: "레디, 액션! 비디오 전용 API를 통해 촬영이 시작되었습니다.",
      operationId: data.name, 
      result: "구글 서버에서 영상 생성이 진행 중입니다.",
      debug: { 
        endpoint: "generateVideo",
        modelId: modelId 
      }
    });

  } catch (error) {
    console.error("서버 에러:", error);
    res.status(500).json({
      success: false,
      message: "진짜 에러 원인: " + error.message
    });
  }
}
