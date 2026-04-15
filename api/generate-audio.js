import { GoogleGenAI } from "@google/genai";

/**
 * Google Gemini 2.5 Flash TTS를 사용하여 오디오를 생성하는 백엔드 핸들러
 */
export default async function handler(req, res) {
  // POST 요청만 처리
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'POST 요청만 허용됩니다.' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");

    const { text, voice, instructions } = req.body;
    if (!text) return res.status(400).json({ message: '텍스트가 없습니다.' });

    // 1. Google 최신 공식 SDK 초기화
    const ai = new GoogleGenAI({ apiKey: apiKey });

    // 2. 보이스 매핑 (Gemini TTS 전용 보이스 리스트 활용)
    // 수업 상황에 맞춰 가장 자연스러운 목소리로 자동 매핑합니다.
    let voiceName = 'Kore'; // 기본값 (Firm)
    if (voice === 'onyx') voiceName = 'Charon';   // 중저음 남성 (Informative)
    if (voice === 'echo') voiceName = 'Puck';     // 밝은 남성 (Upbeat)
    if (voice === 'nova') voiceName = 'Aoede';    // 차분한 여성 (Breezy)
    if (voice === 'shimmer') voiceName = 'Zephyr'; // 활기찬 여성 (Bright)

    // 3. 디렉터스 노트(Director's Notes) 구조의 프롬프트 생성
    // 구글 공식 문서의 'Controllable TTS' 권장 사항을 따릅니다.
    const directorPrompt = `
      # AUDIO PROFILE: Virtual Actor
      
      # THE SCENE: A dramatic storytelling context.
      
      # DIRECTOR'S NOTES
      Style: ${instructions || "Speak naturally with proper emotional depth."}
      Pace: Natural conversational speed.
      Tone: Consistent with the character's emotion.

      # TRANSCRIPT
      ${text}
    `;

    // 4. Gemini 2.5 Flash TTS 모델 호출
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: directorPrompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { 
              voiceName: voiceName 
            },
          },
        },
      },
    });

    // 5. 응답 데이터 추출 (Base64 인코딩된 PCM 데이터)
    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) throw new Error("구글 TTS 응답에 오디오 데이터가 포함되어 있지 않습니다.");

    // 6. PCM 데이터를 WAV 포맷으로 변환 (브라우저 재생을 위해 필수)
    const pcmBuffer = Buffer.from(data, 'base64');
    
    // Gemini TTS는 기본적으로 24000Hz, Mono, 16-bit PCM 데이터를 반환합니다.
    const wavBuffer = encodeWAV(pcmBuffer, 24000);
    const audioUrl = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;

    // 7. 결과 반환
    return res.status(200).json({ success: true, audioUrl: audioUrl });

  } catch (error) {
    console.error("Google Gemini TTS Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "오디오 생성 중 오류가 발생했습니다." 
    });
  }
}

/**
 * Raw PCM 데이터를 브라우저에서 재생 가능한 WAV 파일로 인코딩하는 헬퍼 함수
 * @param {Buffer} pcmBuffer - 원본 PCM 데이터
 * @param {number} sampleRate - 샘플 레이트 (예: 24000)
 */
function encodeWAV(pcmBuffer, sampleRate) {
  const header = Buffer.alloc(44);
  const length = pcmBuffer.length;

  // RIFF 헤더
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + length, 4); // 전체 파일 크기 - 8
  header.write('WAVE', 8);

  // FMT 서브청크
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);         // fmt 청크 크기
  header.writeUInt16LE(1, 20);          // 오디오 포맷 (1 = PCM)
  header.writeUInt16LE(1, 22);          // 채널 수 (1 = Mono)
  header.writeUInt32LE(sampleRate, 24); // 샘플 레이트
  header.writeUInt32LE(sampleRate * 2, 28); // 바이트 레이트 (SampleRate * Channels * BitsPerSample/8)
  header.writeUInt16LE(2, 32);          // 블록 얼라인 (Channels * BitsPerSample/8)
  header.writeUInt16LE(16, 34);         // 샘플 당 비트 수 (16-bit)

  // Data 서브청크
  header.write('data', 36);
  header.writeUInt32LE(length, 40);     // 실제 데이터 크기

  return Buffer.concat([header, pcmBuffer]);
}
