import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'POST만 허용됩니다.' });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY 환경변수가 없습니다.");

    const { text, voice, instructions } = req.body;
    if (!text) return res.status(400).json({ message: '텍스트가 없습니다.' });

    // 감독님이 제공해주신 공식 OpenAI 라이브러리 초기화
    const openai = new OpenAI({ apiKey: apiKey });

    // 공식 SDK를 활용한 음성 생성 (instructions 파라미터 완벽 지원)
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voice || "coral", // 감독님 예시 코드의 coral 적용
      input: text,
      instructions: instructions || "Speak in a natural and clear tone.",
    });

    // Vercel 서버에서는 파일 저장이 불가능하므로 Buffer를 Base64로 변환하여 웹으로 전송
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64Audio = buffer.toString('base64');
    const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

    return res.status(200).json({ success: true, audioUrl: audioUrl });

  } catch (error) {
    console.error("OpenAI Audio SDK Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
