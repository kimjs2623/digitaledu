export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 요청만 허용됩니다.' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
    }

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, message: '프롬프트가 제공되지 않았습니다.' });
    }

    // 🎯 구글 Imagen 4.0 API 엔드포인트
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
    
    const payload = {
      instances: { prompt: prompt },
      parameters: { sampleCount: 1 }
    };

    // 🎯 에러 추적 및 지수 백오프(Exponential Backoff) 재시도 로직
    const fetchWithRetry = async (url, options, retries = 5, backoff = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await fetch(url, options);
          const data = await response.json();

          // 응답이 실패했거나 error 객체가 포함된 경우
          if (!response.ok || data.error) {
            const errorCode = response.status || data.error?.code;
            const errorMsg = data.error?.message || JSON.stringify(data);

            console.error(`[Imagen API 에러] 시도: ${i+1}/${retries}, 코드: ${errorCode}, 메시지: ${errorMsg}`);

            // 429 (Too Many Requests) 또는 503 (Service Unavailable) 에러 시 재시도
            if (errorCode === 429 || errorCode === 503 || errorMsg.includes('demand')) {
              console.log(`[서버 혼잡/한도 초과] ${backoff}ms 대기 후 재시도...`);
              await new Promise(resolve => setTimeout(resolve, backoff));
              backoff *= 2; // 대기 시간을 1초, 2초, 4초, 8초, 16초로 점진적 증가
              continue;
            }
            
            // 400 에러(콘텐츠 정책 위반, 잘못된 프롬프트 등)는 재시도 없이 즉시 에러 반환
            throw new Error(`Imagen 생성 거부: ${errorMsg}`);
          }
          
          // 성공 시 데이터 반환
          return data;
          
        } catch (err) {
          // 네트워크 에러 등의 예외 처리
          if (i === retries - 1) throw err;
          console.log(`[네트워크 예외] ${backoff}ms 대기 후 재시도...`, err.message);
          await new Promise(resolve => setTimeout(resolve, backoff));
          backoff *= 2;
        }
      }
      throw new Error("구글 이미지 서버가 응답하지 않습니다. (재시도 횟수 초과)");
    };

    // API 호출 실행
    const data = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // 💡 데이터 구조 파싱 검증 및 방어
    if (!data.predictions || !data.predictions[0] || !data.predictions[0].bytesBase64Encoded) {
      console.error("응답 데이터 파싱 실패 (전체 응답):", JSON.stringify(data).substring(0, 300));
      throw new Error("이미지 데이터가 정상적으로 반환되지 않았습니다.");
    }

    // Base64 인코딩된 이미지 데이터를 브라우저가 읽을 수 있는 Data URI 형태로 변환
    const base64Image = data.predictions[0].bytesBase64Encoded;
    const imageUrl = `data:image/png;base64,${base64Image}`;

    // 프론트엔드로 성공적으로 전달
    return res.status(200).json({ success: true, imageUrl: imageUrl });

  } catch (error) {
    console.error("Generate Image Fatal Error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}
