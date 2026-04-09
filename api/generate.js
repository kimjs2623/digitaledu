import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 요청만 가능합니다.' });
  }

  try {
    const projectId = process.env.GCP_PROJECT_ID;
    const jsonKeyString = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!projectId || !jsonKeyString) {
      return res.status(500).json({ 
        success: false, 
        message: "환경 변수 설정(Project ID 또는 JSON)이 비어있습니다." 
      });
    }

    let serviceAccountKey;
    try {
      serviceAccountKey = JSON.parse(jsonKeyString);
    } catch (e) {
      return res.status(500).json({ success: false, message: "JSON 키 형식이 올바르지 않습니다." });
    }

    const { prompt } = req.body;

    // 1. 구글 인증 세팅
    const auth = new GoogleAuth({
      credentials: serviceAccountKey,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    // 2. 🎯 수정한 핵심 부분: 비디오 전용 'predictLongRunning' 엔드포인트
    // 구글의 지시사항대로 :predict 가 아닌 :predictLongRunning 경로를 사용합니다.
    const location = 'us-central1';
    const modelId = 'veo-3.1-fast-generate-001';
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predictLongRunning`;

    const payload = {
      instances: [{ prompt: `시네마틱 영상 연출: ${prompt}` }],
      parameters: { sampleCount: 1, aspectRatio: "16:9" }
    };

    // 3. API 호출 및 HTML 응답 방어 로직
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // 텍스트로 먼저 받아서 JSON인지 HTML인지 확인합니다 (중요!)
    const responseText = await response.text();
    let responseData;

    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      // 만약 HTML(<!DOCTYPE...)이 왔다면 에러 내용을 로그에 찍고 사용자에게 알립니다.
      console.error("구글 서버가 JSON이 아닌 HTML을 반환함:", responseText.substring(0, 200));
      return res.status(response.status).json({
        success: false,
        message: `구글 서버 응답 오류(HTML 수신). 상태 코드: ${response.status}`,
        debug: responseText.substring(0, 300) // 에러 페이지 내용 일부 노출
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: responseData.error?.message || "구글 API 요청 실패",
        errorDetail: responseData
      });
    }

    // 4. 성공 응답 (LRO 작업 번호 반환)
    res.status(200).json({
      success: true,
      message: "레디, 액션! 촬영 예약(LRO)이 성공적으로 접수되었습니다.",
      operationId: responseData.name, // 촬영 작업 고유 번호 (이게 나오면 성공입니다!)
      result: "영상 생성이 진행 중입니다. 약 1~2분 뒤 구글 클라우드에서 확인 가능합니다.",
      data: responseData
    });

  } catch (error) {
    console.error("서버 내부 에러:", error);
    res.status(500).json({
      success: false,
      message: "서버 에러 발생: " + error.message
    });
  }
}
