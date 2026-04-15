export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY; // Vercel 환경변수에 등록된 구글 API 키
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, message: '프롬프트가 제공되지 않았습니다.' });
    }

    // 🎯 503, 429 에러 방어 및 지수 백오프(Exponential Backoff) 재시도 로직
    const fetchWithRetry = async (url, options, retries = 5, backoff = 1000) => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        const data = await response.json();

        // 에러가 발생한 경우 (상태 코드가 200번대가 아니거나 error 객체가 있는 경우)
        if (!response.ok || data.error) {
          const errorCode = response.status || (data.error && data.error.code);
          
          // 서버 혼잡(503) 또는 요청 한도 초과(429)일 때만 대기 후 재시도
          if (errorCode === 503 || errorCode === 429 || (data.error && data.error.message.includes('demand'))) {
            console.log(`[이미지 서버 혼잡] ${backoff}ms 대기 후 재시도 (${i+1}/${retries})...`);
            await new Promise(r => setTimeout(r, backoff));
            backoff *= 2; // 1초, 2초, 4초, 8초, 16초 대기
            continue;
          }
          // 다른 치명적 에러는 즉시 에러 던짐
          throw new Error(data.error?.message || `HTTP error ${response.status}`);
        }
        return data;
      }
      throw new Error("구글 이미지 생성 서버 혼잡. 잠시 후 다시 시도해 주세요.");
    };

    // 🎯 구글 Imagen 4.0 API 엔드포인트
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
    
    // API에 전달할 페이로드 (학생이 수정한 영문 키워드 프롬프트 + 이미지 1장 요청)
    const payload = {
      instances: { prompt: prompt },
      parameters: { sampleCount: 1 }
    };

    // 이미지 렌더링 요청
    const data = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // 💡 Cannot read properties 방어벽
    if (!data.predictions || !data.predictions[0] || !data.predictions[0].bytesBase64Encoded) {
      throw new Error("이미지 생성 응답에 실패했습니다. (데이터 없음)");
    }

    // Base64 인코딩된 이미지 데이터를 브라우저가 읽을 수 있는 Data URI 형태로 변환
    const base64Image = data.predictions[0].bytesBase64Encoded;
    const imageUrl = `data:image/png;base64,${base64Image}`;

    // 프론트엔드로 성공적으로 전달
    return res.status(200).json({ success: true, imageUrl: imageUrl });

  } catch (error) {
    console.error("Generate Image Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
