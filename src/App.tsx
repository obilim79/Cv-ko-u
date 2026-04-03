/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Loader2, 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  ChevronRight, 
  ArrowLeft, 
  AlertTriangle, 
  Image as ImageIcon, 
  Layout, 
  Minimize2, 
  ClipboardList 
} from 'lucide-react';

// --- Icons (Using Lucide-React as per guidelines) ---
const SparklesIcon = ({ className }: { className?: string }) => <Sparkles className={className} />;
const LoaderIcon = ({ className }: { className?: string }) => <Loader2 className={`animate-spin ${className}`} />;
const UploadCloudIcon = ({ className }: { className?: string }) => <UploadCloud className={className} />;
const PdfIcon = ({ className }: { className?: string }) => <FileText className={className} />;
const CheckCircleIcon = ({ className }: { className?: string }) => <CheckCircle2 className={className} />;
const ChevronRightIcon = ({ className }: { className?: string }) => <ChevronRight className={className} />;
const ArrowLeftIcon = ({ className }: { className?: string }) => <ArrowLeft className={className} />;
const AlertTriangleIcon = ({ className }: { className?: string }) => <AlertTriangle className={className} />;
const LayoutIcon = ({ className }: { className?: string }) => <Layout className={className} />;
const CompressIcon = ({ className }: { className?: string }) => <Minimize2 className={className} />;
const ClipboardListIcon = ({ className }: { className?: string }) => <ClipboardList className={className} />;

// --- Gemini API Setup ---
const MODEL_NAME = "gemini-3-flash-preview";

const safeArray = (data: any) => Array.isArray(data) ? data : (typeof data === 'string' ? data.split(',').map(i => i.trim()) : (data ? [String(data)] : []));

export default function App() {
  const [step, setStep] = useState('input');
  const [cvText, setCvText] = useState("");
  const [targetJob, setTargetJob] = useState("");
  const [pdfData, setPdfData] = useState<{ name: string, base64: string, mimeType: string } | null>(null);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [interviewData, setInterviewData] = useState<{ experiences: any[], questions: any[] }>({ experiences: [], questions: [] });
  const [userAnswers, setUserAnswers] = useState<Record<string, { done: boolean | null, expIds: string[] }>>({});
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<any>({ summary: true, experiences: {}, education: true, skills_and_languages: true, dynamic: {} });
  const [selectedTemplate, setSelectedTemplate] = useState('classic');
  const [compactMode, setCompactMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "text/plain") {
      const reader = new FileReader();
      reader.onload = (ev) => setCvText(prev => prev + "\n" + ev.target?.result);
      reader.readAsText(file);
    } else if (file.type === "application/pdf" || file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        setPdfData({ name: file.name, base64: result.split(',')[1], mimeType: file.type });
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoData(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  // --- 1. AŞAMA YAPAY ZEKA: 50 SORULUK MÜLAKAT ---
  const handleGenerateQuestions = async () => {
    if (!cvText.trim() && !pdfData) { setError("Lütfen işlem yapılacak bir CV yükleyin."); return; }
    setStep('generating_questions');
    setError(null);

    const systemPrompt = `
      Sen uzman bir Kariyer Koçusun. Kullanıcının CV'sini incele. 
      1. CV'deki "İş Deneyimleri"ni (Şirket adı ve Pozisyon olarak) tespit et.
      2. Kullanıcının hedeflenen pozisyonuna (veya mevcut sektörüne) uygun TAM OLARAK 50 ADET (ne 49 ne 51) spesifik, teknik soru / iş tanımı oluştur.
      (Örn: "Kurumlar Vergisi beyannamesi düzenlediniz mi?", "React Hook'ları ile state yönetimi yaptınız mı?")
      
      SADECE AŞAĞIDAKİ JSON ŞEMASINDA YANIT VER.
      {
        "extracted_experiences": [
          { "id": "exp_1", "label": "Firma Adı - Pozisyon" }
        ],
        "questions": [
          { "id": "q1", "text": "Soru 1" }
        ]
      }
    `;

    const parts: any[] = [];
    if (targetJob) parts.push({ text: `Hedef Pozisyon: ${targetJob}` });
    if (cvText) parts.push({ text: `CV Metni:\n${cvText}` });
    if (pdfData) parts.push({ inlineData: { mimeType: pdfData.mimeType, data: pdfData.base64 } });

    try {
      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts, systemPrompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate questions");
      }

      const result = await response.json();
      const data = JSON.parse(result.text || "{}");
      const experiences = safeArray(data.extracted_experiences);
      experiences.unshift({ id: "general", label: "Tüm Kariyerim / Genel Yetenek" });

      setInterviewData({ experiences: experiences, questions: safeArray(data.questions) });

      const initialAnswers: any = {};
      safeArray(data.questions).forEach((q: any) => { initialAnswers[q.id] = { done: null, expIds: [] }; });
      setUserAnswers(initialAnswers);

      setStep('questionnaire');
    } catch (err: any) {
      console.error(err);
      setError(`Mülakat hazırlanırken hata oluştu: ${err.message}`);
      setStep('input');
    }
  };

  const handleAnswerChange = (qId: string, isDone: boolean) => {
    setUserAnswers(prev => ({
      ...prev, [qId]: { done: isDone, expIds: isDone ? prev[qId].expIds : [] }
    }));
  };

  const toggleExperienceForQuestion = (qId: string, expId: string) => {
    setUserAnswers(prev => {
      const currentExpIds = prev[qId].expIds || [];
      const newExpIds = currentExpIds.includes(expId)
        ? currentExpIds.filter(id => id !== expId)
        : [...currentExpIds, expId];
      return { ...prev, [qId]: { ...prev[qId], expIds: newExpIds } };
    });
  };

  // --- 2. AŞAMA YAPAY ZEKA: CV İNŞASI ---
  const handleAnalyzeAndBuild = async () => {
    setStep('analyzing');
    setError(null);

    const confirmedList = interviewData.questions
      .filter(q => userAnswers[q.id]?.done === true)
      .map(q => {
        const expLabels = userAnswers[q.id].expIds.map(eId => interviewData.experiences.find(e => e.id === eId)?.label || "Genel");
        const labelStr = expLabels.length > 0 ? expLabels.join(", ") : "Genel";
        return `[${labelStr}] -> ${q.text}`;
      });

    const systemPrompt = `
      Sen İK Uzmanısın. Kullanıcının CV'sini ve KULLANICININ ONAYLADIĞI İŞLERİ dikkate alarak CV'yi yeniden inşa et.
      
      KULLANICININ ONAYLADIĞI İŞLER (Hangi Şirkette Yapıldığı Belirtilmiştir):
      ${confirmedList.length > 0 ? confirmedList.join('\n') : 'Ekstra mülakat verisi yok.'}

      GÖREVLER:
      1. EĞİTİM, Yetenekler, Sertifikalar vb. TÜM başlıkları bul.
      2. Kullanıcının onayladığı işleri, DİREKT olarak belirttiği şirketlerin altına "Başarı/Görev" maddesi olarak ekle.
      3. UZUNLUK: Güncel işleri detaylandır, ÇOK ESKİ işleri 1 cümleye indirge (Maks 2 sayfa).
      
      JSON ŞEMASI:
      {
        "general_review": "Yorum",
        "personal_info": { "fullName": "Ad Soyad", "title": "Unvan", "contact": "E-posta | Tel | Adres" },
        "summary": { "original": "Mevcut", "critique": "Yorum", "proposed": "Yeni" },
        "experiences": [{ "id": "exp_1", "company": "Şirket", "title": "Pozisyon", "date": "Tarih", "original_desc": "Mevcut", "critique": "Yorum", "proposed_achievements": ["Madde 1"] }],
        "education": { "original": "Mevcut", "critique": "Yorum", "proposed_list": [{ "degree": "Derece", "school": "Okul", "date": "Tarih" }] },
        "skills_and_languages": { "original": ["Mevcut"], "critique": "Yorum", "proposed": ["Yetenek 1"] },
        "dynamic_sections": [{ "id": "sec_1", "title": "Sertifikalar", "original_desc": "Mevcut", "critique": "Yorum", "proposed_items": ["Madde 1"] }]
      }
    `;

    const parts: any[] = [];
    if (cvText) parts.push({ text: `Mevcut CV Metni:\n${cvText}` });
    if (pdfData) parts.push({ inlineData: { mimeType: pdfData.mimeType, data: pdfData.base64 } });

    try {
      const response = await fetch("/api/analyze-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts, systemPrompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to analyze CV");
      }

      const result = await response.json();
      const data = JSON.parse(result.text || "{}");

      data.personal_info = data.personal_info || { fullName: "İsim", title: "", contact: "" };
      data.summary = data.summary || { original: "", critique: "", proposed: "" };
      data.experiences = safeArray(data.experiences).map((e: any, i: number) => ({ ...e, id: e.id || `exp_final_${i}`, proposed_achievements: safeArray(e.proposed_achievements) }));
      data.education = data.education || { original: "", critique: "", proposed_list: [] };
      data.education.proposed_list = safeArray(data.education.proposed_list);
      data.skills_and_languages = data.skills_and_languages || { original: [], critique: "", proposed: [] };
      data.skills_and_languages.proposed = safeArray(data.skills_and_languages.proposed);
      data.dynamic_sections = safeArray(data.dynamic_sections).map((s: any, i: number) => ({ ...s, id: s.id || `dyn_${i}`, proposed_items: safeArray(s.proposed_items) }));

      setAnalysisData(data);
      const initSel: any = { summary: true, experiences: {}, education: true, skills_and_languages: true, dynamic: {} };
      data.experiences.forEach((e: any) => initSel.experiences[e.id] = true);
      data.dynamic_sections.forEach((s: any) => initSel.dynamic[s.id] = true);
      setSelections(initSel);
      setStep('review');
    } catch (err) {
      console.error(err);
      setError(`CV oluşturulurken bir hata oluştu.`);
      setStep('questionnaire');
    }
  };

  const setSelectionValue = (category: string, id: string | null, value: boolean) => {
    if (id !== null) setSelections((prev: any) => ({ ...prev, [category]: { ...prev[category], [id]: value } }));
    else setSelections((prev: any) => ({ ...prev, [category]: value }));
  };

  const PhotoRenderer = ({ templateClass }: { templateClass: string }) => photoData ? <div className={templateClass}><img src={photoData} alt="Profile" className="w-full h-full object-cover" /></div> : null;

  const WordPageDividers = () => (
    <>
      {[1, 2, 3].map(page => (
        <div
          key={page}
          style={{ top: `${page * 297}mm` }}
          className="absolute left-[-10vw] right-[-10vw] h-10 bg-slate-900 flex items-center justify-center z-50 pointer-events-none shadow-[inset_0_5px_10px_rgba(0,0,0,0.5)]"
        >
          <span className="text-[11px] text-slate-500 font-bold tracking-[0.2em] px-4 py-1 border border-slate-700 rounded-full bg-slate-800 uppercase shadow-lg">
            Sayfa {page + 1}
          </span>
        </div>
      ))}
    </>
  );

  const renderTemplate = () => {
    if (!analysisData) return null;
    const { personal_info, summary, experiences, education, skills_and_languages, dynamic_sections } = analysisData;
    const finalSummary = selections.summary ? summary.proposed : summary.original;
    const finalSkills = selections.skills_and_languages ? safeArray(skills_and_languages.proposed) : safeArray(skills_and_languages.original);
    const finalEducation = selections.education ? safeArray(education.proposed_list) : [{ degree: education.original || "", school: "", date: "" }];
    const finalExperiences = experiences.map((exp: any) => ({ ...exp, finalDesc: selections.experiences[exp.id] ? safeArray(exp.proposed_achievements) : safeArray(exp.original_desc) }));
    const finalDynamics = dynamic_sections.map((sec: any) => ({ ...sec, finalDesc: selections.dynamic[sec.id] ? safeArray(sec.proposed_items) : safeArray(sec.original_desc) }));
    const contactText = typeof personal_info.contact === 'string' ? personal_info.contact : "";

    const wrapperClass = `cv-a4-paper text-slate-800 font-sans ${compactMode ? 'cv-compact-mode' : ''}`;

    if (selectedTemplate === 'modern') {
      return (
        <div className={wrapperClass}>
          <WordPageDividers />
          <div className="flex w-full min-h-full">
            <div className="w-[35%] bg-slate-800 text-white p-[8mm] flex flex-col gap-6 relative z-10">
              <div className="flex flex-col items-center mb-2">
                <PhotoRenderer templateClass="w-32 h-32 rounded-full border-4 border-slate-600 overflow-hidden mb-4 shadow-lg" />
                <h1 className="text-2xl font-bold leading-tight mb-1 text-center">{personal_info.fullName || "İsimsiz Aday"}</h1>
                <h2 className="text-blue-400 font-medium text-sm text-center">{personal_info.title || ""}</h2>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-2 border-b border-slate-600 pb-1">İletişim</h3>
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{contactText.replace(/ \| /g, '\n')}</p>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-2 border-b border-slate-600 pb-1">Yetenekler & Diller</h3>
                <div className="flex flex-wrap gap-1.5">
                  {finalSkills.map((s: string, i: number) => <span key={i} className="bg-slate-700/50 px-2 py-1 rounded text-[11px] font-medium leading-none">{s}</span>)}
                </div>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-2 border-b border-slate-600 pb-1">Eğitim</h3>
                <div className="space-y-3">
                  {finalEducation.map((edu: any, i: number) => (
                    <div key={i}>
                      <p className="font-bold text-[12px] leading-snug">{edu.degree || ""}</p>
                      <p className="text-[11px] text-slate-300 mt-0.5">{edu.school || ""}</p>
                      <p className="text-[10px] text-blue-400 mt-0.5">{edu.date || ""}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="w-[65%] p-[10mm] bg-white relative z-0">
              {finalSummary && finalSummary !== "Belirtilmemiş" && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><span className="w-6 h-0.5 bg-blue-500 rounded"></span> Profil Özeti</h3>
                  <p className="text-xs text-slate-600 leading-relaxed text-justify">{finalSummary}</p>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><span className="w-6 h-0.5 bg-blue-500 rounded"></span> İş Deneyimi</h3>
                <div className="space-y-5">
                  {finalExperiences.map((exp: any, i: number) => (
                    <div key={i} className="relative pl-3 border-l-2 border-slate-200">
                      <div className="absolute w-2.5 h-2.5 bg-blue-500 rounded-full -left-[6px] top-1"></div>
                      <div className="flex justify-between items-start mb-0.5">
                        <h4 className="font-bold text-sm text-slate-800">{exp.title}</h4>
                        {exp.date && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full whitespace-nowrap">{exp.date}</span>}
                      </div>
                      <h5 className="text-[12px] font-semibold text-slate-500 mb-1.5">{exp.company}</h5>
                      <ul className="list-disc list-outside ml-3 space-y-0.5 text-[11.5px] text-slate-600">
                        {exp.finalDesc.map((desc: string, j: number) => <li key={j} className="leading-snug text-justify">{desc}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
              {finalDynamics.map((sec: any, i: number) => (
                <div key={i} className="mb-6">
                  <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2"><span className="w-6 h-0.5 bg-blue-500 rounded"></span> {sec.title}</h3>
                  <ul className="list-disc list-outside ml-3 space-y-1 text-[11.5px] text-slate-600">
                    {sec.finalDesc.map((desc: string, j: number) => <li key={j} className="leading-snug text-justify">{desc}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (selectedTemplate === 'classic') {
      return (
        <div className={`${wrapperClass} text-slate-900 font-serif`}>
          <WordPageDividers />
          <div className="p-[15mm] relative z-10">
            <div className="flex items-center gap-6 mb-8 border-b-2 border-slate-900 pb-6">
              <PhotoRenderer templateClass="w-28 h-28 border border-slate-300 p-1 bg-white shadow-sm flex-shrink-0" />
              <div className={`${photoData ? 'text-left' : 'text-center w-full'}`}>
                <h1 className="text-3xl font-bold uppercase tracking-wide mb-1">{personal_info.fullName || "İsimsiz Aday"}</h1>
                <h2 className="text-lg italic text-slate-600 mb-2">{personal_info.title || ""}</h2>
                <p className="text-[11px] font-sans text-slate-600 leading-snug whitespace-pre-wrap">{contactText.replace(/ \| /g, ' • ')}</p>
              </div>
            </div>
            {finalSummary && finalSummary !== "Belirtilmemiş" && (
              <div className="mb-5">
                <h3 className="text-sm font-bold uppercase border-b border-slate-400 mb-2 pb-1 text-slate-800">Profesyonel Özet</h3>
                <p className="text-[12px] leading-relaxed text-slate-800 text-justify">{finalSummary}</p>
              </div>
            )}
            <div className="mb-5">
              <h3 className="text-sm font-bold uppercase border-b border-slate-400 mb-3 pb-1 text-slate-800">Profesyonel Deneyim</h3>
              <div className="space-y-4">
                {finalExperiences.map((exp: any, i: number) => (
                  <div key={i}>
                    <div className="flex justify-between items-end mb-1">
                      <h4 className="font-bold text-[13px]">{exp.title} <span className="font-normal italic text-slate-600">| {exp.company}</span></h4>
                      <span className="text-[11px] font-sans font-medium">{exp.date}</span>
                    </div>
                    <ul className="list-disc list-outside ml-4 space-y-0.5 text-[11.5px] text-slate-800 font-sans">
                      {exp.finalDesc.map((desc: string, j: number) => <li key={j} className="leading-snug text-justify">{desc}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 mb-5">
              <div>
                <h3 className="text-sm font-bold uppercase border-b border-slate-400 mb-2 pb-1 text-slate-800">Eğitim</h3>
                <div className="space-y-2">
                  {finalEducation.map((edu: any, i: number) => (
                    <div key={i}>
                      <h4 className="font-bold text-[12px] leading-snug">{edu.degree}</h4>
                      <p className="text-[11px] text-slate-700">{edu.school}</p>
                      <p className="text-[10px] font-sans text-slate-500">{edu.date}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase border-b border-slate-400 mb-2 pb-1 text-slate-800">Yetenekler & Diller</h3>
                <p className="text-[11.5px] leading-relaxed font-sans text-slate-700">{finalSkills.join(" • ")}</p>
              </div>
            </div>
            {finalDynamics.map((sec: any, i: number) => (
              <div key={i} className="mb-5">
                <h3 className="text-sm font-bold uppercase border-b border-slate-400 mb-2 pb-1 text-slate-800">{sec.title}</h3>
                <ul className="list-disc list-outside ml-4 space-y-0.5 text-[11.5px] text-slate-800 font-sans">
                  {sec.finalDesc.map((desc: string, j: number) => <li key={j} className="leading-snug text-justify">{desc}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className={`${wrapperClass} font-sans tracking-wide`}>
        <WordPageDividers />
        <div className="p-[15mm] relative z-10">
          <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-6">
               <PhotoRenderer templateClass="w-24 h-24 rounded-2xl shadow-md object-cover flex-shrink-0" />
               <div>
                 <h1 className="text-3xl font-light tracking-tighter text-black mb-1">{personal_info.fullName || "İsimsiz Aday"}</h1>
                 <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">{personal_info.title || ""}</h2>
               </div>
            </div>
            <div className="text-right text-[10px] text-slate-500 leading-relaxed mt-2">
              {contactText.split(' | ').map((line: string, i: number) => <div key={i}>{line}</div>)}
            </div>
          </div>
          {finalSummary && finalSummary !== "Belirtilmemiş" && (
            <div className="grid grid-cols-12 gap-6 mb-6">
              <div className="col-span-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 pt-0.5">Hakkımda</div>
              <div className="col-span-9 text-[11.5px] leading-relaxed text-slate-600 text-justify">{finalSummary}</div>
            </div>
          )}
          <div className="grid grid-cols-12 gap-6 mb-6">
            <div className="col-span-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 pt-0.5">Deneyim</div>
            <div className="col-span-9 space-y-6">
              {finalExperiences.map((exp: any, i: number) => (
                <div key={i}>
                  <div className="mb-1.5">
                    <h4 className="font-bold text-black text-[13px]">{exp.title}</h4>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{exp.company} {exp.date && `• ${exp.date}`}</div>
                  </div>
                  <div className="text-[11.5px] text-slate-600 space-y-1.5">
                    {exp.finalDesc.map((desc: string, j: number) => (
                      <p key={j} className="relative pl-3 before:content-[''] before:absolute before:left-0 before:top-1.5 before:w-1 before:h-1 before:bg-slate-300 before:rounded-full text-justify">{desc}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-12 gap-6 mb-6">
            <div className="col-span-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 pt-0.5">Eğitim</div>
            <div className="col-span-9 space-y-3">
              {finalEducation.map((edu: any, i: number) => (
                <div key={i}>
                  <h4 className="font-bold text-black text-xs">{edu.degree}</h4>
                  <p className="text-[10px] text-slate-500">{edu.school} {edu.date && `• ${edu.date}`}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-12 gap-6 mb-6">
            <div className="col-span-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 pt-0.5">Yetenekler</div>
            <div className="col-span-9 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-slate-600">
              {finalSkills.map((s: string, i: number) => <span key={i}>{s}</span>)}
            </div>
          </div>
          {finalDynamics.map((sec: any, i: number) => (
            <div key={i} className="grid grid-cols-12 gap-6 mb-6">
              <div className="col-span-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 pt-0.5">{sec.title}</div>
              <div className="col-span-9 space-y-1.5 text-[11.5px] text-slate-600">
                {sec.finalDesc.map((desc: string, j: number) => (
                  <p key={j} className="relative pl-3 before:content-[''] before:absolute before:left-0 before:top-1.5 before:w-1 before:h-1 before:bg-slate-300 before:rounded-full text-justify">{desc}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (step === 'final') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col font-sans overflow-hidden">
        <header className="h-16 bg-slate-800 border-b border-slate-700 flex justify-between items-center px-4 md:px-8 flex-shrink-0 shadow-lg z-50 relative">
          <button onClick={() => setStep('review')} className="flex items-center gap-2 text-slate-300 hover:text-white font-medium transition-colors">
            <ArrowLeftIcon className="w-5 h-5" /> Geri Dön
          </button>

          <div className="flex items-center gap-1 bg-slate-700 p-1 rounded-lg overflow-x-auto mx-2 shadow-inner">
            <LayoutIcon className="w-4 h-4 text-slate-400 ml-2" />
            <button onClick={() => setSelectedTemplate('modern')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${selectedTemplate === 'modern' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'}`}>Modern</button>
            <button onClick={() => setSelectedTemplate('classic')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${selectedTemplate === 'classic' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'}`}>Klasik</button>
            <button onClick={() => setSelectedTemplate('minimal')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${selectedTemplate === 'minimal' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'}`}>Minimal</button>
            
            <div className="w-px h-6 bg-slate-600 mx-2"></div>
            <button onClick={() => setCompactMode(!compactMode)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold transition-colors ${compactMode ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}>
              <CompressIcon className="w-4 h-4" /> {compactMode ? 'Sıkıştırıldı' : 'Sığdır'}
            </button>
          </div>
          <div className="w-24"></div>
        </header>

        <main className="flex-1 overflow-auto flex justify-center items-start pt-12 pb-16 bg-slate-900 custom-scrollbar relative z-0">
          {renderTemplate()}
        </main>

        <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; } .custom-scrollbar::-webkit-scrollbar-track { background: #0f172a; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 5px; border: 2px solid #0f172a; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }`}} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg"><SparklesIcon className="w-6 h-6"/></div>
            <h1 className="text-xl font-bold">Kariyer Koçu & CV Mülakatı</h1>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`px-3 py-1 rounded-full ${step === 'input' ? 'bg-blue-100 text-blue-700' : 'text-slate-400'}`}>1. Yükle</span>
            <ChevronRightIcon className="w-4 h-4 text-slate-300" />
            <span className={`px-3 py-1 rounded-full ${(step === 'generating_questions' || step === 'questionnaire') ? 'bg-blue-100 text-blue-700' : 'text-slate-400'}`}>2. Mülakat</span>
            <ChevronRightIcon className="w-4 h-4 text-slate-300" />
            <span className={`px-3 py-1 rounded-full ${(step === 'analyzing' || step === 'review') ? 'bg-blue-100 text-blue-700' : 'text-slate-400'}`}>3. Onayla</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {step === 'input' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">Mülakat ile CV'nizi Mükemmelleştirelim</h2>
              <p className="text-slate-500">Robot, sektörünüze özel mülakat soruları (Tam 50 adet) hazırlayıp CV'nizi uzman seviyesine çekecek.</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-4 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex-shrink-0 w-16 h-16 rounded-full bg-slate-200 border-2 border-dashed border-slate-400 flex items-center justify-center overflow-hidden cursor-pointer" onClick={() => photoInputRef.current?.click()}>
                  {photoData ? <img src={photoData} alt="Vesikalık" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-slate-400" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-700 text-sm">Vesikalık Fotoğraf</h3>
                  <input type="file" ref={photoInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
                  <button onClick={() => photoInputRef.current?.click()} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full hover:bg-blue-100 mt-2">Fotoğraf Seç</button>
                </div>
              </div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Hedef Pozisyon / Sektör</label>
              <input type="text" value={targetJob} onChange={(e) => setTargetJob(e.target.value)} placeholder="Örn: Muhasebe Uzmanı, Yazılım Geliştirici..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none mb-6" />
              <label className="block text-sm font-bold text-slate-700 mb-2">CV Dosyanız (Veya Resmi)</label>
              <div className="border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-slate-50 rounded-xl p-6 text-center cursor-pointer transition-colors mb-4" onClick={() => fileInputRef.current?.click()}>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.txt,image/*" className="hidden" />
                <UploadCloudIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-medium text-slate-700">PDF, TXT veya JPG seçmek için tıklayın</p>
              </div>
              {pdfData && (
                <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg mb-4 border border-indigo-100">
                  <div className="flex items-center gap-2 text-indigo-700 font-medium"><PdfIcon className="w-5 h-5"/> {pdfData.name}</div>
                  <button onClick={() => setPdfData(null)} className="text-red-500 text-sm hover:underline font-medium">Kaldır</button>
                </div>
              )}
              {error && <div className="mt-4 p-4 text-sm text-red-700 bg-red-50 rounded-xl flex items-start gap-3"><AlertTriangleIcon className="w-5 h-5 flex-shrink-0" /> <p>{error}</p></div>}
              <button onClick={handleGenerateQuestions} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-transform active:scale-95 flex justify-center items-center gap-2">
                <ClipboardListIcon className="w-5 h-5" /> Sektörel Mülakatı Başlat
              </button>
            </div>
          </div>
        )}

        {step === 'generating_questions' && (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse">
            <LoaderIcon className="w-16 h-16 text-blue-600 mb-6" />
            <h2 className="text-2xl font-bold text-slate-800 text-center">Sektörünüz Analiz Ediliyor...</h2>
            <p className="text-slate-500 mt-3 max-w-md text-center">Mesleğinize özel tam 50 adet teknik mülakat sorusu hazırlanıyor...</p>
          </div>
        )}

        {step === 'questionnaire' && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
            <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-lg mb-6">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-2"><ClipboardListIcon className="w-7 h-7"/> CV Zenginleştirme Mülakatı</h2>
              <p className="text-indigo-100 leading-relaxed">Geçmiş işlerinizde yaptıklarınızı "Yaptım" olarak işaretleyin ve <strong>Hangi Şirketlerde/Tecrübelerde</strong> yaptığınızı seçin (Birden fazla seçebilirsiniz).</p>
            </div>
            
            <div className="space-y-4">
              {interviewData.questions.map((q, idx) => {
                const isDone = userAnswers[q.id]?.done;
                const selectedExpIds = userAnswers[q.id]?.expIds || [];
                
                return (
                  <div key={q.id} className={`bg-white rounded-xl p-5 border-2 transition-colors flex flex-col gap-4 ${isDone === true ? 'border-green-500 shadow-md' : isDone === false ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <p className="text-slate-800 font-medium text-sm md:text-base leading-snug pr-4">{idx + 1}. {q.text}</p>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => handleAnswerChange(q.id, true)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${isDone === true ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>✓ Yaptım</button>
                        <button onClick={() => handleAnswerChange(q.id, false)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${isDone === false ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>✗ Yapmadım</button>
                      </div>
                    </div>

                    {isDone && (
                      <div className="pt-3 border-t border-slate-100 animate-in fade-in">
                        <span className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Hangi Tecrübelerinizde Yaptınız? (Birden fazla seçebilirsiniz)</span>
                        <div className="flex flex-wrap gap-2">
                          {interviewData.experiences.map(exp => {
                            const isSelected = selectedExpIds.includes(exp.id);
                            return (
                              <button
                                key={exp.id}
                                onClick={() => toggleExperienceForQuestion(q.id, exp.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                                  isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                {isSelected && "✓ "} {exp.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
            
            <div className="mt-10 mb-20 text-center border-t border-slate-200 pt-8">
              <button onClick={handleAnalyzeAndBuild} className="bg-slate-900 hover:bg-slate-800 text-white text-lg font-bold py-4 px-12 rounded-xl shadow-xl transition-transform active:scale-95 flex items-center gap-2 mx-auto">
                Mülakatı Bitir ve Analize Geç <ChevronRightIcon className="w-5 h-5"/>
              </button>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse">
            <LoaderIcon className="w-16 h-16 text-blue-600 mb-6" />
            <h2 className="text-2xl font-bold text-slate-800 text-center">Tasarım İnşa Ediliyor...</h2>
            <p className="text-slate-500 mt-3 max-w-md text-center">Seçtiğiniz tüm yetenekler belirttiğiniz şirketlerin altına özel olarak yerleştiriliyor...</p>
          </div>
        )}

        {step === 'review' && analysisData && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg mb-8">
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><CheckCircleIcon className="w-6 h-6"/> CV İncelemesi Tamamlandı</h2>
              <p className="text-blue-100 leading-relaxed mb-4">{analysisData.general_review}</p>
            </div>
            <div className="space-y-6">
              
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200"><h4 className="font-bold text-lg text-slate-800">Profesyonel Özet</h4></div>
                <div className="p-6 grid md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-400">Mevcut</span>
                    <p className="mt-1 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg mb-4">{analysisData.summary.original}</p>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex-grow">
                      <span className="text-xs font-bold uppercase text-green-600">Önerilen</span>
                      <p className="mt-1 text-sm text-slate-800 bg-green-50 p-4 rounded-lg font-medium">{analysisData.summary.proposed}</p>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => setSelectionValue('summary', null, true)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${selections.summary ? 'bg-green-600 text-white' : 'bg-white text-slate-500'}`}>Öneriyi Kullan</button>
                      <button onClick={() => setSelectionValue('summary', null, false)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${!selections.summary ? 'bg-slate-700 text-white' : 'bg-white text-slate-500'}`}>Eskiyi Koru</button>
                    </div>
                  </div>
                </div>
              </div>

              {safeArray(analysisData.experiences).map((exp: any) => (
                <div key={exp.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200"><h4 className="font-bold text-lg text-slate-800">Deneyim: {exp.title}</h4></div>
                  <div className="p-6 grid md:grid-cols-2 gap-6">
                    <div>
                      <span className="text-xs font-bold uppercase text-slate-400">Mevcut</span>
                      <p className="mt-1 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg mb-4 whitespace-pre-wrap">{exp.original_desc}</p>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex-grow">
                        <span className="text-xs font-bold uppercase text-green-600">Önerilen (Mülakat Verileriyle)</span>
                        <ul className="mt-1 text-sm text-slate-800 bg-green-50 p-4 rounded-lg list-disc list-inside space-y-2 border border-green-200">
                          {safeArray(exp.proposed_achievements).map((ach: string, idx: number) => <li key={idx}>{ach}</li>)}
                        </ul>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => setSelectionValue('experiences', exp.id, true)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${selections.experiences[exp.id] ? 'bg-green-600 text-white' : 'bg-white text-slate-500'}`}>Öneriyi Kullan</button>
                        <button onClick={() => setSelectionValue('experiences', exp.id, false)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${!selections.experiences[exp.id] ? 'bg-slate-700 text-white' : 'bg-white text-slate-500'}`}>Eskiyi Koru</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200"><h4 className="font-bold text-lg text-slate-800">Eğitim Bilgileri</h4></div>
                <div className="p-6 grid md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-400">Mevcut</span>
                    <p className="mt-1 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg mb-4">{analysisData.education.original}</p>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex-grow">
                      <span className="text-xs font-bold uppercase text-green-600">Önerilen</span>
                      <div className="mt-1 text-sm text-slate-800 bg-green-50 p-4 rounded-lg space-y-2">
                         {safeArray(analysisData.education.proposed_list).map((edu: any, idx: number) => <div key={idx}><strong>{edu.degree}</strong> - {edu.school}</div>)}
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => setSelectionValue('education', null, true)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${selections.education ? 'bg-green-600 text-white' : 'bg-white text-slate-500'}`}>Öneriyi Kullan</button>
                      <button onClick={() => setSelectionValue('education', null, false)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${!selections.education ? 'bg-slate-700 text-white' : 'bg-white text-slate-500'}`}>Eskiyi Koru</button>
                    </div>
                  </div>
                </div>
              </div>

              {safeArray(analysisData.dynamic_sections).map((sec: any) => (
                <div key={sec.id} className="bg-white rounded-2xl shadow-sm border border-slate-400 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200"><h4 className="font-bold text-lg text-slate-800">{sec.title}</h4></div>
                  <div className="p-6 grid md:grid-cols-2 gap-6">
                    <div>
                      <span className="text-xs font-bold uppercase text-slate-400">Mevcut</span>
                      <p className="mt-1 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg mb-4 whitespace-pre-wrap">{sec.original_desc}</p>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex-grow">
                        <span className="text-xs font-bold uppercase text-green-600">Önerilen</span>
                        <ul className="mt-1 text-sm text-slate-800 bg-green-50 p-4 rounded-lg list-disc list-inside space-y-2">
                          {safeArray(sec.proposed_items).map((item: string, idx: number) => <li key={idx}>{item}</li>)}
                        </ul>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => setSelectionValue('dynamic', sec.id, true)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${selections.dynamic[sec.id] ? 'bg-green-600 text-white' : 'bg-white text-slate-500'}`}>Öneriyi Kullan</button>
                        <button onClick={() => setSelectionValue('dynamic', sec.id, false)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${!selections.dynamic[sec.id] ? 'bg-slate-700 text-white' : 'bg-white text-slate-500'}`}>Eskiyi Koru</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            </div>
            <div className="mt-10 mb-20 text-center border-t border-slate-200 pt-8">
              <button onClick={() => setStep('final')} className="bg-slate-900 hover:bg-slate-800 text-white text-lg font-bold py-4 px-12 rounded-xl shadow-xl transition-transform active:scale-95 flex items-center gap-2 mx-auto">
                Önizlemeyi Göster (Word Düzeni) <ChevronRightIcon className="w-5 h-5"/>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
