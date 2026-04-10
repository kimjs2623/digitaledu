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
      return res.status(200).json({ success: false, message: "환경변수(JSON 키 또는 프로젝트 ID)가 비어있습니다." });
    }
    if (!operationId) {
      return res.status(200).json({ success: false, message: "작업 번호(operationId)를 받지 못했습니다." });
    }

    // 1. 인증 토큰 발급
    const auth = new GoogleAuth({
      credentials: JSON.parse(jsonKeyString),
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    // 2. 🎯 구글 본사 주소를 절대 틀리지 않게 안전하게 조립합니다.
    let endpoint = "";
    
    // 만약 구글이 준 값이 이미 완벽한 주소 형태(projects/...)라면 그대로 씁니다.
    if (operationId.includes("projects/")) {
        const cleanPath = operationId.startsWith('/') ? operationId.slice(1) : operationId;
        endpoint = `https://us-central1-aiplatform.googleapis.com/v1beta1/${cleanPath}`;
    } 
    // 구글이 난수(UUID)만 달랑 줬거나 잘린 값이 왔다면 강제로 표준 주소를 만듭니다.
    else {
        const uuid = operationId.split('/').pop();
        endpoint = `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/us-central1/operations/${uuid}`;
    }

    // 3. 구글에 작업 상태 문의 (GET 방식)
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const text = await response.text();
    let data;
    
    try {
      data = JSON.parse(text);
    } catch (e) {
      // 또 HTML 에러 페이지가 오더라도, 우리가 어떤 주소로 찾아갔는지 화면에 띄워줍니다.
      return res.status(200).json({
        success: false,
        message: `구글 통신 경로 오류 (404). [우리가 찾아간 주소: ${endpoint}]`
      });
    }

    // 구글 API가 정상적으로 에러 메시지를 줬을 경우
    if (!response.ok) {
      return res.status(200).json({
        success: false,
        message: data.error?.message || `상태 확인 API 오류 (${response.status}) [우리가 찾아간 주소: ${endpoint}]`
      });
    }

    // 4. 성공적으로 상태를 받아온 경우 프론트엔드로 전달
    return res.status(200).json({
      success: true,
      done: data.done || false,
      response: data.response || null,
      error: data.error || null
    });

  } catch (error) {
    return res.status(200).json({
      success: false,
      message: "상태 확인 백엔드 내부 로직 에러: " + error.message
    });
  }
}
