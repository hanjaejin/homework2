/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Image as ImageIcon, 
  Plus, 
  Minus, 
  Save, 
  CheckCircle2, 
  Loader2, 
  ArrowLeft,
  AlertCircle,
  Settings,
  Truck,
  ClipboardCheck,
  Home,
  User,
  Download
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// ==========================================
// 1. 구글 시트 웹 앱 URL
// ==========================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxlJNMIxU7uhiLUZ7siXiWmImBNKZdwCt4fZmWk9viDaosMg1Bhhk06xWXa5r35MYI7/exec';

interface InspectionItem {
  id: string;
  name: string;
  code: string;
  originalQty: number;
  currentQty: number;
  unitPrice: number;
}

interface ExtractionResult {
  date: string;
  docNumber: string;
  customerCode: string;
  items: InspectionItem[];
}

type ViewState = 'upload' | 'processing' | 'inspect' | 'success';

export default function App() {
  const [view, setView] = useState<ViewState>('upload');
  const [data, setData] = useState<ExtractionResult | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('사진을 분석하고 있습니다...');
  const [error, setError] = useState<string | null>(null);
  
  // ✅ 추가: API 키 상태 관리 (localStorage 연동)
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('GEMINI_API_KEY') || '');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // API 키가 변경될 때마다 브라우저 로컬 스토리지에 자동 저장
  useEffect(() => {
    localStorage.setItem('GEMINI_API_KEY', apiKey);
  }, [apiKey]);

  // --- 이미지 OCR 처리 (Gemini) ---
  const processImage = async (file: File) => {
    // ✅ API 키 누락 방어 로직
    if (!apiKey) {
      alert('설정(톱니바퀴) 메뉴에서 Gemini API Key를 먼저 입력해주세요.');
      setShowSettings(true);
      return;
    }

    setView('processing');
    setError(null);
    setLoadingMsg('사진을 분석하고 있습니다...');

    let checkInterval = setInterval(() => {
      setLoadingMsg(prev => 
        prev === '사진을 분석하고 있습니다...' ? '거의 다 텍스트를 추출했습니다...' : 
        prev === '거의 다 텍스트를 추출했습니다...' ? '데이터를 꼼꼼히 확인 중입니다...' : 
        '사진을 분석하고 있습니다...'
      );
    }, 4000);

    try {
      // ✅ 입력된 API 키로 동적 객체 생성
      const ai = new GoogleGenAI({ apiKey: apiKey });

      const base64Promise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
        reader.readAsDataURL(file);
      });
      
      const base64 = await base64Promise;
      let mimeType = file.type || 'image/jpeg';
      
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mimeType)) {
        mimeType = 'image/jpeg';
      }

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('서버 응답 시간이 초과되었습니다 (20초). 다시 시도해주세요.')), 20000)
      );

      // ✅ 404 에러 방지를 위한 최신 모델명 적용
      const aiRequest = ai.models.generateContent({
        model: "gemini-1.5-flash-latest",
        contents: [
          {
            parts: [
              {
                text: `이 납품서 이미지에서 다음 정보를 추출해서 JSON 형식으로 응답해줘.
                - date: 날짜 (YYYY-MM-DD 형식)
                - docNumber: 전표번호
                - customerCode: 거래처코드
                - items: 품목 리스트
                  - name: 상품명
                  - code: 상품코드
                  - originalQty: 수량 (숫자만)
                  - unitPrice: 단가 (숫자만)
                
                JSON 데이터 외에는 아무것도 출력하지 마.`
              },
              {
                inlineData: {
                  data: base64,
                  mimeType: mimeType
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              docNumber: { type: Type.STRING },
              customerCode: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    code: { type: Type.STRING },
                    originalQty: { type: Type.NUMBER },
                    unitPrice: { type: Type.NUMBER }
                  }
                }
              }
            }
          }
        }
      });

      const response = await Promise.race([aiRequest, timeoutPromise]) as any;
      
      clearInterval(checkInterval);
      
      let responseText = response.text || "{}";
      responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(responseText);

      setData({
        date: parsed.date || new Date().toISOString().split('T')[0],
        docNumber: parsed.docNumber || '확인불가',
        customerCode: parsed.customerCode || '확인불가',
        items: (parsed.items || []).map((item: any, idx: number) => ({
          id: `item-${idx}`,
          name: item.name || '알 수 없는 상품',
          code: item.code || '',
          originalQty: Number(item.originalQty) || 0,
          currentQty: Number(item.originalQty) || 0,
          unitPrice: Number(item.unitPrice) || 0,
        }))
      });
      setView('inspect');
    } catch (err) {
      clearInterval(checkInterval);
      console.error("OCR 분석 오류:", err);
      let errMsg = "사진 분석에 실패했습니다. 사진을 다시 찍어주세요.";
      if (err instanceof Error) {
        errMsg = `오류: ${err.message}`;
      }
      setError(errMsg);
      setView('upload');
    }
  };

  // --- 수량 조절 핸들러 ---
  const updateQty = (id: string, delta: number) => {
    setData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map(item => 
          item.id === id ? { ...item, currentQty: Math.max(0, item.currentQty + delta) } : item
        )
      };
    });
  };

  const handleQtyChange = (id: string, value: string) => {
    const num = parseInt(value) || 0;
    setData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map(item => 
          item.id === id ? { ...item, currentQty: Math.max(0, num) } : item
        )
      };
    });
  };

  // --- 구글 시트 저장 ---
  const handleSave = async () => {
    if (!data) return;
    if (!SCRIPT_URL || SCRIPT_URL.includes('여기에')) {
      alert("구글 스크립트 URL이 설정되지 않았습니다. 코드 상단의 SCRIPT_URL을 수정해 주세요.");
      return;
    }

    setLoadingMsg('구글 시트 저장 중...');
    setView('processing');

    try {
      const now = new Date().toLocaleString('ko-KR');
      const rows = data.items.map(item => ({
        timestamp: now,
        date: data.date,
        docNumber: data.docNumber,
        customerCode: data.customerCode,
        itemName: item.name,
        itemCode: item.code,
        originalQty: item.originalQty,
        currentQty: item.currentQty,
        unitPrice: item.unitPrice,
        isDifferent: item.originalQty !== item.currentQty ? 'O' : 'X'
      }));

      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(rows)
      });

      setView('success');
    } catch (err) {
      console.error(err);
      setError("구글 시트 저장에 실패했습니다.");
      setView('inspect');
    }
  };

  return (
    <div className="min-h-screen bg-[#fff8f6] font-sans text-[#261813] selection:bg-orange-200">
      {/* --- 헤더 --- */}
      <header className="sticky top-0 z-50 bg-[#fff8f6] border-b-4 border-[#261813] px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-orange-100 rounded-full transition-colors active:scale-95"
          >
            <Settings size={32} strokeWidth={2.5} className="text-[#a63b00]" />
          </button>
          <h1 className="text-3xl font-black text-[#a63b00]">검수 목록</h1>
        </div>
        <div className="w-12 h-12 bg-orange-100 rounded-full border-2 border-[#261813] flex items-center justify-center">
          <User size={28} />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 pb-32">
        <AnimatePresence mode="wait">
          {view === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 pt-10"
            >
            <div className="space-y-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-48 bg-[#f26522] border-4 border-[#261813] rounded-2xl shadow-[8px_8px_0px_#261813] flex flex-col items-center justify-center gap-2 active:translate-y-1 active:shadow-[4px_4px_0px_#261813] transition-all hover:bg-[#d8541a] group"
              >
                <Camera size={80} className="text-white group-hover:scale-110 transition-transform" strokeWidth={2} />
                <span className="text-3xl font-black text-white">사진 찍기</span>
              </button>

              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-48 bg-[#f26522] border-4 border-[#261813] rounded-2xl shadow-[8px_8px_0px_#261813] flex flex-col items-center justify-center gap-2 active:translate-y-1 active:shadow-[4px_4px_0px_#261813] transition-all hover:bg-[#d8541a] group"
              >
                <ImageIcon size={80} className="text-white group-hover:scale-110 transition-transform" strokeWidth={2} />
                <span className="text-3xl font-black text-white">앨범에서 선택</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    const response = await fetch(`${import.meta.env.BASE_URL}sample.jpg`);
                    if (!response.ok) throw new Error('File not found');
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'sample_receipt.jpg';
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(url);
                  } catch (err) {
                    alert('샘플 파일을 찾을 수 없거나 다운로드할 수 없습니다.');
                  }
                }}
                className="w-full h-20 bg-white border-4 border-[#261813] rounded-2xl shadow-[8px_8px_0px_#261813] flex items-center justify-center gap-2 active:translate-y-1 active:shadow-[4px_4px_0px_#261813] transition-all hover:bg-orange-50 group"
              >
                <Download size={32} className="text-[#261813] group-hover:scale-110 transition-transform" strokeWidth={2.5} />
                <span className="text-xl font-black text-[#261813]">샘플다운</span>
              </button>

              <button 
                onClick={() => {
                  setData({
                    date: new Date().toISOString().split('T')[0],
                    docNumber: 'TEST-123456',
                    customerCode: '코레일유통(테스트)',
                    items: [
                      { id: 't1', name: '테스트상품 A', code: '880111', originalQty: 10, currentQty: 10, unitPrice: 2000 },
                      { id: 't2', name: '테스트상품 B', code: '880222', originalQty: 5, currentQty: 4, unitPrice: 1500 }
                    ]
                  });
                  setView('inspect');
                }}
                className="w-full h-20 bg-green-100 border-4 border-[#261813] rounded-2xl shadow-[8px_8px_0px_#261813] flex items-center justify-center gap-2 active:translate-y-1 active:shadow-[4px_4px_0px_#261813] transition-all hover:bg-green-200 group"
              >
                <AlertCircle size={32} className="text-green-800" strokeWidth={2.5} />
                <span className="text-xl font-black text-green-800">모의 테스트</span>
              </button>
            </div>

              <div className="p-8 bg-orange-50 border-2 border-[#261813] rounded-xl flex items-center gap-6">
                <div className="bg-[#f26522] p-3 rounded-full">
                  <CheckCircle2 size={32} className="text-white" />
                </div>
                <p className="text-2xl font-bold leading-tight">
                  밝은 곳에서 영수증이 잘 보이게 찍어주세요.
                </p>
              </div>

              {error && (
                <div className="p-6 bg-red-100 border-2 border-red-600 rounded-xl flex items-center gap-4 text-red-700">
                  <AlertCircle size={32} />
                  <p className="text-xl font-bold">{error}</p>
                </div>
              )}

              <input 
                type="file" 
                hidden 
                ref={fileInputRef} 
                accept="image/*" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    processImage(file);
                    e.target.value = ''; 
                  }
                }} 
              />
            </motion.div>
          )}

          {view === 'processing' && (
            <motion.div 
              key="processing"
              className="flex flex-col items-center justify-center min-h-[60vh] gap-8"
            >
              <Loader2 size={120} className="text-[#f26522] animate-spin" strokeWidth={3} />
              <p className="text-3xl font-black text-center leading-relaxed">
                {loadingMsg}
              </p>
            </motion.div>
          )}

          {view === 'inspect' && data && (
            <motion.div 
              key="inspect"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="bg-white border-2 border-[#261813] p-4 rounded-xl shadow-[4px_4px_0px_#261813] space-y-2">
                <div className="flex justify-between items-center text-xl font-bold text-gray-500">
                  <span>날짜: {data.date}</span>
                  <span>전표: {data.docNumber}</span>
                </div>
                <div className="text-2xl font-black text-[#a63b00]">
                  거래처: {data.customerCode}
                </div>
              </div>

              <div className="space-y-4">
                {data.items.map((item) => (
                  <div 
                    key={item.id}
                    className={`bg-white border-2 p-5 rounded-2xl flex flex-col gap-4 shadow-md transition-colors ${
                      item.originalQty !== item.currentQty ? 'border-red-500 bg-red-50' : 'border-[#261813]'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-grow">
                        <h3 className="text-2xl font-black leading-tight mb-1">{item.name}</h3>
                        <p className="text-lg text-gray-500 font-bold">코드: {item.code}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-bold bg-gray-100 px-3 py-1 rounded-lg">
                          서류: {item.originalQty}개
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xl font-bold text-[#f26522]">
                        단가: {item.unitPrice.toLocaleString()}원
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => updateQty(item.id, -1)}
                          className="w-16 h-16 bg-white border-2 border-[#261813] rounded-xl flex items-center justify-center active:bg-gray-100 shadow-sm"
                        >
                          <Minus size={32} />
                        </button>
                        <input 
                          type="number"
                          value={item.currentQty}
                          onChange={(e) => handleQtyChange(item.id, e.target.value)}
                          className="w-24 h-16 border-2 border-[#261813] rounded-xl text-center text-3xl font-black focus:ring-4 focus:ring-orange-200"
                        />
                        <button 
                          onClick={() => updateQty(item.id, 1)}
                          className="w-16 h-16 bg-[#f26522] border-2 border-[#261813] rounded-xl flex items-center justify-center text-white active:bg-[#d8541a] shadow-sm"
                        >
                          <Plus size={32} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setView('upload')}
                  className="h-20 bg-gray-200 border-2 border-[#261813] rounded-xl text-2xl font-black flex items-center justify-center gap-2 active:bg-gray-300"
                >
                  <ArrowLeft size={32} />
                  다시 찍기
                </button>
                <button 
                  onClick={handleSave}
                  className="h-20 bg-[#f26522] border-2 border-[#261813] rounded-xl text-2xl font-black text-white flex items-center justify-center gap-2 active:translate-y-1 shadow-[4px_4px_0px_#261813] active:shadow-none"
                >
                  <Save size={32} />
                  시트에 저장
                </button>
              </div>
            </motion.div>
          )}

          {view === 'success' && (
            <motion.div 
              key="success"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center justify-center min-h-[70vh] gap-8 p-6 text-center"
            >
              <div className="bg-green-100 p-8 rounded-full">
                <CheckCircle2 size={160} className="text-green-600" />
              </div>
              <h2 className="text-5xl font-black text-[#261813] leading-tight">
                ✅ 구글 시트에 <br />안전하게 저장되었습니다!
              </h2>
              <button 
                onClick={() => setView('upload')}
                className="w-full h-24 bg-[#f26522] border-4 border-[#261813] rounded-2xl text-3xl font-black text-white shadow-[8px_8px_0px_#261813] active:translate-y-1 active:shadow-none transition-all"
              >
                다음 전표 찍기
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* --- 설정 모달 창 --- */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm border-4 border-[#261813] shadow-[8px_8px_0px_#261813]">
              <h2 className="text-2xl font-black mb-4 text-[#a63b00]">설정</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Google Gemini API Key</label>
                  <input 
                    type="password" 
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AI Studio에서 발급받은 키 입력"
                    className="w-full border-2 border-[#261813] rounded-lg p-3 text-lg focus:outline-none focus:ring-4 focus:ring-orange-200"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    * 데모 시연용입니다. 입력하신 키는 서버에 전송되지 않고 현재 기기에만 보관됩니다.
                  </p>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-3 bg-[#f26522] text-white font-black rounded-lg border-2 border-[#261813] active:bg-[#d8541a]"
                >
                  저장 및 닫기
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 하단 네비게이션 --- */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-4 border-[#261813] h-24 flex justify-around items-center px-4">
        <button 
          className={`flex flex-col items-center gap-1 ${view === 'upload' ? 'text-[#f26522]' : 'opacity-50'}`}
          onClick={() => {
            setData(null);
            setError(null);
            setView('upload');
          }}
        >
          <Home size={32} strokeWidth={view === 'upload' ? 3 : 2} />
          <span className={`text-lg font-bold ${view === 'upload' ? 'font-black underline underline-offset-4' : ''}`}>홈</span>
        </button>
        <button 
          className={`flex flex-col items-center gap-1 ${view !== 'upload' ? 'text-[#f26522]' : 'opacity-50'}`}
        >
          <ClipboardCheck size={32} strokeWidth={view !== 'upload' ? 3 : 2} />
          <span className={`text-lg font-bold ${view !== 'upload' ? 'font-black underline underline-offset-4' : ''}`}>입고검수</span>
        </button>
      </nav>
    </div>
  );
}
