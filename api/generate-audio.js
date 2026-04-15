export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    // OpenAI API Key가 필요합니다. 없으면 에러를 반환하여 프론트엔드가 브라우저 TTS로 대체하게 합니다.
    const apiKey = process.env.OPENAI_API_KEY; 
    if (!apiKey) throw new Error("OPENAI_API_KEY가 없습니다.");

    const { text, voice_prompt } = req.body;
    if (!text) return res.status(400).json({ message: '텍스트가 없습니다.' });

    // 목소리 톤 자동 매칭 (voice_prompt를 분석하여 남성/여성 할당)
    let voice = "onyx"; // 기본 중저음 남성 (김첨지 어울림)
    if (voice_prompt.includes("학생") || voice_prompt.includes("젊은")) voice = "echo";
    if (voice_prompt.includes("여성") || voice_prompt.includes("아내")) voice = "nova";

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: voice,
        input: text
      })
    });

    if (!response.ok) throw new Error("오디오 생성 실패");

    // 오디오 파일을 Base64로 변환하여 프론트엔드에 전달
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');
    const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

    return res.status(200).json({ success: true, audioUrl: audioUrl });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
