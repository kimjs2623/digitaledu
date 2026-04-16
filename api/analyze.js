import { VertexAI } from '@google-cloud/vertexai';

// 🎯 Vercel의 환경변수에서 프로젝트 정보와 인증 키를 가져옵니다.
const projectId = 'digitaledu-492813'; 
const location = 'us-central1'; 

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST 요청만 허용됩니다.' });

  try {
    const { chars, place, script, note, style } = req.body;
    if (!script) return res.status(400).json({ message: '대본이 없습니다.' });

    // 🎯 Vercel에 등록된 GCP_SERVICE_ACCOUNT_JSON을 사용하여 0원 모드(크레딧) 인증
    const credentials = process.env.GCP_SERVICE_ACCOUNT_JSON 
      ? JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON) 
      : undefined;

    const vertex_ai = new VertexAI({ 
      project: projectId, 
      location: location, 
      googleAuthOptions: { credentials } 
    });

    // Vertex AI용 Gemini 2.5 Flash 모델 로드
    const generativeModel = vertex_ai.getGenerativeModel({
      model: 'gemini-2.5-flash-001',
      generationConfig: { responseMimeType: "application/json" } // JSON 출력 강제
    });

    // 🎯 감독님의 아카데미상 수상 디렉터 페르소나 및 캐릭터 바이블 로직 (기존 그대로 유지)
    const systemPrompt = `
당신은 아카데미상을 수상한 시네마틱 아트 디렉터입니다.
주어진 대본을 분석하여 컷툰 콘티 JSON을 설계하세요.

[필수 규칙 - 매우 중요]
1. 🎯 캐릭터 일관성 (Character Bible): 'character_bible'에 모든 등장인물의 외모를 '매우 구체적인 영어 키워드'로 정의하세요. (예: 40-year-old Korean man, short messy hair, traditional hanbok, tired face). 이 영어 키워드가 일관성의 핵심이 됩니다.
2. 🎯 내면 묘사는 '속마음(독백)'으로 처리: "아내를 생각한다", "그리워한다" 같은 내면 지문이 있을 때, 절대 화면에 그 대상을(예: 아내) 등장시키거나 기괴한 이중노출로 그리지 마세요.
   - [이미지]: 주인공이 고개를 숙이거나, 비 오는 창밖을 멍하니 바라보는 등 '현재의 쓸쓸한 상태'만 구체적으로 묘사하세요.
   - [오디오]: 생각하는 내용은 'dialogues'에 추가하고, 반드시 \`emotion: "속마음"\` 이라고 기입하세요.
3. 멈춘 순간의 예술: 한 컷 안에서 일어나는 행동의 변화를 적지 마세요. 단 한 장의 정지된 사진을 묘사하세요.
4. 다중 대사 분리: 한 장면에서 여러 명이 말하면 발화자별로 대사를 나누세요.
5. 텍스트 배제: 이미지 프롬프트 안에 대사나 글씨를 절대 넣지 마세요.

[입력 정보]
- 등장인물: ${chars}
- 배경: ${place}
- 연출 의도: ${note}
- 작화 스타일: ${style}

[JSON 출력 규격]
{
  "character_bible": {
    "인물명": "구체적인 외모 및 의상 영어 키워드 (예: 40-year-old Korean man, traditional hat...)"
  },
  "scenes": [
    {
      "shot_composition": "바스트 샷 / 클로즈업 등",
      "image_prompt": "화면에 그려질 현재의 구체적 상황 (한국어)",
      "transition": "cut | fade",
      "dialogues": [
        { "speaker": "인물명", "text": "대사 (또는 생각 내용)", "emotion": "자연스럽게 / 속마음 / 분노 등" }
      ]
    }
  ]
}
    `;

    const request = {
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n[입력 대본]\n${script}` }] }],
    };

    // Vertex AI 모델 실행
    const result = await generativeModel.generateContent(request);
    const responseText = result.response.candidates[0].content.parts[0].text;
    
    // JSON 파싱 및 데이터 정제
    let sceneData = JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '').trim());

    // 🎯 생성된 영어 캐릭터 바이블을 매 프롬프트마다 백그라운드로 강제 주입하여 일관성 보장! (기존 로직 유지)
    sceneData.scenes = sceneData.scenes.map(scene => {
      let injectedPrompt = `${scene.image_prompt}, ${scene.shot_composition}. `;
      Object.keys(sceneData.character_bible || {}).forEach(charName => {
        if (injectedPrompt.includes(charName) || (scene.dialogues && scene.dialogues.some(d => d.speaker === charName))) {
          injectedPrompt = `[Character Appearance: ${sceneData.character_bible[charName]}], ${injectedPrompt}`;
        }
      });
      injectedPrompt = `${injectedPrompt} ${style} 스타일, 고품질.`;
      return { ...scene, image_prompt: injectedPrompt };
    });

    return res.status(200).json(sceneData);

  } catch (error) {
    console.error("Vertex AI Analyze Error:", error);
    return res.status(500).json({ message: error.message });
  }
}
