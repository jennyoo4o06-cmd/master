import { GoogleGenAI, Type } from "@google/genai";
import { InvoiceData } from "../types";

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return { inlineData: { data: await base64EncodedDataPromise, mimeType: file.type } };
};

export const extractInvoiceData = async (file: File): Promise<InvoiceData> => {
  // 生产环境必须使用 VITE_ 前缀
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('错误: VITE_GEMINI_API_KEY 缺失');
    throw new Error("环境变量 VITE_GEMINI_API_KEY 未配置，请检查 Vercel 设置");
  }

  const ai = new GoogleGenAI({ apiKey });
  const docPart = await fileToGenerativePart(file);
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: {
        parts: [
          docPart,
          { text: "Output JSON ONLY. Required fields: invoiceNumber, sellerName, buyerName, sellerTaxId, buyerTaxId, sellerBankAccount, category, amount. For Buyer Name/TaxID, look for '购买方' or '付款人'. Amount is the '合计' or '价税合计'." }
        ]
      },
      config: {
        responseMimeType: "application/json",
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
    return JSON.parse(text) as InvoiceData;
  } catch (error: any) {
    console.error("Gemini 识别详情报错:", error);
    throw new Error(error.message || "AI 识别服务异常");
  }
};
