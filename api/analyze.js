export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, scenario, note } = req.body;
    
    // 🎯 에러 방지를 위해 가장 안정적인 모델(gemini-2.0-flash) 사용 권장 및 한국어 출력 지시
    const promptText = `
      당신은 할리우드 수석 영화 감독이자 비디오 AI 프롬프트 엔지니어입니다.
      다음 시나리오를 바탕으로 시각적인 컷(Shot) 단위 스토리보드를 구성하세요.

      [입력 정보]
      - 등장인물: ${chars}
      - 장소 및 시대: ${place}
      - 시나리오: "${scenario}"
      - 연출 의도: ${note}

      [지시사항]
      1. 시나리오를 2~3개의 논리적인 카메라 컷(Shot)으로 나눕니다.
      2. 학생들의 이해를 돕기 위해 각 컷의 'action'(피사체의 행동/표정)과 'camera_movement'(카메라 워킹)는 반드시 **한국어**로 구체적으로 작성하세요.
      3. 'master_prompt'는 비디오 AI(Veo 3.1)에 입력할 최종 마스터 프롬프트이므로 반드시 **완벽한 영문**으로 작성하되, 화면에 글자/자막이 생성되지 않도록 "No text overlays" 조건을 추가하세요.

      반드시 아래 JSON 형식에 맞추어 답변하세요:
      {
        "storyboard": [
          {
            "shot_number": 1,
            "shot_size": "클로즈업 (Close-Up)",
            "camera_movement": "천천히 줌인 (Slow zoom in)",
            "action": "비에 젖은 김 첨지의 얼굴, 돈을 보고 놀라며 갈등하는 표정"
          }
        ],
        "master_prompt": "Cinematic master English prompt for Veo 3.1..."
      }
    `;

    // 💡 만약 계속 에러가 난다면 여기 모델명을 'gemini-1.5-flash'로 낮춰보세요.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1500 }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error("Analyze Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
