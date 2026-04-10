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
    
    // 비디오 생성 API 엔드포인트
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predictLongRunning`;

    // 🎯 구글 공식 규격에 맞춰 parameters 내부에 storageUri를 지정했습니다.
    const payload = {
      instances: [{ prompt: `시네마틱 영상 연출: ${prompt}` }],
      parameters: { 
        sampleCount: 1, 
        aspectRatio: "16:9",
        storageUri: "gs://digitaledu_storage/outputs/" 
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "촬영 시작 실패");

    res.status(200).json({ success: true, operationId: data.name });

  } catch (error) {
    console.error("서버 에러:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
