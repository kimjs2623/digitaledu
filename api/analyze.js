export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
    
    const { chars, place, scenario, note, style } = req.body;
    
    const promptText = `
      당신은 할리우드 영화 감독이자 Google Imagen 프롬프트 엔지니어입니다.

      [입력 정보] 
      인물: ${chars} / 장소: ${place} / 연출: ${note} / 스타일: ${style} / 시나리오: "${scenario}"

      [서사 및 디테일 지시사항]
      1. 시나리오의 처음부터 끝까지 생략 없이 3~5컷으로 나눕니다.
      
      [CRITICAL: 이미지 프롬프트 (image_prompt) 작성 규칙]
      1. 단어의 나열이 아닌, 설명적이고 명확한 서술형 문장(Descriptive sentences)으로 영문 작성하세요.
      2. 구조: [Subject] + [Context(배경, 조명, 날씨)] + [Style]
      3. **카메라 및 구도 자율 선택:** 각 장면의 감정에 가장 잘 어울리는 카메라 렌즈와 앵글(예: 35mm portrait lens, 100mm macro lens, wide-angle 10mm, low angle 등)을 프롬프트에 포함시키세요.
      4. 고화질 유도: 4k, HDR, highly detailed, cinematic 키워드 포함.
      5. 부정 지시어 금지: '없는 것'을 묘사하지 말고 '있는 것'만 묘사.

      [CRITICAL: 오디오 지시사항]
      1. narration: 절대 (잠시후), (한숨) 같은 괄호나 지문을 적지 마세요. 입으로 소리낼 "순수 대사"만 적으세요. 대사가 없으면 "" 빈칸.
      2. voice: 인물에 맞는 목소리 ID 하나 선택 [onyx, echo, nova, shimmer]
      3. audio_instructions: 감정, 톤, 속도, 억양 구체적 지시.

      [출력 형식 JSON]
      {
        "storyboard": [
          { 
            "shot_number": 1, 
            "shot_size": "풀샷", 
            "camera_movement": "고정", 
            "action": "화면에 띄울 한국어 상황 묘사",
            "image_prompt": "A beautiful 4k HDR photograph of a poor rickshaw puller in 1920s Seoul rainy street, shot with a 35mm portrait lens, dramatic lighting, cold muted colors.",
            "narration": "남대문 정거장까지 가오.",
            "voice": "onyx",
            "audio_instructions": "차갑고 무심한 목소리로, 귀찮다는 듯이 퉁명스럽게 말하세요."
          }
        ]
      }
    `;

    const fetchWithRetry = async (url, options, retries = 4, backoff = 2000) => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (!response.ok || data.error) {
           const errorCode = response.status || data.error?.code;
           if (errorCode === 503 || errorCode === 429 || data.error?.message?.includes('demand')) {
             console.log(`[분석 API 혼잡] ${backoff}ms 대기 후 재시도 (${i+1}/${retries})...`);
             await new Promise(r => setTimeout(r, backoff)); 
             backoff *= 2; 
             continue;
           }
           throw new Error(data.error?.message || "분석 API 오류");
        }
        return data;
      }
      throw new Error("AI 서버 접속자가 많아 응답이 지연되고 있습니다.");
    };

    const data = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }], generationConfig: { responseMimeType: "application/json" } })
    });

    if (!data.candidates || !data.candidates[0]) throw new Error("AI 응답을 파싱할 수 없습니다.");
    let rawText = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return res.status(200).json({ success: true, data: JSON.parse(rawText) });

  } catch (error) { 
    console.error("Analyze Error:", error);
    return res.status(500).json({ success: false, message: error.message }); 
  }
}
