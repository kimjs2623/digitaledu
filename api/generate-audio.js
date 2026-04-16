import { VertexAI } from '@google-cloud/vertexai';

// 🎯 프로젝트 정보 설정
const projectId = 'digitaledu-492813';
const location = 'us-central1';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST 요청만 허용됩니다.' });

  try {
    // 🎯 Vercel에 등록된 GCP_SERVICE_ACCOUNT_JSON을 사용하여 0원 모드(크레딧) 인증
    const jsonKeyString = process.env.GCP_SERVICE_ACCOUNT_JSON;
    if (!jsonKeyString) throw new Error("GCP_SERVICE_ACCOUNT_JSON이 없습니다.");
    
    const credentials = JSON.parse(jsonKeyString);
    const { dialogues, characters = [] } = req.body; 
    
    const validDialogues = (dialogues || []).filter(d => d.text && d.text.trim() !== "");
    if (validDialogues.length === 0) return res.status(400).json({ message: '대사가 없습니다.' });

    // Vertex AI 초기화
    const vertex_ai = new VertexAI({ 
      project: projectId, 
      location: location, 
      googleAuthOptions: { credentials } 
    });

    const cleanDialogues = validDialogues.map((d, i) => {
        let cleanName = (d.speaker || `Speaker${i}`).replace(/[^a-zA-Z0-9가-힣]/g, '');
        if (!cleanName) cleanName = `Speaker${i}`;
        return { ...d, cleanSpeaker: cleanName };
    });

    const uniqueSpeakers = [...new Set(cleanDialogues.map(d => d.cleanSpeaker))].slice(0, 5);
    
    // 🎯 이름 기반 수학적 해싱으로 일관된 목소리 배정 로직 (기존 유지)
    function getDeterministicVoice(name, gender, ageCategory) {
        let candidates = [];
        if (gender === 'F') {
            candidates = ageCategory === 'old' ? ['Leda', 'Aoede', 'Callirrhoe'] : ['Kore', 'Despina'];
        } else {
            candidates = ageCategory === 'old' ? ['Charon', 'Zephyr', 'Fenrir', 'Iapetus'] : ['Puck', 'Orus'];
        }
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
        return candidates[hash % candidates.length];
    }

    const speakerConfigs = uniqueSpeakers.map((speakerName) => {
      const manualVoiceDialogue = cleanDialogues.find(d => d.cleanSpeaker === speakerName && d.voice && d.voice !== 'auto');
      if (manualVoiceDialogue) {
          return {
              speaker: speakerName,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: manualVoiceDialogue.voice } }
          };
      }

      const charInfo = characters.find(c => c.name && (c.name === speakerName || speakerName.includes(c.name)));
      const desc = charInfo ? (charInfo.desc || "").toLowerCase() : "";

      let gender = 'M'; let age = 'young'; 
      if (desc) {
          if (/(여|소녀|아줌마|할머니|부인|엄마|딸|아내|girl|woman|female)/.test(desc)) gender = 'F';
          if (/(30대 후반|40대|50대|60대|70대|노인|할아|할머|중년|아저씨|old|elderly)/.test(desc)) age = 'old';
      } else {
          if (/(할머니|아주머니|소녀|아내|여|엄마|딸)/.test(speakerName)) gender = 'F';
          if (/(할아버지|할아|아저씨|영감|첨지|노인|아빠)/.test(speakerName)) age = 'old';
      }

      return {
        speaker: speakerName,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: getDeterministicVoice(speakerName, gender, age) } }
      };
    });

    let directorPrompt = "";
    let speechConfig = {};

    if (uniqueSpeakers.length === 1) {
        const singleTranscript = cleanDialogues.map(d => {
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

    // 🎯 Vertex AI 전용 TTS 모델 호출
    const generativeModel = vertex_ai.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-tts',
    });

    const response = await generativeModel.generateContent({
      contents: [{ parts: [{ text: directorPrompt }] }],
      generationConfig: { 
        responseModalities: ['AUDIO'], 
        speechConfig: speechConfig 
      },
    });

    const data = response.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) throw new Error("오디오 데이터를 반환받지 못했습니다.");

    const pcmBuffer = Buffer.from(data, 'base64');
    const wavBuffer = encodeWAV(pcmBuffer, 24000);
    return res.status(200).json({ success: true, audioUrl: `data:audio/wav;base64,${wavBuffer.toString('base64')}` });

  } catch (error) {
    console.error("Vertex AI Audio Error:", error);
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
