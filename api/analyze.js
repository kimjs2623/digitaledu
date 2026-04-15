import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST 요청만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { chars, place, script, note, style } = req.body;
    if (!script) return res.status(400).json({ message: '대본이 없습니다.' });

    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `
당신은 아카데미상을 수상한 시네마틱 아트 디렉터입니다.
주어진 대본을 분석하여, 웹툰(컷툰)의 컷들로 변환할 수 있는 JSON 데이터를 설계하세요.

[필수 규칙 - 매우 중요]
1. 학생 친화적 프롬프트: 'image_prompt'는 학생들이 직접 읽고 수정할 수 있도록 반드시 **자연스러운 한국어 문장**으로 구체적으로 묘사하세요. (예: "비가 내리는 어두운 1920년대 경성 거리, 낡은 한복을 입은 40대 인력거꾼이 슬픈 표정으로 서 있다.")
2. 멈춘 순간의 예술: 동영상 콘티처럼 행동의 변화를 묘사하지 마세요. 단 한 장의 정지된 시네마틱 사진을 묘사해야 합니다.
3. 역동적 대화 장면: 대화 장면은 반드시 'Two-shot(투샷)' 등을 명시하고 두 사람의 상호작용을 묘사하세요.
4. 다중 대사 완벽 분리: 한 장면에서 여러 명이 말하면, 'dialogues' 배열에 발화자(speaker)별로 대사를 정확히 나누어 담으세요.

[입력 정보]
- 등장인물: ${chars}
- 배경: ${place}
- 연출 의도: ${note}
- 작화 스타일: ${style}

[JSON 출력 규격]
{
  "scenes": [
    {
      "shot_composition": "바스트 샷 / 투 샷 / 클로즈업",
      "action": "화면 하단에 들어갈 상황 설명 자막 (한국어)",
      "image_prompt": "장면을 묘사하는 구체적인 한국어 프롬프트 (대사나 지시어 포함 절대 금지. 오직 시각적 묘사만)",
      "dialogues": [
        { "speaker": "인물명", "text": "순수 대사 내용", "emotion": "슬프게, 화나게 등" }
      ]
    }
  ]
}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [{ parts: [{ text: `${systemPrompt}\n\n[입력 대본]\n${script}` }] }],
      config: { responseMimeType: "application/json" }
    });

    const responseText = response.candidates[0].content.parts[0].text;
    const sceneData = JSON.parse(responseText);

    // 사용자가 선택한 작화 스타일을 한국어 프롬프트 끝에 자연스럽게 덧붙여줍니다.
    sceneData.scenes = sceneData.scenes.map(scene => ({
      ...scene,
      image_prompt: `${scene.image_prompt}, ${style} 스타일, 고화질 명작.`
    }));

    return res.status(200).json(sceneData);

  } catch (error) {
    console.error("Analyze Error:", error);
    return res.status(500).json({ message: error.message });
  }
}
