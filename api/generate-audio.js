export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.OPENAI_API_KEY; 
    if (!apiKey) throw new Error("OPENAI_API_KEY 환경변수가 없습니다.");

    // 프론트엔드에서 정확히 text, voice, instructions 3개를 받습니다.
    const { text, voice, instructions } = req.body;
    if (!text) return res.status(400).json({ message: '텍스트가 없습니다.' });

    // OpenAI 최신 gpt-4o-mini-tts 모델 호출
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts", // 최신 감정 연기 모델
        voice: voice || "alloy",
        input: text,
        instructions: instructions || "자연스럽게 말하세요." // 감정 연기 지시 파라미터 적용
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || "오디오 생성 실패");
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');
    const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

    return res.status(200).json({ success: true, audioUrl: audioUrl });

  } catch (error) {
    console.error("Audio API Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
