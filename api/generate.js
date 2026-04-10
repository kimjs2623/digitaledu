import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false });

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

    // 🎯 에러의 원인이었던 outputConfig를 제거했습니다.
    // 구글 API는 이걸 빼면 알아서 처리하고 영상 다운로드 주소를 줍니다.
    const payload = {
      instances: [{ prompt: `시네마틱 영상 연출: ${prompt}` }],
      parameters: { sampleCount: 1, aspectRatio: "16:9" }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || "촬영 시작 실패");
    }

    res.status(200).json({ success: true, operationId: data.name });

  } catch (error) {
    console.error("서버 에러:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
