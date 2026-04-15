export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, scenario, note } = req.body;
    
    // 🎯 맥락, 대화 흐름, 다중 컷 분할을 강제하는 프롬프트
    const promptText = `
      당신은 할리우드 수석 영화 감독입니다.
      다음 시나리오를 바탕으로 시각적인 컷(Shot) 단위 스토리보드를 구성하세요.

      [입력 정보]
      - 등장인물: ${chars}
      - 장소 및 시대: ${place}
      - 시나리오 원문: "${scenario}"
      - 연출 의도: ${note}

      [핵심 지시사항]
      1. CRITICAL: 단편적인 한 장면만 묘사하지 마세요. 시나리오의 흐름, 인물 간의 대화 양상, 감정의 변화가 서사적으로 이어지도록 **반드시 3~5개의 컷(Shot)으로 세분화**하여 시퀀스를 구성하세요.
      2. 각 컷의 'action'(피사체의 행동/표정/상황)과 'camera_movement'(카메라 앵글 및 워킹)는 학생이 쉽게 읽고 수정할 수 있도록 **구체적인 한국어**로 작성하세요.
      3. 'shot_size'는 풀샷, 바스트샷, 클로즈업 등 컷의 크기를 한국어로 적어주세요.

      [출력 형식 (반드시 아래 JSON 형태를 엄수할 것)]
      {
        "storyboard": [
          {
            "shot_number": 1,
            "shot_size": "풀샷",
            "camera_movement": "고정된 앵글에서 천천히 패닝",
            "action": "비가 내리는 경성 거리, 인력거꾼 김 첨지가 학생과 거리를 두고 서서 대화하는 상황."
          },
          {
            "shot_number": 2,
            "shot_size": "바스트샷",
            "camera_movement": "인물의 얼굴로 부드럽게 줌인",
            "action": "학생이 무심한 표정으로 남대문 정거장까지 가자고 말하는 모습."
          }
        ]
      }
    `;

    // 서버 혼잡(High demand) 방어 로직 내장
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
      throw new Error("구글 AI 서버 접속자가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
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
