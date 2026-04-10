import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false });

  try {
    const jsonKeyString = process.env.GCP_SERVICE_ACCOUNT_JSON;
    const { operationId } = req.body;

    if (!operationId) throw new Error("작업 번호가 없습니다.");

    const auth = new GoogleAuth({
      credentials: JSON.parse(jsonKeyString),
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    // 작업 상태를 확인하는 구글 API 주소
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1beta1/${operationId}`;

    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    
    // HTTP 요청 자체가 실패했을 경우
    if (!response.ok) {
      return res.status(response.status).json({ 
        success: false, 
        message: data.error?.message || "구글 상태 확인 API 에러" 
      });
    }

    // 성공적으로 상태를 가져온 경우 (작업 완료여부 포함)
    res.status(200).json({
      success: true,
      done: data.done || false,
      response: data.response || null,
      error: data.error || null // 구글 렌더링 중 발생한 에러
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}
