export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, scenario, note } = req.body;
    
    // 🎯 앞부분(빌드업) 생략 금지 및 맥락 유지 지시
    const promptText = `
      당신은 철저하고 세심한 영화 감독입니다. 다음 시나리오를 바탕으로 스토리보드를 구성하세요.

      [입력 정보]
      - 등장인물: ${chars}
      - 장소 및 시대: ${place}
      - 시나리오 원문: "${scenario}"
      - 연출 의도: ${note}

      [CRITICAL 에러 방지 규칙 - 절대 엄수]
      1. JSON 형식을 무조건 지키세요. 문자열 내부에 쌍따옴표(")나 줄바꿈(\\n) 사용을 엄격히 금지합니다.
      2. master_prompt의 끝에는 반드시 다음을 추가하세요: "Absolutely NO text, NO watermarks, NO letters, NO typography, clean image."

      [스토리보드 구성 핵심 지시사항 - 서사 누락 절대 금지]
      1. 시간순 전개 100% 반영: 시나리오의 **'맨 첫 줄(시작 상황/첫 대사)'부터 '마지막 줄'까지 순서대로** 모두 컷으로 구성하세요. 절대 앞부분의 서사나 대화의 빌드업(예: 목적지를 묻고, 거절하고, 제안하는 과정)을 건너뛰고 하이라이트로 직행하지 마세요.
      2. 대화의 맥락 시각화: 인물 간의 대화가 있다면 그 대화가 어떤 흐름으로 진행되고 있는지 각 컷의 'action'(상황 묘사)에 구체적으로 풀어쓰세요.
      3. 전체 흐름이 자연스럽게 이어지도록 3~5개의 컷(Shot)으로 세분화하고, 'action'과 'camera_movement'는 한국어로 작성하세요.

      [출력 형식 JSON]
      {
        "storyboard": [
          { "shot_number": 1, "shot_size": "풀샷", "camera_movement": "고정", "action": "시나리오의 가장 첫 상황 묘사..." }
        ],
        "master_prompt": "Cinematic shot... Absolutely NO text."
      }
    `;

    // 💡 503 에러 발생 시 몰래 재시도하는 방어벽 로직 (복구됨)
    const fetchWithRetry = async (url, options, retries = 3, backoff = 2000) => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (data.error) {
           if (data.error.code === 503 || data.error.message.includes('demand')) {
             console.log(`[서버 혼잡] ${backoff}ms 대기 후 재시도 (${i+1}/${retries})...`);
             await new Promise(r => setTimeout(r, backoff));
             backoff *= 2; // 2초, 4초, 8초 점진적 대기
             continue;
           }
           throw new Error(data.error.message);
        }
        return data;
      }
      throw new Error("구글 AI 서버 접속자가 너무 많아 처리가 지연되었습니다. 잠시 후 다시 시도해 주세요.");
    };

    const data = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json" } 
      })
    });

    // 💡 Cannot read properties of undefined 방어 (AI가 헛소리 보낼 때 강제 셧다운 방지)
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error("AI가 유효한 응답을 반환하지 않았습니다. 다시 시도해주세요.");
    }

    // JSON 불순물 제거 및 파싱
    let rawText = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(rawText);
    
    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error("Analyze Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
