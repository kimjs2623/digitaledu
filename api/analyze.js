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
주어진 대본을 분석하여, 정지된 웹툰(컷툰)의 컷들로 변환할 수 있는 JSON 데이터를 완벽하게 설계하세요.

[필수 규칙 - 매우 중요]
1. 인물 일관성 (Character Consistency): 'character_bible'에 모든 등장인물의 외모를 한국어로 고정하세요.
2. 학생 친화적 프롬프트: 'image_prompt'는 학생들이 읽고 수정할 수 있도록 구체적인 **한국어 문장**으로 묘사하세요.
3. 멈춘 순간의 예술: 행동의 변화를 묘사하지 마세요. 감정과 역동성을 보여주는 "단 한 장의 정지된 시네마틱 사진"을 묘사하세요.
4. 역동적 대화 장면: 대화 장면은 반드시 '투 샷(Two-shot)' 등을 명시하고 표정과 제스처를 묘사하세요.
5. 다중 대사 분리: 한 장면에서 여러 명이 말하면, 'dialogues' 배열에 발화자(speaker)별로 대사를 나누어 담으세요. 대사가 없으면 빈 배열([])을 넣으세요.
6. 텍스트 배제: 'image_prompt' 안에는 대사 내용, 지시사항, '자막', 'Text' 같은 단어를 절대 넣지 마세요.

[입력 정보]
- 등장인물: ${chars}
- 배경: ${place}
- 연출 의도: ${note}
- 작화 스타일: ${style}

[JSON 출력 규격]
{
  "character_bible": {
    "인물명": "구체적인 외모 및 의상 묘사 (한국어)"
  },
  "scenes": [
    {
      "shot_composition": "바스트 샷 / 투 샷 / 클로즈업 등",
      "image_prompt": "장면을 묘사하는 구체적인 한국어 프롬프트 (글자/대사 묘사 금지)",
      "dialogues": [
        { "speaker": "인물명", "text": "순수 대사 내용", "emotion": "감정 지시" }
      ]
    }
  ]
}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: [{ parts: [{ text: `${systemPrompt}\n\n[입력 대본]\n${script}` }] }],
      config: { responseMimeType: "application/json" }
    });

    let responseText = response.candidates[0].content.parts[0].text;
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    let sceneData = JSON.parse(responseText);

    sceneData.scenes = sceneData.scenes.map(scene => {
      let injectedPrompt = `${scene.image_prompt}, ${scene.shot_composition}. `;
      Object.keys(sceneData.character_bible || {}).forEach(charName => {
        if (injectedPrompt.includes(charName) || (scene.dialogues && scene.dialogues.some(d => d.speaker === charName))) {
          injectedPrompt = `[${charName}: ${sceneData.character_bible[charName]}], ${injectedPrompt}`;
        }
      });
      injectedPrompt = `${injectedPrompt} ${style} 스타일, 고화질 명작.`;
      return { ...scene, image_prompt: injectedPrompt };
    });

    return res.status(200).json(sceneData);

  } catch (error) {
    console.error("Analyze Error:", error);
    return res.status(500).json({ message: error.message });
  }
}
