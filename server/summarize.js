// PDF 텍스트 추출 + Gemini API로 3줄 요약/키워드 태그 생성.

import { GoogleGenAI, Type } from '@google/genai';
import pdfParse from 'pdf-parse';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = 'gemini-3.1-flash-lite';
const MAX_TEXT_CHARS = 12000; // 컨텍스트/비용 절약, 서론+본문 앞부분이면 요약에 충분
const MIN_TEXT_CHARS = 200; // 이보다 짧으면 스캔본/추출 실패로 간주

const SUMMARY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      minItems: 3,
      maxItems: 3,
      description: '논문 핵심 내용을 담은 문장 3개',
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      minItems: 3,
      maxItems: 5,
      description: '논문을 대표하는 키워드 3~5개',
    },
  },
  required: ['summary', 'tags'],
};

// PDF 버퍼에서 텍스트를 추출한다. 스캔본 등으로 텍스트가 거의 없으면 에러를 던진다.
export async function extractText(pdfBuffer) {
  const { text } = await pdfParse(pdfBuffer);
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_CHARS) {
    throw new Error('PDF에서 추출한 텍스트가 너무 짧음 (스캔본이거나 추출 실패)');
  }
  return trimmed;
}

// 논문 텍스트를 Gemini에 보내 3줄 요약 + 키워드 태그를 받는다.
export async function summarizeWithGemini(text) {
  const truncated = text.slice(0, MAX_TEXT_CHARS);

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `다음은 논문 PDF에서 추출한 텍스트입니다. 핵심 내용을 요약해줘.\n\n${truncated}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: SUMMARY_SCHEMA,
    },
  });

  return JSON.parse(response.text); // { summary: string[3], tags: string[3~5] }
}
