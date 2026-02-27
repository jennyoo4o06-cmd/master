
export interface InvoiceData {
  invoiceNumber: string;
  sellerName: string;
  buyerName: string;
  sellerTaxId: string;
  buyerTaxId: string;
  sellerBankAccount: string;
  category: string;
  amount: number;
}

export interface SubmitterInfo {
  name: string;
  studentId: string;
  supervisor: string;
  phone: string;
  isPaid: boolean;
}

export interface UserProfile extends Omit<SubmitterInfo, 'isPaid'> {
  isAdmin?: boolean;
}

export type ReimbursementStatus = 'box' | 'han' | 'assistant' | 'office' | 'success' | 'rejected';

export interface SubmissionRecord extends InvoiceData, SubmitterInfo {
  id: string;
  timestamp: number;
  paidEditCount: number;
  surveyAnswers?: {
    hasDoubleSignature?: boolean; // 2名以上老师签字 (仅针对待付)
    hasPaymentRecord?: boolean;   // 附上支付记录 (仅针对已付)
  };
  status: ReimbursementStatus;
  rejectionReason?: string;
}

export interface ProcessingFile {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  extractedData?: InvoiceData;
  error?: string;
  isBuyerValid?: boolean;
  isDuplicate?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface IdeaBlueprint {
  title: string;
  summary: string;
  targetAudience: string;
  marketReferences: Array<{
    uri: string;
    title: string;
  }>;
  uniqueValueProp: string;
  marketOpportunities: string[];
  challenges: string[];
  roadmap: string[];
}
