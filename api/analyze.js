export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, scenario, note } = req.body;
    
    // 🎯 마스터 프롬프트 작성 지시사항 대폭 강화
    const promptText = `
      당신은 할리우드 수석 영화 감독이자 비디오 AI 프롬프트 엔지니어입니다.
      
      [입력 정보]
      - 등장인물: ${chars}
      - 장소 및 시대: ${place}
      - 시나리오: "${scenario}"
      - 연출 의도: ${note}

      [핵심 지시사항]
      1. 비디오 AI(Veo)는 5초 분량의 단일 샷(One-take) 생성에 최적화되어 있습니다. 시나리오를 가장 극적인 '1개의 카메라 컷(Shot)'으로 요약하세요.
      2. 'action'과 'camera_movement'는 교육용으로 한국어로 구체적으로 작성하세요.
      3. CRITICAL: 'master_prompt'는 비디오 AI에 실제 전송될 최종 영문 프롬프트입니다. 한국어로 짠 카메라 워킹, 액션, 시대 배경, 조명, 연출 의도를 **단 하나도 빠짐없이 매우 디테일한 영문(1~2문장)**으로 꽉 채워서 번역하세요. 대충 요약하면 절대 안 됩니다.

      [출력 형식 (JSON)]
      {
        "storyboard": [
          {
            "shot_number": 1,
            "shot_size": "클로즈업 (Close-Up)",
            "camera_movement": "천천히 줌인 (Slow zoom in)",
            "action": "비에 젖은 얼굴, 놀라며 갈등하는 표정"
          }
        ],
        "master_prompt": "Cinematic close-up shot of a rugged Korean rickshaw puller in 1920s rainy street, eyes widening in shock and greed, slow zoom in, moody dim lighting, highly detailed, photorealistic."
      }
    `;

    const fetchWithRetry = async (url, options, retries = 3, backoff = 2000) => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        const data = await response.json();
        if (data.error && (data.error.code === 503 || data.error.message.includes('demand'))) {
          await new Promise(r => setTimeout(r, backoff));
          backoff *= 2;
          continue;
        }
        return data;
      }
      throw new Error("구글 AI 서버 접속자가 너무 많습니다. 10초 뒤 다시 시도해 주세요.");
    };

    const data = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json" } 
      })
    });

    if (data.error) throw new Error(data.error.message);

    let rawText = data.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    const result = JSON.parse(rawText);
    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error("Analyze Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
