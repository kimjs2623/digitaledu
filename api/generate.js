import { VertexAI } from '@google-cloud/vertexai';

export default async function handler(req, res) {
  // 화면에서 보내는 POST 요청만 받습니다.
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'POST 요청만 가능합니다.' });
  }

  try {
    // 💡 여기서 Vercel 금고의 이름을 똑같이 적어주셔야 합니다!
    const projectId = process.env.GCP_PROJECT_ID; 
    const serviceAccountKey = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON); 
    
    // 학생이 쓴 시나리오를 받습니다.
    const { prompt } = req.body;

    // 구글에 접속합니다.
    const vertexAI = new VertexAI({
      project: projectId,
      location: 'us-central1',
      googleAuthOptions: {
        credentials: serviceAccountKey
      }
    });

    // Veo 3.1 모델을 불러와 영상을 요청합니다.
    const generativeModel = vertexAI.getGenerativeModel({
      model: 'veo-3.1-v001',
    });

    const refinedPrompt = `한국 문학의 서정적인 분위기, 4k 시네마틱 연출: ${prompt}`;

    const request = {
      contents: [{ role: 'user', parts: [{ text: refinedPrompt }] }]
    };

    const response = await generativeModel.generateContent(request);
    const resultText = response.response.candidates[0].content.parts[0].text || "요청이 성공했습니다.";

    res.status(200).json({
      success: true,
      message: "촬영 지시 완료!",
      receivedPrompt: refinedPrompt,
      result: resultText
    });

  } catch (error) {
    console.error("서버 에러:", error);
    res.status(500).json({
      success: false,
      message: "오류가 발생했습니다. Vercel이나 구글 인증을 다시 확인해주세요."
    });
  }
}
