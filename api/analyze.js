export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, scenario, note, style } = req.body;
    
    // 🎯 디테일 자동 보완 및 음성 프롬프트 추가
    const promptText = `
      당신은 할리우드 영화 감독입니다.

      [입력 정보] 인물: ${chars} / 장소: ${place} / 연출: ${note} / 스타일: ${style} / 시나리오: "${scenario}"

      [CRITICAL 에러 방지 규칙]
      1. JSON 형식 엄수 (내부 쌍따옴표/줄바꿈 절대 금지)

      [서사 및 디테일 보완 지시사항]
      1. 시나리오를 3~5컷으로 나눕니다. 앞부분의 맥락을 절대 건너뛰지 마세요.
      2. **자동 보완(Auto-enrichment):** 학생의 시나리오가 짧거나 묘사가 부족하더라도, 당신이 의상, 표정, 날씨, 조명 등을 상상하여 매우 구체적으로 살을 붙이세요.
      3. **음성 대본(Audio):** 각 컷에 등장인물의 실제 대사나 내레이션을 'narration'에 작성하고, 어떤 목소리(성별, 감정 상태)로 읽어야 할지 'voice_prompt'에 적으세요.

      [출력 형식 JSON]
      {
        "storyboard": [
          { 
            "shot_number": 1, 
            "shot_size": "풀샷", 
            "camera_movement": "줌인", 
            "action": "학생이 화면에 출력할 한국어 자막 및 상황 묘사",
            "image_prompt": "English prompt for Imagen 4.0, highly detailed, comma separated...",
            "narration": "학생님, 어디까지 가시나요?",
            "voice_prompt": "조심스럽고 약간 떨리는 40대 남성의 목소리"
          }
        ]
      }
    `;

    const fetchWithRetry = async (url, options, retries = 3, backoff = 2000) => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        const data = await response.json();
        if (data.error) {
           if (data.error.code === 503 || data.error.message.includes('demand')) {
             await new Promise(r => setTimeout(r, backoff)); backoff *= 2; continue;
           }
           throw new Error(data.error.message);
        }
        return data;
      }
      throw new Error("서버 혼잡");
    };

    const data = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }], generationConfig: { responseMimeType: "application/json" } })
    });

    if (!data.candidates || !data.candidates[0]) throw new Error("AI 응답 오류");
    let rawText = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    return res.status(200).json({ success: true, data: JSON.parse(rawText) });

  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
}
