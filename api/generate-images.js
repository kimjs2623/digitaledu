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
      return res.status(400).json({ success: false, message: '프롬프트가 없습니다.' });
    }

    // 🎯 구글 Imagen 엔드포인트
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
    
    // 🎯 400 에러 해결: 구글 API 규격에 맞춰 instances를 배열(Array)로 감싸서 전송
    const payload = {
      instances: [
        { prompt: prompt }
      ],
      parameters: { 
        sampleCount: 1 
      }
    };

    const fetchWithRetry = async (url, options, retries = 3, backoff = 2000) => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (!response.ok || data.error) {
          const errorCode = response.status || data.error?.code;
          const errorMsg = data.error?.message || JSON.stringify(data);
          
          console.error(`[Imagen API 실패] 시도: ${i+1}, 코드: ${errorCode}, 메시지: ${errorMsg}`);
          
          // 503(서버 과부하), 429(한도 초과) 에러는 대기 후 재시도
          if (errorCode === 503 || errorCode === 429) {
            console.log(`서버 혼잡으로 ${backoff}ms 대기 후 재시도...`);
            await new Promise(r => setTimeout(r, backoff));
            backoff *= 2;
            continue;
          }
          
          // 🎯 400 에러(파라미터 규격 위반, 안전 필터 위반)는 재시도 없이 즉시 에러 반환
          throw new Error(`Imagen 생성 거부 (코드 ${errorCode}): ${errorMsg}`);
        }
        return data;
      }
      throw new Error("구글 이미지 생성 서버가 응답하지 않습니다. (재시도 초과)");
    };

    // API 호출 실행
    const data = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // 💡 응답 데이터 구조 검증 방어벽
    if (!data.predictions || !data.predictions[0] || !data.predictions[0].bytesBase64Encoded) {
       console.error("응답 데이터 파싱 실패:", JSON.stringify(data).substring(0, 300));
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
