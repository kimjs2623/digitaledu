import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false });

  try {
    const jsonKeyString = process.env.GCP_SERVICE_ACCOUNT_JSON;
    const { operationId } = req.body; // 프론트엔드에서 작업 번호를 보내줍니다.

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
    
    // data.done이 true면 촬영 끝!
    // 결과는 보통 data.response.videos[0].uri 등에 담겨 있습니다.
    res.status(200).json({
      success: true,
      done: data.done || false,
      response: data.response || null,
      error: data.error || null
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}
