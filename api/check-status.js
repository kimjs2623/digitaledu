import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  // 프론트엔드가 에러 내용을 바로 읽을 수 있도록 500 대신 200 OK 안에 에러를 담아 보냅니다.
  if (req.method !== 'POST') {
    return res.status(200).json({ success: false, message: 'POST 요청만 가능합니다.' });
  }

  try {
    const jsonKeyString = process.env.GCP_SERVICE_ACCOUNT_JSON;
    const { operationId } = req.body;

    if (!jsonKeyString) {
      return res.status(200).json({ success: false, message: "환경변수(JSON 키)가 Vercel에 설정되지 않았습니다." });
    }
    if (!operationId) {
      return res.status(200).json({ success: false, message: "구글로부터 작업 번호(operationId)를 받지 못했습니다." });
    }

    // 1. 인증 토큰 발급
    const auth = new GoogleAuth({
      credentials: JSON.parse(jsonKeyString),
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    // 2. 주소 정리 (혹시 모를 슬래시 중복 방지)
    const cleanOpId = operationId.startsWith('/') ? operationId.slice(1) : operationId;
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1beta1/${cleanOpId}`;

    // 3. 구글에 작업 상태 문의 (GET 방식)
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // 4. 구글의 응답이 JSON이 아닐 경우(에러 페이지)를 대비한 방어막
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(200).json({
        success: false,
        message: `구글 서버가 예상치 못한 HTML을 반환했습니다. (상태 코드: ${response.status})`,
        debug: text.substring(0, 300) // 에러 원인 분석을 위해 앞부분 텍스트 전달
      });
    }

    // 구글 API 자체가 에러 메시지를 줬을 경우
    if (!response.ok) {
      return res.status(200).json({
        success: false,
        message: data.error?.message || `구글 상태 확인 API 실패 (상태 코드: ${response.status})`
      });
    }

    // 5. 성공적으로 상태를 받아온 경우 프론트엔드로 전달
    return res.status(200).json({
      success: true,
      done: data.done || false,
      response: data.response || null,
      error: data.error || null
    });

  } catch (error) {
    // 백엔드 내부 로직 에러가 발생해도 서버를 죽이지 않고 사유를 보냅니다.
    console.error("체크 로직 내부 에러:", error);
    return res.status(200).json({
      success: false,
      message: "상태 확인 백엔드 내부 에러: " + error.message
    });
  }
}
