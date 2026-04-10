import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ success: false, message: 'POST 요청만 가능합니다.' });
  }

  try {
    const jsonKeyString = process.env.GCP_SERVICE_ACCOUNT_JSON;
    const projectId = process.env.GCP_PROJECT_ID;
    const { operationId } = req.body;

    if (!jsonKeyString || !projectId) {
      return res.status(200).json({ success: false, message: "환경변수 설정이 누락되었습니다." });
    }
    if (!operationId) {
      return res.status(200).json({ success: false, message: "작업 번호가 없습니다." });
    }

    // 1. 구글 클라우드 인증
    const auth = new GoogleAuth({
      credentials: JSON.parse(jsonKeyString),
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    const location = 'us-central1';
    const modelId = 'veo-3.1-fast-generate-001';

    // 2. 🎯 구글 공식 문서 반영: operationName 만들기
    let operationName = operationId;
    if (!operationName.includes('publishers/google')) {
         const uuid = operationId.split('/').pop();
         operationName = `projects/${projectId}/locations/${location}/publishers/google/models/${modelId}/operations/${uuid}`;
    }

    // 3. 🎯 구글 공식 문서 반영: fetchPredictOperation 엔드포인트
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:fetchPredictOperation`;

    // 4. 구글에 작업 상태 문의 (POST 방식)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        operationName: operationName
      })
    });

    const data = await response.json();

    // 5. 에러 방어 및 결과 전송
    if (!response.ok) {
      return res.status(200).json({
        success: false,
        message: data.error?.message || `상태 확인 API 오류 (${response.status})`
      });
    }

    return res.status(200).json({
      success: true,
      done: data.done || false,
      response: data.response || null,
      error: data.error || null
    });

  } catch (error) {
    console.error("서버 내부 에러:", error);
    return res.status(200).json({
      success: false,
      message: "서버 내부 오류 발생: " + error.message
    });
  }
}
