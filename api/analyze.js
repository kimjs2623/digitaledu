export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, scenario, note } = req.body;
    
    const promptText = `
      당신은 영화 감독입니다. 시나리오를 바탕으로 스토리보드를 구성하세요.
      [입력 정보] 인물: ${chars} / 장소: ${place} / 시나리오: "${scenario}" / 연출: ${note}

      [CRITICAL 에러 방지 규칙 - 절대 엄수]
      1. JSON 형식을 무조건 지키세요. 문자열 값 내부에 절대 쌍따옴표(")나 줄바꿈(\\n)을 사용하지 마세요. 파싱 에러(Expected ',' or '}')가 발생합니다.
      2. master_prompt 작성 시 영상에 글자가 깨져 나오는 것을 막기 위해 반드시 다음 문장을 끝에 추가하세요: "Absolutely NO text, NO watermarks, NO letters, NO typography, clean image."

      [지시사항]
      - 시퀀스를 3~5개의 컷으로 나누고, 'action'과 'camera_movement'는 한국어로 작성.
      
      [출력 형식 JSON]
      {
        "storyboard": [
          { "shot_number": 1, "shot_size": "클로즈업", "camera_movement": "줌인", "action": "상황 묘사" }
        ],
        "master_prompt": "Cinematic shot... Absolutely NO text, NO watermarks."
      }
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json" } 
      })
    });

    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    return res.status(200).json({ success: true, data: JSON.parse(rawText) });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
