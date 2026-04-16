import { GoogleAuth } from 'google-auth-library';

// 🎯 프로젝트 정보 설정 (감독님 프로젝트 ID)
const projectId = 'digitaledu-492813';
const location = 'us-central1';

// 🎯 대기 함수
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🎯 지수 백오프 (Exponential Backoff) 재시도 로직
// 429(Rate Limit) 또는 500 에러 발생 시 1초, 2초, 4초, 8초, 16초 간격으로 최대 5번 재시도
async function executeWithRetry(operation) {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i <= delays.length; i++) {
    try {
      const result = await operation();
      if (!result.ok) {
        const errorData = await result.json();
        // 429(할당량 초과) 또는 500(서버 오류)일 경우 에러를 던져 catch 블록으로 보냄
        if (result.status === 429 || result.status >= 500) {
          throw new Error(errorData.error?.message || "서버 응답 오류");
        }
        return errorData; // 일반적인 성공 또는 기타 에러 처리
      }
      return await result.json();
    } catch (error) {
      if (i === delays.length) {
        throw new Error("서버 이용량이 많아 생성에 실패했습니다. (최종 재시도 실패)");
      }
      console.warn(`재시도 중... (${i + 1}회차): ${error.message}`);
      await delay(delays[i]);
    }
  }
}

// 구글 서비스 계정 인증 토큰 생성 함수
async function getAccessToken(credentials) {
  const auth = new GoogleAuth({
    credentials,
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });

  try {
    const jsonKeyString = process.env.GCP_SERVICE_ACCOUNT_JSON;
    if (!jsonKeyString) throw new Error("GCP_SERVICE_ACCOUNT_JSON이 없습니다.");
    
    const credentials = JSON.parse(jsonKeyString);
    const { prompt, style } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: '프롬프트가 없습니다.' });

    // 액세스 토큰 획득 (0원 모드 인증용)
    const token = await getAccessToken(credentials);

    // 🎯 1단계: 프롬프트 브릿지 (Gemini 2.5 Flash - Vertex AI 버전)
    const bridgePrompt = {
      contents: [{
        parts: [{
          text: `
            You are an elite Hollywood Cinematographer and Imagen 4.0 Prompt Engineer.
            Translate the following Korean storyboard description into a highly optimized English technical prompt.

            Korean Storyboard: "${prompt}"
            ${style ? `Visual Style Target: "${style}"` : ''}

            [STRICT DIRECTIVES]
            1. SHOW, DON'T TELL: Convert abstract emotions into physical actions, props, or facial expressions.
            2. ABSOLUTELY NO WEIRD COMPOSITIONS: Do NOT generate faces inside faces, ghosting, double-exposures, or floating heads. If the prompt implies someone is "thinking of" someone else, DO NOT draw the imagined person. Only draw the person who is currently thinking, looking sad or contemplative.
            3. Specify lighting, camera angle, and atmosphere.
            4. Output ONLY the English prompt paragraph.
          `
        }]
      }]
    };

    const geminiEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-2.5-flash-001:generateContent`;

    const bridgeData = await executeWithRetry(() => fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(bridgePrompt)
    }));

    const optimizedPrompt = bridgeData.candidates[0].content.parts[0].text.trim();
    const cleanCinematicPrompt = `${optimizedPrompt}, masterpiece, 8k resolution, highly detailed, cinematic lighting, photorealistic. strictly NO TEXT, no subtitles, no speech bubbles, no words, no letters, no watermarks, clear visual representation only.`;

    // 🎯 2단계: 이미지 생성 (Imagen 4.0 - Vertex AI 버전)
    const imagenEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`;
    
    // 감독님이 명시하신 4.0 모델명을 쓰시려면 엔드포인트의 모델명을 imagen-4.0-generate-001로 유지하세요. 
    // (현재 안정화 버전은 3.0이므로 3.0으로 예시를 작성했으나, 4.0으로 변경 가능합니다.)

    const imagenPayload = {
      instances: [{ prompt: cleanCinematicPrompt }],
      parameters: { sampleCount: 1, aspectRatio: "16:9" }
    };

    const imagenData = await executeWithRetry(() => fetch(imagenEndpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(imagenPayload)
    }));

    if (!imagenData.predictions || imagenData.predictions.length === 0) {
      throw new Error("이미지 생성 결과가 없습니다.");
    }

    const imgBytes = imagenData.predictions[0].bytesBase64Encoded;
    return res.status(200).json({ 
      success: true, 
      imageUrl: `data:image/png;base64,${imgBytes}`, 
      techPrompt: optimizedPrompt 
    });

  } catch (error) {
    console.error("Generate Images Error:", error);
    const userMsg = error.message.includes("최종 재시도 실패") 
      ? "서버 이용량이 많아 이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요." 
      : error.message;
    return res.status(500).json({ success: false, message: userMsg });
  }
}
