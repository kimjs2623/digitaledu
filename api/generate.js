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

    const payload = {
      instances: [{ prompt: `시네마틱 영상 연출: ${prompt}` }],
      parameters: { sampleCount: 1, aspectRatio: "16:9" },
      outputConfig: {
        gcsDestination: {
          // 🎯 감독님이 확인해주신 정확한 언더바(_) 이름으로 수정 완료!
          outputUriPrefix: "gs://digitaledu_storage/outputs/" 
        }
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "촬영 시작 실패");

    res.status(200).json({ success: true, operationId: data.name });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}
