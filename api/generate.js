import { VertexAI } from '@google-cloud/vertexai';

export default async function handler(req, res) {
  // 1. 요청 방식 확인
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'POST 요청만 허용됩니다.' });
  }

  try {
    // 2. 환경 변수 체크
    const projectId = process.env.GCP_PROJECT_ID;
    const jsonKey = process.env.GCP_SERVICE_ACCOUNT_JSON;

    if (!projectId || !jsonKey) {
      throw new Error("Vercel 환경 변수(PROJECT_ID 또는 JSON)가 설정되지 않았습니다.");
    }

    const serviceAccountKey = JSON.parse(jsonKey);
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ message: "시나리오를 입력해주세요." });
    }

    // 3. Vertex AI 초기화
    const vertexAI = new VertexAI({
      project: projectId,
      location: 'us-central1',
      googleAuthOptions: {
        credentials: serviceAccountKey
      }
    });

    // 4. 모델 설정 (가장 안정적인 Gemini 1.5 Flash 사용)
    // 💡 Veo 모델은 구글의 별도 승인이 필요하여 404가 날 수 있으므로, 
    // 우선 Gemini로 연결 성공 여부를 확인하는 것이 좋습니다.
    const generativeModel = vertexAI.getGenerativeModel({
      model: 'gemini-1.5-flash-002',
    });

    const refinedPrompt = `영화 감독의 관점에서 다음 시나리오를 시각적으로 묘사하고 연출 방향을 제시해줘: ${prompt}`;

    const request = {
      contents: [{ role: 'user', parts: [{ text: refinedPrompt }] }]
    };

    // 5. 구글 서버에 요청 및 응답 대기
    const result = await generativeModel.generateContent(request);
    const response = await result.response;
    
    // 응답 텍스트 추출
    const resultText = response.candidates[0].content.parts[0].text;

    // 6. 성공 응답 전송
    res.status(200).json({
      success: true,
      message: "구글 본사 연결 성공! 시나리오 분석 완료.",
      result: resultText,
      debug: {
        modelUsed: 'gemini-1.5-flash-002',
        projectId: projectId
      }
    });

  } catch (error) {
    console.error("Critical Server Error:", error);
    
    // 에러 메시지를 분석하여 감독님께 더 쉬운 설명을 제공합니다.
    let friendlyMessage = error.message;
    if (error.message.includes("403")) {
      friendlyMessage = "권한 부족(403): IAM 설정에서 'Vertex AI 관리자' 역할을 다시 확인하세요.";
    } else if (error.message.includes("404")) {
      friendlyMessage = "모델 없음(404): 선택한 모델명을 사용할 수 없습니다.";
    } else if (error.message.includes("Unexpected token")) {
      friendlyMessage = "JSON 형식 오류: Vercel에 넣은 JSON 값이 깨졌습니다. 다시 복사해서 넣어보세요.";
    }

    res.status(500).json({
      success: false,
      message: "진짜 에러 원인: " + friendlyMessage,
      rawError: error.message
    });
  }
}
