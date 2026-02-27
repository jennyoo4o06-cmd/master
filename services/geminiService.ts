
import { GoogleGenAI, Type, Chat } from "@google/genai";
import { InvoiceData } from "../types";

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
};

export const extractInvoiceData = async (file: File): Promise<InvoiceData> => {
  // 采用 gemini-3-flash-preview 提供最快响应
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const docPart = await fileToGenerativePart(file);
  
  // 进一步精简 Prompt 以降低 Token 消耗并提升生成速度
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        docPart,
        { text: "Output JSON ONLY. Required fields: invoiceNumber, sellerName, buyerName, sellerTaxId, buyerTaxId, sellerBankAccount, category, amount. For Buyer Name/TaxID, look for '购买方' or '付款人'. For Seller Bank, look for '开户行及账号'. Amount is the '合计' or '价税合计'." }
      ]
    },
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 }, // OCR 任务禁用思维链以提速
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          invoiceNumber: { type: Type.STRING },
          sellerName: { type: Type.STRING },
          buyerName: { type: Type.STRING },
          sellerTaxId: { type: Type.STRING },
          buyerTaxId: { type: Type.STRING },
          sellerBankAccount: { type: Type.STRING },
          category: { type: Type.STRING },
          amount: { type: Type.NUMBER }
        },
        required: ["invoiceNumber", "sellerName", "buyerName", "sellerTaxId", "buyerTaxId", "category", "amount"]
      }
    }
  });

  const text = response.text || '{}';
  try {
    return JSON.parse(text) as InvoiceData;
  } catch (e) {
    console.error("JSON Parse Error:", text);
    throw new Error("Failed to parse invoice data");
  }
};

export const createChat = (systemInstruction: string): Chat => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: { systemInstruction },
  });
};
