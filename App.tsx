import React, { useState, useEffect, useRef } from 'react';
import { extractInvoiceData } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { SubmissionRecord, ProcessingFile, InvoiceData, UserProfile, ReimbursementStatus } from './types';

const SCHOOL_NAME = "江南大学";
const SCHOOL_TAX_ID = "1210000071780177X1";
const SUPER_ADMIN_ID = "6240210040";

type SurveyType = 'double_signature' | 'payment_record';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoginView, setIsLoginView] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [shareText, setShareText] = useState('分享助手');
  
  const [files, setFiles] = useState<ProcessingFile[]>([]);
  const [records, setRecords] = useState<SubmissionRecord[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [surveyQueue, setSurveyQueue] = useState<SurveyType[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('invoice_user_profile');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    } else {
      setIsLoginView(true);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchRecords();
    }
  }, [user, isAdminMode]);

  const fetchRecords = async () => {
    if (!user) return;
    let query = supabase.from('reimbursement_records').select('*');
    if (!isAdminMode) {
      query = query.eq('studentId', user.studentId);
    }
    const { data, error } = await query.order('timestamp', { ascending: false });
    if (error) {
      console.error('Error fetching records:', error);
      setDbError(error.message);
    } else {
      setRecords(data || []);
      setDbError(null);
    }
  };

  const isUserAdmin = user?.studentId === SUPER_ADMIN_ID;

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const profile: UserProfile = {
      name: formData.get('name') as string,
      studentId: formData.get('studentId') as string,
      supervisor: formData.get('supervisor') as string,
      phone: formData.get('phone') as string,
    };
    if (!profile.name || !profile.studentId) return alert("请补全必要信息");
    localStorage.setItem('invoice_user_profile', JSON.stringify(profile));
    setUser(profile);
    setIsLoginView(false);
  };

  const handleEditProfile = () => setIsLoginView(true);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setShareText('已复制链接！');
      setTimeout(() => setShareText('分享助手'), 2000);
    }).catch(() => alert("复制失败，请手动复制地址栏链接"));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    const selectedFiles = Array.from(fileList) as File[];
    const newFiles: ProcessingFile[] = selectedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending' as const
    }));
    setFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach(processFile);
  };

  const processFile = async (item: ProcessingFile) => {
    setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing' } : f));
    try {
      const data = await extractInvoiceData(item.file);
      const isBuyerValid = data.buyerName.includes(SCHOOL_NAME) && 
                          data.buyerTaxId.trim().toUpperCase().includes(SCHOOL_TAX_ID);
      const isDuplicate = records.some(r => r.invoiceNumber.trim().toUpperCase() === data.invoiceNumber.trim().toUpperCase());
      
      setFiles(prev => prev.map(f => f.id === item.id ? { 
        ...f, status: 'completed', extractedData: data, isBuyerValid, isDuplicate 
      } : f));
   } catch (err: any) {
      console.error(err);
      // 将 err.message 显示出来，这样我们就能看到具体原因
      const errorMessage = err.message || '识别失败';
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error', error: errorMessage } : f));
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles(prev => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove) URL.revokeObjectURL(fileToRemove.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  const handleAddRecord = async (extracted: InvoiceData, fileId: string, isValid: boolean, isDuplicate: boolean) => {
    if (!isValid) return alert(`发票抬头错误！购买方必须是：${SCHOOL_NAME}`);
    if (isDuplicate) return alert(`发票号码 ${extracted.invoiceNumber} 已存在！`);
    if (!user) return alert("用户信息丢失，请重新登录");

    try {
      const newRecord: Omit<SubmissionRecord, 'id'> = {
        ...extracted, ...user, isPaid, timestamp: Date.now(), paidEditCount: 0, status: 'box', surveyAnswers: {}
      };
      const { data, error } = await supabase.from('reimbursement_records').insert([newRecord]).select();
      if (error) return alert('提交失败: ' + error.message);
      if (!data || data.length === 0) return alert('提交失败：未收到返回数据');

      const insertedRecord = data[0] as SubmissionRecord;
      setRecords(prev => [insertedRecord, ...prev]);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setActiveWorkflowId(insertedRecord.id);
      setSurveyQueue(isPaid ? ['double_signature', 'payment_record'] : ['double_signature']);
    } catch (err) {
      alert('提交过程中发生意外错误');
    }
  };

  const toggleRecordPaidStatus = async (recordId: string) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    if (record.paidEditCount >= 1 && !isAdminMode) return alert("支付状态仅可修改一次。");
    const becomingPaid = !record.isPaid;
    const updates = { isPaid: becomingPaid, paidEditCount: record.paidEditCount + 1 };
    const { error } = await supabase.from('reimbursement_records').update(updates).eq('id', recordId);
    if (error) return alert('更新失败: ' + error.message);
    if (becomingPaid) { setActiveWorkflowId(recordId); setSurveyQueue(['payment_record']); }
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, ...updates } : r));
  };

  const handleSurveyAnswer = async (answer: boolean) => {
    if (!activeWorkflowId || surveyQueue.length === 0) return;
    const currentSurvey = surveyQueue[0];
    const record = records.find(r => r.id === activeWorkflowId);
    if (!record) return;
    const newAnswers = { ...(record.surveyAnswers || {}), [currentSurvey === 'payment_record' ? 'hasPaymentRecord' : 'hasDoubleSignature']: answer };
    const { error } = await supabase.from('reimbursement_records').update({ surveyAnswers: newAnswers }).eq('id', activeWorkflowId);
    if (error) return alert('保存失败: ' + error.message);
    setRecords(prev => prev.map(r => r.id === activeWorkflowId ? { ...r, surveyAnswers: newAnswers } : r));
    const nextQueue = surveyQueue.slice(1);
    setSurveyQueue(nextQueue);
    if (nextQueue.length === 0) setActiveWorkflowId(null);
  };

  const adminUpdateStatus = async (id: string, status: ReimbursementStatus, reason?: string) => {
    const updates = { status, rejectionReason: reason || null };
    const { error } = await supabase.from('reimbursement_records').update(updates).eq('id', id);
    if (error) return alert('更新失败: ' + error.message);
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const exportData = (all: boolean = false) => {
    const targetRecords = all ? records : records.filter(r => r.studentId === user?.studentId);
    if (targetRecords.length === 0) return;
    const headers = ['发票号', '金额', '分类', '提交人', '学号', '导师', '状态', '当前进度'];
    const rows = targetRecords.map(r => [r.invoiceNumber, r.amount, r.category, r.name, r.studentId, r.supervisor, r.isPaid ? '已付' : '待付', r.status]);
    const csvContent = "\ufeff" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `报销清单_${Date.now()}.csv`;
    link.click();
  };

  const ProgressSteps = ({ status, reason }: { status: ReimbursementStatus, reason?: string }) => {
    const steps: { key: ReimbursementStatus, label: string, icon: string }[] = [
      { key: 'box', label: '发票盒', icon: '📦' },
      { key: 'han', label: '韩老师', icon: '👩‍🦰' },
      { key: 'assistant', label: '财务助管', icon: '👧' },
      { key: 'office', label: '财务处', icon: '🏛️' },
    ];
    const currentIndex = steps.findIndex(s => s.key === status);
    return (
      <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-2xl border border-slate-100 shadow-inner">
        <div className="flex items-center justify-between px-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex flex-col items-center relative">
              <div className={`w-9 h-9 flex items-center justify-center rounded-full text-lg z-10 border-2 ${i <= currentIndex && status !== 'rejected' ? 'bg-blue-100 border-blue-500' : 'bg-white border-gray-200 grayscale'}`}>{s.icon}</div>
              <span className="text-[9px] mt-1.5 font-black uppercase tracking-widest text-gray-400">{s.label}</span>
            </div>
          ))}
          <div className={`w-9 h-9 flex items-center justify-center rounded-full text-xl border-2 ${status === 'success' ? 'bg-green-100 border-green-500' : status === 'rejected' ? 'bg-red-100 border-red-500' : 'bg-white border-gray-200'}`}>{status === 'success' ? '✅' : status === 'rejected' ? '×' : '⌛'}</div>
        </div>
        {status === 'rejected' && reason && <div className="mt-2 p-2 bg-red-50 text-[10px] text-red-700 font-bold">退单原因：{reason}</div>}
      </div>
    );
  };

  if (isLoginView || !user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full border border-slate-200">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center text-4xl">📋</div>
            <h1 className="text-3xl font-black mt-6 tracking-tight">报销身份认证</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <input name="name" defaultValue={user?.name} placeholder="姓名" className="w-full border-2 p-4 rounded-2xl outline-none focus:border-blue-500" required />
            <input name="studentId" defaultValue={user?.studentId} placeholder="学号/工号" className="w-full border-2 p-4 rounded-2xl outline-none focus:border-blue-500" required />
            <input name="supervisor" defaultValue={user?.supervisor} placeholder="导师姓名" className="w-full border-2 p-4 rounded-2xl outline-none focus:border-blue-500" required />
            <input name="phone" defaultValue={user?.phone} placeholder="联系电话" className="w-full border-2 p-4 rounded-2xl outline-none focus:border-blue-500" required />
            <button type="submit" className="w-full bg-blue-600 text-white p-4 rounded-2xl font-black text-lg shadow-lg hover:bg-blue-700 transition-all">保存并进入</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {activeWorkflowId && surveyQueue.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[2.5rem] p-10 max-w-sm w-full shadow-2xl border border-slate-100">
            <h2 className="text-2xl font-black mb-4 text-center">合规性确认</h2>
            <p className="text-lg font-bold text-center leading-relaxed text-slate-600 mb-6">
              {surveyQueue[0] === 'double_signature' ? "发票是否由2名以上的老师签字？" : "已付发票是否附上支付记录？"}
            </p>
            <div className="flex gap-4">
              <button onClick={() => handleSurveyAnswer(true)} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black">是</button>
              <button onClick={() => handleSurveyAnswer(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black">否</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-20 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 text-white p-2.5 rounded-2xl text-xl font-black shadow-xl">AI</div>
          <h1 className="text-xl font-black tracking-tighter">风味组报销助手</h1>
        </div>
        <div className="flex gap-3 items-center">
          <button onClick={handleShare} className="bg-blue-50 text-blue-600 px-5 py-2.5 rounded-2xl text-[11px] font-black border border-blue-100">{shareText}</button>
          {isUserAdmin && (
            <button onClick={() => setIsAdminMode(!isAdminMode)} className={`px-5 py-2.5 rounded-2xl text-[11px] font-black border-2 ${isAdminMode ? 'bg-red-600 text-white border-red-600' : 'text-slate-600 border-slate-200'}`}>
              {isAdminMode ? '退出管理' : '进入后台'}
            </button>
          )}
          <button onClick={() => exportData(isAdminMode)} className="bg-green-600 text-white px-5 py-2.5 rounded-2xl text-[11px] font-black shadow-xl">导出数据</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {!isAdminMode && (
          <div className="lg:col-span-5 space-y-6">
            <section className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-2xl">
              <div className="flex justify-between items-center mb-8">
                <p className="text-xl font-black text-slate-800">发票识别区</p>
                <label className="flex items-center gap-3 px-5 py-3 bg-blue-50 border-2 border-blue-100 rounded-2xl cursor-pointer">
                  <input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} className="w-5 h-5 rounded-lg text-blue-600" />
                  <span className={`text-lg font-black ${isPaid ? 'text-blue-700' : 'text-slate-300'}`}>已付发票</span>
                </label>
              </div>
              <div onClick={() => fileInputRef.current?.click()} className="border-4 border-dashed border-slate-100 rounded-[2rem] p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
                <span className="text-7xl block mb-6">📸</span>
                <p className="text-xl font-black text-slate-800">点击上传发票</p>
                <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
              </div>
              <div className="mt-10 space-y-5">
                {files.map(item => (
                  <div key={item.id} className={`p-6 rounded-[2rem] border-2 flex gap-5 ${item.isBuyerValid === false ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                    <img src={item.previewUrl} className="w-28 h-28 object-cover rounded-3xl" alt="preview" />
                    <div className="flex-grow flex flex-col justify-center">
                      {item.status === 'processing' ? <p className="text-[11px] font-black text-blue-500 animate-pulse">AI 识别中...</p> : 
                       item.status === 'completed' && item.extractedData ? (
                        <div className="flex flex-col h-full justify-between">
                          <div className="flex justify-between items-start">
                            <span className="text-2xl font-black text-slate-800">¥{item.extractedData.amount.toFixed(2)}</span>
                            <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase">{item.extractedData.category}</span>
                          </div>
                          <div className="mt-4 flex gap-2">
                            <button onClick={() => handleAddRecord(item.extractedData!, item.id, item.isBuyerValid || false, item.isDuplicate || false)} className="flex-grow py-3 bg-blue-600 text-white rounded-2xl text-[11px] font-black shadow-lg">提交报销单</button>
                            <button onClick={() => handleRemoveFile(item.id)} className="px-4 py-3 bg-slate-100 text-slate-400 rounded-2xl text-[11px] font-black">删除</button>
                          </div>
                        </div>
                      ) : <p className="text-red-500 font-black">识别失败</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <div className={`${isAdminMode ? 'lg:col-span-12' : 'lg:col-span-7'} space-y-6`}>
          <div className="bg-white rounded-[2.5rem] border shadow-2xl flex flex-col min-h-[85vh] overflow-hidden relative border-slate-100">
            <div className="px-10 py-8 border-b flex justify-between items-center bg-slate-50/30">
              <h2 className="text-2xl font-black text-slate-800">{isAdminMode ? "全部用户报销单" : "我的报销流水"}</h2>
              <span className="text-xl font-black text-blue-600">{(isAdminMode ? records : records.filter(r => r.studentId === user.studentId)).length} 条</span>
            </div>
            <div className={`flex-grow overflow-auto p-8 ${isAdminMode ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8' : 'space-y-6'}`}>
              {dbError && <div className="p-4 bg-red-50 text-red-600 text-xs font-bold rounded-2xl">⚠️ 数据库连接失败: {dbError}</div>}
              {(isAdminMode ? records : records.filter(r => r.studentId === user.studentId)).map(r => (
                <div key={r.id} className={`bg-white border-2 rounded-[2rem] p-8 transition-all hover:shadow-2xl relative ${r.status === 'rejected' ? 'border-red-100 bg-red-50/10' : 'border-slate-50'}`}>
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex gap-5 items-center">
                      <div className="bg-slate-50 w-16 h-16 rounded-3xl flex items-center justify-center text-3xl">🧾</div>
                      <div>
                        <h3 className="text-lg font-black text-slate-800 tracking-tight">{r.category}</h3>
                        <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">ID: {r.invoiceNumber}</p>
                        {isAdminMode && <span className="text-[11px] font-black text-blue-600">{r.name} · {r.studentId}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-blue-600">¥{r.amount.toFixed(2)}</div>
                      <button onClick={() => toggleRecordPaidStatus(r.id)} className={`mt-2 px-4 py-1.5 rounded-xl text-[10px] font-black ${r.isPaid ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {r.isPaid ? '已付' : '待付'}
                      </button>
                    </div>
                  </div>
                  <ProgressSteps status={r.status} reason={r.rejectionReason} />
                  {isAdminMode && (
                    <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap gap-2">
                      {(['box', 'han', 'assistant', 'office', 'success'] as ReimbursementStatus[]).map(s => (
                        <button key={s} onClick={() => adminUpdateStatus(r.id, s)} className={`px-3 py-1.5 rounded-xl text-[9px] font-black ${r.status === s ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500'}`}>{s}</button>
                      ))}
                      <button onClick={() => { const reason = prompt("退单原因："); if(reason) adminUpdateStatus(r.id, 'rejected', reason); }} className="px-4 py-1.5 bg-red-50 text-red-500 rounded-xl text-[9px] font-black">退单</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
