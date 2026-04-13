export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, scenario, note } = req.body;
    
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
      3. 'master_prompt'는 비디오 AI(Veo)에 입력할 최종 프롬프트이므로 반드시 **완벽한 영문**으로 작성하되, "No text overlays" 조건을 추가하세요.

      반드시 아래 JSON 형식에 맞추어 답변하세요. 다른 부가 설명은 절대 금지합니다.
      {
        "storyboard": [
          {
            "shot_number": 1,
            "shot_size": "클로즈업 (Close-Up)",
            "camera_movement": "천천히 줌인 (Slow zoom in)",
            "action": "비에 젖은 얼굴, 놀라며 갈등하는 표정"
          }
        ],
        "master_prompt": "Cinematic master English prompt..."
      }
    `;

    // 💡 1. [자동 재시도 로직] - 서버 혼잡(High demand) 발생 시 몰래 재시도
    const fetchWithRetry = async (url, options, retries = 3, backoff = 2000) => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        const data = await response.json();
        
        // 에러 코드가 503(서버 혼잡)이거나 메시지에 demand가 포함된 경우
        if (data.error && (data.error.code === 503 || data.error.message.includes('demand'))) {
          console.log(`[서버 혼잡] ${backoff}ms 대기 후 재시도 (${i+1}/${retries})...`);
          await new Promise(r => setTimeout(r, backoff));
          backoff *= 2; // 2초 -> 4초 -> 8초로 늘려가며 대기
          continue;
        }
        return data;
      }
      throw new Error("구글 AI 서버 접속자가 너무 많아 처리가 지연되었습니다. 10초 뒤 다시 시도해 주세요.");
    };

    const data = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        // maxOutputTokens를 제거하여 답변이 잘려 JSON이 깨지는 현상 방지
        generationConfig: { responseMimeType: "application/json" } 
      })
    });

    if (data.error) throw new Error(data.error.message);

    // 💡 2. [JSON 세척 로직] - AI가 마크다운(```json)을 섞어 보내도 강제 정제
    let rawText = data.candidates[0].content.parts[0].text;
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    const result = JSON.parse(rawText);
    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error("Analyze Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
