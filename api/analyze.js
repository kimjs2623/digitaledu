export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, scenario, note, style, lens } = req.body;
    
    // 🎯 구글 Imagen 공식 가이드를 완벽히 반영한 프롬프트 작성 지시
    const promptText = `
      당신은 할리우드 영화 감독이자 Google Imagen 3 프롬프트 엔지니어입니다.

      [입력 정보] 
      인물: ${chars} / 장소: ${place} / 연출: ${note} / 스타일: ${style} / 카메라 설정: ${lens} / 시나리오: "${scenario}"

      [서사 및 디테일 지시사항]
      1. 시나리오의 처음부터 끝까지 생략 없이 3~5컷으로 나눕니다.
      
      [CRITICAL: Imagen 3 이미지 프롬프트 (image_prompt) 작성 규칙]
      1. 단어의 나열이 아닌, **설명적이고 명확한 서술형 문장(Descriptive sentences)**으로 영문 작성하세요. (예: A photograph of a modern building surrounded by skyscrapers...)
      2. 구조: [Subject(구체적인 사람/사물 묘사)] + [Context(배경, 조명, 날씨)] + [Style(사진, 수채화 등)] 순서로 구성하세요.
      3. 카메라 및 품질 수정자 적용: 사용자가 선택한 카메라 설정(${lens})을 반드시 프롬프트에 자연스럽게 녹여내세요. (예: 35mm lens, 100mm macro lens, wide-angle 10mm, fast shutter speed, dramatic lighting 등)
      4. 추가 품질 키워드: 4k, HDR, highly detailed, beautiful 등의 단어를 섞어 고화질을 유도하세요.
      5. 부정 프롬프트 지시어 금지: 화면에 '없는 것'을 묘사하지 말고 '있는 것'만 묘사하세요.

      [CRITICAL: 오디오 지시사항]
      1. narration: **절대 (잠시후), (한숨) 같은 괄호나 지문을 적지 마세요.** 성우가 입으로만 낼 수 있는 "순수 대사"만 적으세요. 대사가 없으면 "" 빈칸으로 두세요.
      2. voice: 등장인물에 맞는 목소리 ID 하나를 적으세요. [onyx, echo, nova, shimmer] 중 택 1.
      3. audio_instructions: 이 대사를 칠 때 성우가 가져야 할 감정, 톤, 속도, 억양을 구체적으로 지시하세요.

      [출력 형식 JSON]
      {
        "storyboard": [
          { 
            "shot_number": 1, 
            "shot_size": "풀샷", 
            "camera_movement": "고정", 
            "action": "화면에 띄울 한국어 상황 묘사",
            "image_prompt": "A beautiful 4k HDR photograph of a poor rickshaw puller in 1920s Seoul rainy street, shot with a 35mm lens, dramatic lighting, cold muted colors.",
            "narration": "남대문 정거장까지 가오.",
            "voice": "onyx",
            "audio_instructions": "차갑고 무심한 목소리로, 귀찮다는 듯이 퉁명스럽게 말하세요."
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
