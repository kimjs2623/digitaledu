import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST 요청만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");

    const { dialogues } = req.body; 
    if (!dialogues || dialogues.length === 0) return res.status(400).json({ message: '대사 데이터가 없습니다.' });

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // 구글 멀티스피커 보이스 목록
    const availableVoices = ['Kore', 'Puck', 'Charon', 'Aoede', 'Zephyr'];
    
    // 장면에 등장하는 유니크한 화자(Speaker) 목록 추출 (최대 5명)
    const uniqueSpeakers = [...new Set(dialogues.map(d => d.speaker))].slice(0, 5);
    
    // 화자별 목소리 자동 할당
    const speakerConfigs = uniqueSpeakers.map((speakerName, index) => ({
      speaker: speakerName,
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: availableVoices[index % availableVoices.length] }
      }
    }));

    // 전체 대사 스크립트 결합 (디렉터스 노트 형태)
    const combinedTranscript = dialogues.map(d => 
      `${d.speaker}: (in a ${d.emotion || "natural"} tone) ${d.text}`
    ).join('\n\n');

    const directorPrompt = `
      # DIRECTOR'S NOTES
      Perform this scene realistically. Distinctly change voices based on the speaker.
      
      # TRANSCRIPT
      ${combinedTranscript}
    `;

    // Gemini 다중 화자 TTS 호출
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: directorPrompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: speakerConfigs
          }
        },
      },
    });

    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) throw new Error("오디오 데이터 생성 실패");

    // PCM -> WAV 변환 (브라우저 재생용)
    const pcmBuffer = Buffer.from(data, 'base64');
    const wavBuffer = encodeWAV(pcmBuffer, 24000);
    const audioUrl = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;

    return res.status(200).json({ success: true, audioUrl: audioUrl });

  } catch (error) {
    console.error("Google Multi-speaker TTS Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

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
