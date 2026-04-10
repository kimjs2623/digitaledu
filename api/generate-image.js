/**
 * Imagen 4.0 모델을 사용하여 텍스트 프롬프트를 이미지로 변환하는 API 핸들러입니다.
 * 시안 선택 단계를 위해 여러 장(sampleCount)의 이미지를 생성하도록 설정되어 있습니다.
 */

export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || "";
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ success: false, message: 'Prompt is required' });
  }

  // 지수 백오프를 이용한 재시도 로직 (최대 5회)
  const fetchWithRetry = async (url, options, retries = 5, backoff = 1000) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json();
        // 유료 플랜 계정이나 할당량 문제 등의 에러 처리
        if (retries > 0 && (response.status === 429 || response.status >= 500)) {
          await new Promise(resolve => setTimeout(resolve, backoff));
          return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
      }
      return response;
    } catch (err) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw err;
    }
  };

  try {
    // 시스템 규격에 따른 Imagen 4.0 예측 엔드포인트
    const modelId = 'imagen-4.0-generate-001';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict?key=${apiKey}`;

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: {
          prompt: prompt
        },
        parameters: {
          sampleCount: 3, // 한 번에 3개의 시안을 생성하여 선택 폭을 넓힘
          aspectRatio: "1:1" // 도안 및 배경 시안용 정사각형 비율
        }
      })
    });

    const result = await response.json();

    // 생성된 이미지 데이터(Base64) 추출
    if (result.predictions && result.predictions.length > 0) {
      const imagesBase64 = result.predictions.map(pred => pred.bytesBase64Encoded);
      
      return res.status(200).json({
        success: true,
        imagesBase64: imagesBase64
      });
    } else {
      throw new Error("이미지 생성 결과가 없습니다.");
    }

  } catch (error) {
    console.error("Imagen API Error:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "이미지 생성 중 서버 오류가 발생했습니다."
    });
  }
}
