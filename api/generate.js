import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'POST 요청만 가능합니다.' });

  try {
    const projectId = process.env.GCP_PROJECT_ID;
    const jsonKeyString = process.env.GCP_SERVICE_ACCOUNT_JSON;
    const { prompt } = req.body;

    const auth = new GoogleAuth({
      credentials: JSON.parse(jsonKeyString),
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    const location = 'us-central1';
    const modelId = 'veo-3.1-fast-generate-001';
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predictLongRunning`;

    const payload = {
      instances: [{ prompt: `시네마틱 영상: ${prompt}` }],
      parameters: { sampleCount: 1, aspectRatio: "16:9" }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error?.message || "API 호출 실패");

    // 🎯 프론트엔드가 이해할 수 있도록 'result'라는 이름으로 접수 번호를 넘깁니다.
    res.status(200).json({
      success: true,
      result: "촬영이 시작되었습니다!",
      operationId: data.name,
      message: "구글 클라우드 서버에서 렌더링 중입니다. (약 1~2분 소요)"
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}
