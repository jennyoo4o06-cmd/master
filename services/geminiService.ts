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
  // 优先从环境变量获取，Vite 生产环境通常使用 import.meta.env
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'undefined') {
    throw new Error("未检测到 GEMINI_API_KEY，请在 Vercel 环境变量中配置 VITE_GEMINI_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey });
  const docPart = await fileToGenerativePart(file);
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash', // 使用更稳定的版本
      contents: {
        parts: [
          docPart,
          { text: "你是一个发票识别专家。请从图片中提取以下 JSON 格式信息：invoiceNumber (发票号码), sellerName (销售方名称), buyerName (购买方名称), sellerTaxId (销售方纳税人识别号), buyerTaxId (购买方纳税人识别号), sellerBankAccount (销售方开户行及账号), category (货物或服务名称), amount (价税合计金额，数字类型)。只需输出 JSON。" }
        ]
      },
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) throw new Error("AI 未返回任何识别结果");
    return JSON.parse(text) as InvoiceData;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw new Error(error.message || "AI 识别服务异常");
  }
};
