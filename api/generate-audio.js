import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST 요청만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");

    const { dialogues, characters = [] } = req.body; 
    
    // 1. 유효한 대사만 필터링
    const validDialogues = (dialogues || []).filter(d => d.text && d.text.trim() !== "");
    if (validDialogues.length === 0) {
        return res.status(400).json({ message: '유효한 대사 데이터가 없습니다.' });
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // 2. 화자 이름 정제 (구글 API 오류 방지를 위해 특수문자 제거)
    const cleanDialogues = validDialogues.map((d, i) => {
        let cleanName = (d.speaker || `Speaker${i}`).replace(/[^a-zA-Z0-9가-힣]/g, '');
        if (!cleanName) cleanName = `Speaker${i}`;
        return { ...d, cleanSpeaker: cleanName };
    });

    const uniqueSpeakers = [...new Set(cleanDialogues.map(d => d.cleanSpeaker))].slice(0, 5);
    let usedVoices = new Set();
    
    // 🎯 나이/성별 매핑 엔진
    function getSmartVoice(gender, ageCategory) {
        let candidates = [];
        if (gender === 'F') {
            candidates = ageCategory === 'old' ? ['Leda', 'Callirrhoe'] : ['Kore', 'Aoede', 'Despina'];
        } else {
            candidates = ageCategory === 'old' ? ['Charon', 'Fenrir', 'Iapetus'] : ['Puck', 'Zephyr', 'Orus'];
        }
        let voice = candidates.find(v => !usedVoices.has(v)) || candidates[0];
        usedVoices.add(voice);
        return voice;
    }

    const speakerConfigs = uniqueSpeakers.map((speakerName) => {
      const charInfo = characters.find(c => c.name && (c.name === speakerName || speakerName.includes(c.name)));
      const desc = charInfo ? (charInfo.desc || "").toLowerCase() : "";

      let gender = 'M'; 
      let age = 'young'; 

      // 외모 묘사에서 키워드 추출 (키워드 대폭 확장)
      if (desc) {
          if (/(여|소녀|아줌마|할머니|부인|엄마|딸|아내|girl|woman|female)/.test(desc)) gender = 'F';
          if (/(40대|50대|60대|70대|노인|할아|할머|중년|아저씨|아줌마|엄마|아빠|old|elderly)/.test(desc)) age = 'old';
      } else {
          // 이름으로 유추
          if (/(할머니|아주머니|소녀|아내|여|엄마|딸)/.test(speakerName)) gender = 'F';
          if (/(할아버지|할아|아저씨|영감|첨지|노인|아빠)/.test(speakerName)) age = 'old';
      }

      return {
        speaker: speakerName,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: getSmartVoice(gender, age) } }
      };
    });

    // 3. 🎯 핵심 에러 픽스 및 감정(Emotion) 연출 강화
    let directorPrompt = "";
    let speechConfig = {};

    if (uniqueSpeakers.length === 1) {
        // [단일 화자] 400 에러 우회 + 단일 화자일 때도 감정 지시어 맵핑 추가
        const singleTranscript = cleanDialogues.map(d => {
            const emotionText = d.emotion ? `[${d.emotion} 감정으로] ` : "";
            return `${emotionText}${d.text}`;
        }).join('\n\n');
        
        directorPrompt = `당신은 전문 성우입니다. 다음 대본을 괄호 안의 감정과 상황에 맞게 매우 자연스럽게 연기하듯 읽어주세요.\n\n${singleTranscript}`;
        speechConfig = {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerConfigs[0].voiceConfig.prebuiltVoiceConfig.voiceName } }
        };
    } else {
        // [다중 화자] Multi-speaker 모드 사용
        const combinedTranscript = cleanDialogues.map(d => {
            const emotionText = d.emotion ? `(in a ${d.emotion} tone) ` : "";
            return `${d.cleanSpeaker}: ${emotionText}${d.text}`;
        }).join('\n\n');

        directorPrompt = `Perform this scene realistically. Distinctly change voices based on the speaker. Express the emotions perfectly.\n\n# TRANSCRIPT\n${combinedTranscript}`;
        speechConfig = {
            multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakerConfigs }
        };
    }

    // 4. API 호출
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: directorPrompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: speechConfig,
      },
    });

    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) throw new Error("오디오 데이터를 반환받지 못했습니다.");

    const pcmBuffer = Buffer.from(data, 'base64');
    const wavBuffer = encodeWAV(pcmBuffer, 24000);
    const audioUrl = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;

    return res.status(200).json({ success: true, audioUrl: audioUrl });

  } catch (error) {
    console.error("Audio API Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

// PCM to WAV 인코더
function encodeWAV(pcmBuffer, sampleRate) {
  const header = Buffer.alloc(44);
  const length = pcmBuffer.length;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(length, 40);
  return Buffer.concat([header, pcmBuffer]);
}
