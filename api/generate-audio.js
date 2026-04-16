import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST 요청만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");

    const { dialogues, characters = [] } = req.body; 
    
    const validDialogues = (dialogues || []).filter(d => d.text && d.text.trim() !== "");
    if (validDialogues.length === 0) return res.status(400).json({ message: '대사가 없습니다.' });

    const ai = new GoogleGenAI({ apiKey: apiKey });

    const cleanDialogues = validDialogues.map((d, i) => {
        let cleanName = (d.speaker || `Speaker${i}`).replace(/[^a-zA-Z0-9가-힣]/g, '');
        if (!cleanName) cleanName = `Speaker${i}`;
        return { ...d, cleanSpeaker: cleanName };
    });

    const uniqueSpeakers = [...new Set(cleanDialogues.map(d => d.cleanSpeaker))].slice(0, 5);
    
    // 🎯 [핵심 픽스] 목소리 랜덤 배정 방지 -> 이름 기반 수학적 해싱(Hash)으로 고정
    function getDeterministicVoice(name, gender, ageCategory) {
        let candidates = [];
        if (gender === 'F') {
            candidates = ageCategory === 'old' ? ['Leda', 'Callirrhoe'] : ['Kore', 'Aoede', 'Despina'];
        } else {
            candidates = ageCategory === 'old' ? ['Charon', 'Fenrir', 'Iapetus'] : ['Puck', 'Zephyr', 'Orus'];
        }
        
        // 이름 글자들의 유니코드 값을 더해서 배열 크기로 나눈 나머지를 사용 = 항상 똑같은 성우 당첨!
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
        return candidates[hash % candidates.length];
    }

    const speakerConfigs = uniqueSpeakers.map((speakerName) => {
      const charInfo = characters.find(c => c.name && (c.name === speakerName || speakerName.includes(c.name)));
      const desc = charInfo ? (charInfo.desc || "").toLowerCase() : "";

      let gender = 'M'; let age = 'young'; 
      if (desc) {
          if (/(여|소녀|아줌마|할머니|부인|엄마|딸|아내|girl|woman|female)/.test(desc)) gender = 'F';
          if (/(40대|50대|60대|70대|노인|할아|할머|중년|아저씨|old|elderly)/.test(desc)) age = 'old';
      } else {
          if (/(할머니|아주머니|소녀|아내|여|엄마|딸)/.test(speakerName)) gender = 'F';
          if (/(할아버지|할아|아저씨|영감|첨지|노인|아빠)/.test(speakerName)) age = 'old';
      }

      return {
        speaker: speakerName,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: getDeterministicVoice(speakerName, gender, age) } }
      };
    });

    // 🎯 속마음(독백) 연출 지시어 처리
    let directorPrompt = "";
    let speechConfig = {};

    if (uniqueSpeakers.length === 1) {
        const singleTranscript = cleanDialogues.map(d => {
            // 속마음일 경우 시스템에 조용히 속삭이도록 지시
            const emotionText = d.emotion === '속마음' ? `(whispering, as an internal monologue) ` : (d.emotion ? `[${d.emotion} 감정으로] ` : "");
            return `${emotionText}${d.text}`;
        }).join('\n\n');
        
        directorPrompt = `당신은 전문 성우입니다. 다음 대본을 상황에 맞게 연기해주세요.\n\n${singleTranscript}`;
        speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerConfigs[0].voiceConfig.prebuiltVoiceConfig.voiceName } } };
    } else {
        const combinedTranscript = cleanDialogues.map(d => {
            const emotionText = d.emotion === '속마음' ? `(whispering to self, internal thought) ` : (d.emotion ? `(in a ${d.emotion} tone) ` : "");
            return `${d.cleanSpeaker}: ${emotionText}${d.text}`;
        }).join('\n\n');

        directorPrompt = `Perform this scene realistically. Distinctly change voices based on the speaker. Pay special attention to 'internal thought' or whispering directions.\n\n# TRANSCRIPT\n${combinedTranscript}`;
        speechConfig = { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakerConfigs } };
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: directorPrompt }] }],
      config: { responseModalities: ['AUDIO'], speechConfig: speechConfig },
    });

    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) throw new Error("오디오 데이터를 반환받지 못했습니다.");

    const pcmBuffer = Buffer.from(data, 'base64');
    const wavBuffer = encodeWAV(pcmBuffer, 24000);
    return res.status(200).json({ success: true, audioUrl: `data:audio/wav;base64,${wavBuffer.toString('base64')}` });

  } catch (error) {
    console.error("Audio API Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

function encodeWAV(pcmBuffer, sampleRate) {
  const header = Buffer.alloc(44); const length = pcmBuffer.length;
  header.write('RIFF', 0); header.writeUInt32LE(36 + length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(length, 40);
  return Buffer.concat([header, pcmBuffer]);
}
