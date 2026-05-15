/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
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
// 1. 구글 시트 웹 앱 URL (사용자가 여기에 주소 입력)
// ==========================================
const SCRIPT_URL = '여기에_구글_스크립트_URL을_넣으세요';

// Gemini API 설정 (Vite/React 패턴)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 이미지 OCR 처리 (Gemini) ---
  const processImage = async (file: File) => {
    setView('processing');
    setError(null);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
                  mimeType: file.type
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
      
      const responseText = response.text || '';
      const parsed = JSON.parse(responseText);

      setData({
        date: parsed.date || '',
        docNumber: parsed.docNumber || '',
        customerCode: parsed.customerCode || '',
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
      console.error(err);
      setError("사진 분석에 실패했습니다. 다시 시도해 주세요.");
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
    if (SCRIPT_URL === '여기에_구글_스크립트_URL을_넣으세요') {
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
        headers: { 'Content-Type': 'application/json' },
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
          <button className="p-2 hover:bg-orange-100 rounded-full transition-colors active:scale-95">
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
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-64 bg-[#f26522] border-4 border-[#261813] rounded-2xl shadow-[8px_8px_0px_#261813] flex flex-col items-center justify-center gap-4 active:translate-y-1 active:shadow-[4px_4px_0px_#261813] transition-all hover:bg-[#d8541a] group"
              >
                <Camera size={96} className="text-white group-hover:scale-110 transition-transform" strokeWidth={2} />
                <span className="text-4xl font-black text-white">사진 찍기</span>
              </button>

              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-64 bg-[#f26522] border-4 border-[#261813] rounded-2xl shadow-[8px_8px_0px_#261813] flex flex-col items-center justify-center gap-4 active:translate-y-1 active:shadow-[4px_4px_0px_#261813] transition-all hover:bg-[#d8541a] group"
              >
                <ImageIcon size={96} className="text-white group-hover:scale-110 transition-transform" strokeWidth={2} />
                <span className="text-4xl font-black text-white">앨범에서 선택</span>
              </button>

              <button 
                onClick={async (e) => {
                  e.preventDefault();
                  try {
                    const response = await fetch('/sample.jpg');
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
                className="w-full h-24 bg-white border-4 border-[#261813] rounded-2xl shadow-[8px_8px_0px_#261813] flex items-center justify-center gap-4 active:translate-y-1 active:shadow-[4px_4px_0px_#261813] transition-all hover:bg-orange-50 group"
              >
                <Download size={40} className="text-[#261813] group-hover:scale-110 transition-transform" strokeWidth={2.5} />
                <span className="text-3xl font-black text-[#261813]">샘플다운</span>
              </button>

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
                  if (file) processImage(file);
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

      {/* --- 하단 네비게이션 --- */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-4 border-[#261813] h-24 flex justify-around items-center px-4">
        <button className="flex flex-col items-center gap-1 opacity-50">
          <Home size={32} />
          <span className="text-lg font-bold">홈</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-[#f26522]">
          <ClipboardCheck size={32} strokeWidth={3} />
          <span className="text-lg font-black underline underline-offset-4">입고검수</span>
        </button>
        <button className="flex flex-col items-center gap-1 opacity-50">
          <Truck size={32} />
          <span className="text-lg font-bold">반품출고</span>
        </button>
        <button className="flex flex-col items-center gap-1 opacity-50">
          <Settings size={32} />
          <span className="text-lg font-bold">설정</span>
        </button>
      </nav>
    </div>
  );
}
