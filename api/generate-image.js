export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST만 허용됩니다.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");

    const { prompt } = req.body;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: { prompt: prompt },
        parameters: { sampleCount: 3 } // 🎯 3개의 샘플 이미지 생성
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    if (data.predictions && data.predictions.length > 0) {
      // Base64 이미지 배열 반환
      const images = data.predictions.map(p => p.bytesBase64Encoded);
      return res.status(200).json({ success: true, imagesBase64: images });
    } else {
      throw new Error("이미지 생성 결과가 없습니다.");
    }

  } catch (error) {
    console.error("Imagen API Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
