export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, scenario, note, style } = req.body;
    
    // 🎯 서사 흐름 유지 + Imagen 4.0 최적화 프롬프트 
    const promptText = `
      당신은 할리우드 수석 영화 감독이자 Imagen 4.0 프롬프트 엔지니어입니다.

      [입력 정보]
      - 등장인물: ${chars}
      - 장소 및 시대(Environment): ${place}
      - 연출 의도(Mood/Lighting): ${note}
      - 작화 스타일(Medium): ${style}
      - 시나리오 원문: "${scenario}"

      [CRITICAL 에러 방지 규칙]
      1. JSON 형식을 무조건 지키세요. 문자열 내부에 쌍따옴표(")나 줄바꿈(\\n) 사용을 엄격히 금지합니다.

      [서사(Sequence) 분할 지시사항]
      1. 시나리오의 '첫 문장'부터 '마지막 문장'까지 시간 순서대로 절대 생략 없이 3~5개의 컷(Shot)으로 세분화하세요. 
      2. 대화의 티키타카와 인물의 감정 변화(기승전결)가 유기적으로 이어져야 합니다.

      [Imagen 4.0 프롬프트(image_prompt) 작성 규칙]
      1. 영문으로 작성하되, 긴 서술형 문장(Long sentences)을 절대 쓰지 마세요.
      2. 쉼표(,)로 구분된 구체적인 시각적 단어(Keywords)만 나열하세요.
      3. 구조: [Style], [Subject(구체적 수량과 묘사)], [Shot size], [Environment], [Lighting], [Color], [Mood].
      4. 예시: ${style} style, two men talking, a rugged rickshaw puller and a student, close-up shot, 1920s rainy street, dim yellow streetlamps, cold muted tones, melancholic mood, highly detailed, clean image, no text.

      [출력 형식 JSON]
      {
        "storyboard": [
          { 
            "shot_number": 1, 
            "shot_size": "풀샷", 
            "camera_movement": "줌인", 
            "action": "한국어로 상황 및 행동 묘사 (영상 자막으로 쓰임)",
            "image_prompt": "English prompt following the Imagen 4.0 rules..."
          }
        ]
      }
    `;

    // 503 에러 방어 및 재시도 로직
    const fetchWithRetry = async (url, options, retries = 3, backoff = 2000) => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        const data = await response.json();
        if (data.error) {
           if (data.error.code === 503 || data.error.message.includes('demand')) {
             await new Promise(r => setTimeout(r, backoff));
             backoff *= 2;
             continue;
           }
           throw new Error(data.error.message);
        }
        return data;
      }
      throw new Error("서버 접속 지연. 잠시 후 다시 시도해 주세요.");
    };

    const data = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json" } 
      })
    });

    if (!data.candidates || !data.candidates[0]) throw new Error("AI 응답 오류");

    let rawText = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    return res.status(200).json({ success: true, data: JSON.parse(rawText) });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
