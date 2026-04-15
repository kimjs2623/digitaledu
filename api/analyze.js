import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST 요청만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const { script } = req.body;
    if (!script) return res.status(400).json({ message: '대본이 없습니다.' });

    const ai = new GoogleGenAI({ apiKey });

    // 🎯 1, 2, 3, 4번 문제를 해결하기 위한 고도화된 프롬프트 엔진
    const systemPrompt = `
당신은 아카데미상을 수상한 시네마틱 아트 디렉터입니다.
주어진 대본을 분석하여, 정지된 웹툰(컷툰)의 컷들로 변환할 수 있는 JSON 데이터를 완벽하게 설계하세요.

[필수 규칙 - 매우 중요]
1. 인물 일관성 (Character Consistency): 'character_bible'에 모든 등장인물의 외모(나이, 성별, 헤어스타일, 특징적인 의상 색상)를 구체적인 영문으로 고정하세요.
2. 멈춘 순간의 예술 (Frozen Moment): 동영상 콘티처럼 행동의 변화를 묘사하지 마세요. 해당 장면의 감정과 역동성을 가장 잘 보여주는 "단 한 장의 정지된 시네마틱 사진"으로 'image_prompt'를 작성하세요.
3. 역동적 대화 장면 (Dynamic Interaction): 대화가 이루어지는 장면은 반드시 'Two-shot' 또는 'Over-the-shoulder shot'을 명시하고, 두 사람의 표정과 제스처를 묘사하여 사진만으로 스토리를 알 수 있게 하세요.
4. 다중 대사 완벽 분리: 한 장면에서 여러 명이 말하면, 'dialogues' 배열에 발화자(speaker)별로 대사를 정확히 나누어 담으세요.
5. 텍스트 배제: 'image_prompt' 안에는 절대 대사 내용, 지시사항, 'Subtitle', 'Text' 같은 단어를 넣지 마세요. 오직 시각적 묘사만 들어갑니다.

[JSON 출력 규격]
{
  "character_bible": {
    "인물A": "detailed physical description, clothing style (English)",
    "인물B": "detailed physical description, clothing style (English)"
  },
  "scenes": [
    {
      "scene_number": 1,
      "image_prompt": "highly detailed visual description of the frozen moment, composition (English)",
      "shot_composition": "Wide Shot / Two-shot / Close-up",
      "dialogues": [
        { "speaker": "인물A", "text": "첫 번째 대사 내용", "emotion": "감정 톤" },
        { "speaker": "인물B", "text": "두 번째 대사 내용", "emotion": "감정 톤" }
      ]
    }
  ]
}
    `;

    // 최상의 논리적 추론을 위해 Pro급 모델에 준하는 최신 모델 호출
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro", // Pro 모델 지정
      contents: [{ parts: [{ text: `${systemPrompt}\n\n[입력 대본]\n${script}` }] }],
      config: { responseMimeType: "application/json" }
    });

    const responseText = response.candidates[0].content.parts[0].text;
    let sceneData = JSON.parse(responseText);

    // 🎯 1번 문제 완벽 해결: 생성된 이미지 프롬프트에 캐릭터 바이블(외모 묘사)을 강제 주입
    sceneData.scenes = sceneData.scenes.map(scene => {
      let injectedPrompt = `${scene.image_prompt}, ${scene.shot_composition}. `;
      
      // 장면에 등장하는 인물을 찾아 해당 인물의 고정된 외모 묘사를 덧붙임
      Object.keys(sceneData.character_bible).forEach(charName => {
        // 이미지 프롬프트나 대화에 인물이 등장하는지 체크
        if (injectedPrompt.includes(charName) || scene.dialogues.some(d => d.speaker === charName)) {
          injectedPrompt = `[${charName}: ${sceneData.character_bible[charName]}], ${injectedPrompt}`;
        }
      });

      return {
        ...scene,
        image_prompt: injectedPrompt
      };
    });

    return res.status(200).json(sceneData);

  } catch (error) {
    console.error("Analyze Error:", error);
    return res.status(500).json({ message: error.message });
  }
}
